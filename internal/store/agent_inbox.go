package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// The agent inbox (SPEC-15, TASK-17): every event an agent must see about the
// items assigned to it, numbered per agent, delivered in batches it
// acknowledges. Nothing is lost while the agent is away: an event waits in
// agent_inbox until a batch carrying it is acknowledged.
//
// The cursor lives on workspace_agents:
//   - last_seq       the highest seq enqueued
//   - acked_seq      the highest seq the agent acknowledged
//   - batch_id       the outstanding batch, replayed until acknowledged
//   - batch_end_seq  the last seq in that batch
//   - acked_batch_id the batch acknowledged last, so repeating that ack is safe

const (
	// AgentInboxBatchSize caps one batch, as Radio's ten.
	AgentInboxBatchSize = 10

	AgentEventAssigned = "assigned"
	AgentEventStatus   = "status"
	AgentEventComment  = "comment"
)

// ErrAgentBatchUnknown answers an ackBatch that is neither the outstanding
// batch nor the one acknowledged last.
var ErrAgentBatchUnknown = errors.New("unknown or stale ackBatch")

// AgentInboxEvent is one event in a batch.
type AgentInboxEvent struct {
	Seq       int64           `json:"seq"`
	Kind      string          `json:"kind"`
	ItemID    string          `json:"item_id"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt time.Time       `json:"created_at"`
}

// AgentInboxBatch is one activity answer. BatchID is empty when there was
// nothing to deliver.
type AgentInboxBatch struct {
	BatchID         string
	Events          []AgentInboxEvent
	RemainingUnread int64
}

// AgentInboxTarget names the agent an event about itemID is for: the agent
// whose bot is userID in workspaceID, or, when userID is empty, the agent the
// item is assigned to now. It returns "" when no live agent is concerned.
func (s *Store) AgentInboxTarget(workspaceID, itemID, userID string) (agentID, agentUserID string, err error) {
	query := `SELECT a.id, a.user_id FROM workspace_agents a WHERE a.workspace_id = ? AND a.user_id = ? AND a.revoked_at IS NULL`
	args := []any{workspaceID, userID}
	if userID == "" {
		query = `SELECT a.id, a.user_id FROM items i JOIN workspace_agents a ON a.user_id = i.assigned_user_id
			WHERE i.id = ? AND a.workspace_id = ? AND a.revoked_at IS NULL`
		args = []any{itemID, workspaceID}
	}
	err = s.db.QueryRow(s.q(query), args...).Scan(&agentID, &agentUserID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", nil
	}
	if err != nil {
		return "", "", fmt.Errorf("agent inbox target: %w", err)
	}
	return agentID, agentUserID, nil
}

// EnqueueAgentEvent appends one event to an agent's inbox.
func (s *Store) EnqueueAgentEvent(agentID, kind, itemID string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("enqueue agent event: %w", err)
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var last int64
	if err := tx.QueryRow(s.q(`SELECT last_seq FROM workspace_agents WHERE id = ? AND revoked_at IS NULL`+s.forUpdate()), agentID).Scan(&last); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil // revoked or gone: nobody to tell
		}
		return fmt.Errorf("enqueue agent event: %w", err)
	}
	seq := last + 1
	if _, err := tx.Exec(s.q(`
		INSERT INTO agent_inbox (id, agent_id, seq, kind, item_id, payload, dedupe_key, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`), newID(), agentID, seq, kind, itemID, string(body), newID(), nowNano()); err != nil {
		return fmt.Errorf("enqueue agent event: insert: %w", err)
	}
	if _, err := tx.Exec(s.q(`UPDATE workspace_agents SET last_seq = ? WHERE id = ?`), seq, agentID); err != nil {
		return fmt.Errorf("enqueue agent event: cursor: %w", err)
	}
	return tx.Commit()
}

func (s *Store) forUpdate() string {
	if s.dialect.Driver() == DriverPostgres {
		return ` FOR UPDATE`
	}
	return ""
}

// NextAgentBatch acknowledges ack (when given) and answers the batch the agent
// should handle next: the outstanding one again if it is not acknowledged, or
// up to AgentInboxBatchSize new events. Repeating the last acknowledgment is
// safe: it recovers the next batch without acknowledging it.
func (s *Store) NextAgentBatch(agentID, ack string) (*AgentInboxBatch, error) {
	ack = strings.TrimSpace(ack)
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var acked, batchEnd, last int64
	var batchID, ackedBatch sql.NullString
	if err := tx.QueryRow(s.q(`SELECT acked_seq, batch_id, batch_end_seq, acked_batch_id, last_seq FROM workspace_agents WHERE id = ?`+s.forUpdate()), agentID).
		Scan(&acked, &batchID, &batchEnd, &ackedBatch, &last); err != nil {
		return nil, fmt.Errorf("agent batch: %w", err)
	}

	if ack != "" {
		switch {
		case batchID.Valid && ack == batchID.String:
			acked = batchEnd
			if _, err := tx.Exec(s.q(`UPDATE workspace_agents SET acked_seq = ?, acked_batch_id = ?, batch_id = NULL WHERE id = ?`), acked, ack, agentID); err != nil {
				return nil, fmt.Errorf("agent batch: ack: %w", err)
			}
			// An acknowledged event is never delivered again, so its row goes.
			if _, err := tx.Exec(s.q(`DELETE FROM agent_inbox WHERE agent_id = ? AND seq <= ?`), agentID, acked); err != nil {
				return nil, fmt.Errorf("agent batch: prune: %w", err)
			}
			batchID = sql.NullString{}
		case ackedBatch.Valid && ack == ackedBatch.String:
			// A retry of the last ack: answer the next batch, acknowledge nothing.
		default:
			return nil, ErrAgentBatchUnknown
		}
	}

	if batchID.Valid {
		events, err := s.agentEventsQ(tx, agentID, acked, batchEnd)
		if err != nil {
			return nil, err
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return &AgentInboxBatch{BatchID: batchID.String, Events: events, RemainingUnread: last - batchEnd}, nil
	}

	events, err := s.agentEventsQ(tx, agentID, acked, 0)
	if err != nil {
		return nil, err
	}
	if len(events) == 0 {
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return &AgentInboxBatch{Events: []AgentInboxEvent{}}, nil
	}
	end := events[len(events)-1].Seq
	id := "b_" + strings.ReplaceAll(newID(), "-", "")[:16]
	if _, err := tx.Exec(s.q(`UPDATE workspace_agents SET batch_id = ?, batch_end_seq = ? WHERE id = ?`), id, end, agentID); err != nil {
		return nil, fmt.Errorf("agent batch: open: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &AgentInboxBatch{BatchID: id, Events: events, RemainingUnread: last - end}, nil
}

// agentEventsQ reads events after `after`, through `through` when it is not
// zero, else at most one batch's worth.
func (s *Store) agentEventsQ(q Queryer, agentID string, after, through int64) ([]AgentInboxEvent, error) {
	query := `SELECT seq, kind, item_id, payload, created_at FROM agent_inbox WHERE agent_id = ? AND seq > ?`
	args := []any{agentID, after}
	if through > 0 {
		query += ` AND seq <= ?`
		args = append(args, through)
	}
	query += ` ORDER BY seq LIMIT ?`
	args = append(args, AgentInboxBatchSize)
	rows, err := q.Query(s.q(query), args...)
	if err != nil {
		return nil, fmt.Errorf("agent events: %w", err)
	}
	defer rows.Close()
	out := []AgentInboxEvent{}
	for rows.Next() {
		var e AgentInboxEvent
		var payload, created string
		if err := rows.Scan(&e.Seq, &e.Kind, &e.ItemID, &payload, &created); err != nil {
			return nil, fmt.Errorf("agent events: %w", err)
		}
		e.Payload = json.RawMessage(payload)
		e.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
		out = append(out, e)
	}
	return out, rows.Err()
}

// AgentRequest is a recorded agent write (TASK-18): the first answer to a
// request id, replayed for a retry of the same request. Status 0 marks a
// write still in flight.
type AgentRequest struct {
	Fingerprint string
	Status      int
	Response    string
}

// ReserveAgentRequest claims requestID for a write with fingerprint. It
// answers the existing record instead when the id was used before (the
// caller decides between replay, in-flight and reuse).
func (s *Store) ReserveAgentRequest(agentID, requestID, fingerprint string) (*AgentRequest, error) {
	read := func() (*AgentRequest, error) {
		var rec AgentRequest
		err := s.db.QueryRow(s.q(`SELECT fingerprint, status, response FROM agent_requests WHERE agent_id = ? AND request_id = ?`), agentID, requestID).
			Scan(&rec.Fingerprint, &rec.Status, &rec.Response)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("agent request: %w", err)
		}
		return &rec, nil
	}
	if rec, err := read(); rec != nil || err != nil {
		return rec, err
	}
	if _, err := s.db.Exec(s.q(`INSERT INTO agent_requests (agent_id, request_id, fingerprint, status, response, created_at) VALUES (?, ?, ?, 0, '{}', ?)`),
		agentID, requestID, fingerprint, now()); err != nil {
		// A concurrent retry reserved it first: answer its record.
		if rec, rerr := read(); rec != nil || rerr != nil {
			return rec, rerr
		}
		return nil, fmt.Errorf("agent request: reserve: %w", err)
	}
	return nil, nil
}

// CompleteAgentRequest records the answer of a reserved write.
func (s *Store) CompleteAgentRequest(agentID, requestID string, status int, response string) error {
	if _, err := s.db.Exec(s.q(`UPDATE agent_requests SET status = ?, response = ? WHERE agent_id = ? AND request_id = ?`), status, response, agentID, requestID); err != nil {
		return fmt.Errorf("agent request: complete: %w", err)
	}
	return nil
}

// ReleaseAgentRequest drops a reservation whose write failed on the server,
// so a retry runs it again rather than replaying the failure.
func (s *Store) ReleaseAgentRequest(agentID, requestID string) error {
	if _, err := s.db.Exec(s.q(`DELETE FROM agent_requests WHERE agent_id = ? AND request_id = ? AND status = 0`), agentID, requestID); err != nil {
		return fmt.Errorf("agent request: release: %w", err)
	}
	return nil
}
