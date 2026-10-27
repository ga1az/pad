package server

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/PerpetualSoftware/pad/internal/store"
	"github.com/PerpetualSoftware/pad/internal/watchevents"
)

// The agent's activity (SPEC-15, TASK-17): GET /api/agent/v1/activity is a
// long-poll over the agent's inbox, in acknowledged batches. Events are
// recorded from publishWatchNotification, the sink every status, assignment
// and comment producer already funnels through, so the inbox sees exactly
// what a watch would.

const (
	agentActivityMaxWait = 50 * time.Second
	// agentActivityRecheck bounds how long a poll can miss an event the
	// in-process notifier did not see (another instance enqueued it).
	agentActivityRecheck = 2 * time.Second
)

// agentInboxNotifier wakes the polls waiting on an agent. In-process only;
// a poll also re-reads the inbox every agentActivityRecheck.
type agentInboxNotifier struct {
	mu      sync.Mutex
	waiters map[string]chan struct{}
}

var agentNotifiers sync.Map // *Server -> *agentInboxNotifier

func (s *Server) agentNotifier() *agentInboxNotifier {
	v, _ := agentNotifiers.LoadOrStore(s, &agentInboxNotifier{waiters: map[string]chan struct{}{}})
	return v.(*agentInboxNotifier)
}

func (n *agentInboxNotifier) wait(agentID string) <-chan struct{} {
	n.mu.Lock()
	defer n.mu.Unlock()
	ch, ok := n.waiters[agentID]
	if !ok {
		ch = make(chan struct{})
		n.waiters[agentID] = ch
	}
	return ch
}

func (n *agentInboxNotifier) signal(agentID string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if ch, ok := n.waiters[agentID]; ok {
		close(ch)
		delete(n.waiters, agentID)
	}
}

// recordAgentEvent puts a notification in the inbox of the agent it
// concerns, if any: an assignment goes to the agent assigned, a status change
// or a comment to the agent the item is assigned to now. An agent is not told
// about its own writes. Best-effort, like the bus publish beside it: the
// write it describes has committed, so a failure here is logged, not raised.
func (s *Server) recordAgentEvent(n watchevents.Notification) {
	var kind, userID string
	switch n.Kind {
	case watchevents.KindAssignment:
		if n.AssignedUserID == "" {
			return
		}
		kind, userID = store.AgentEventAssigned, n.AssignedUserID
	case watchevents.KindStatusChange:
		kind = store.AgentEventStatus
	case watchevents.KindComment:
		kind = store.AgentEventComment
	default:
		return
	}
	agentID, agentUserID, err := s.store.AgentInboxTarget(n.WorkspaceID, n.ItemID, userID)
	if err != nil {
		slog.Warn("agent inbox: target lookup failed", "error", err, "item_ref", n.ItemRef)
		return
	}
	if agentID == "" || (n.ActorUserID != "" && n.ActorUserID == agentUserID) {
		return
	}
	payload := map[string]string{"item_ref": n.ItemRef, "summary": n.Summary, "by": n.ActorName}
	if n.ToStatus != "" {
		payload["status"] = n.ToStatus
	}
	if err := s.store.EnqueueAgentEvent(agentID, kind, n.ItemID, payload); err != nil {
		slog.Warn("agent inbox: enqueue failed", "error", err, "kind", kind, "item_ref", n.ItemRef)
		return
	}
	s.agentNotifier().signal(agentID)
}

type agentActivityEvent struct {
	store.AgentInboxEvent
	// Brief is the item's context (the same body as GET .../context) on an
	// "assigned" event: the task, its parent's acceptance criteria and the
	// conventions to follow, so the agent can start without another call.
	Brief json.RawMessage `json:"brief,omitempty"`
}

// handleAgentActivity answers the agent's next batch, waiting up to ?wait=
// seconds (default and cap 50; 0 checks now) when there is none. Pass the
// batchId just handled as ?ackBatch= to move on; without it the same batch
// comes back. batchId null means nothing arrived before the wait ended.
func (s *Server) handleAgentActivity(w http.ResponseWriter, r *http.Request) {
	p := agentPrincipal(r)
	wait := agentActivityMaxWait
	if v := r.URL.Query().Get("wait"); v != "" {
		secs, err := strconv.Atoi(v)
		if err != nil || secs < 0 {
			writeError(w, http.StatusBadRequest, "validation_error", "wait must be a whole number of seconds, 0 to 50")
			return
		}
		if d := time.Duration(secs) * time.Second; d < wait {
			wait = d
		}
	}
	ack := r.URL.Query().Get("ackBatch")
	deadline := time.Now().Add(wait)
	notifier := s.agentNotifier()

	for {
		// Subscribe before reading, so an event enqueued between the read
		// and the wait still wakes this poll.
		woke := notifier.wait(p.AgentID)
		batch, err := s.store.NextAgentBatch(p.AgentID, ack)
		if errors.Is(err, store.ErrAgentBatchUnknown) {
			writeError(w, http.StatusConflict, "invalid_ack_batch", "ackBatch is neither the outstanding batch nor the one acknowledged last; omit it to recover the outstanding batch")
			return
		}
		if err != nil {
			slog.Error("agent activity failed", "error", err)
			writeError(w, http.StatusInternalServerError, "internal_error", "Could not read the activity")
			return
		}
		ack = "" // acknowledged (or replayed) once; never again in this poll
		remaining := time.Until(deadline)
		if batch.BatchID != "" || remaining <= 0 {
			s.writeAgentBatch(w, r, batch)
			return
		}
		timer := time.NewTimer(min(remaining, agentActivityRecheck))
		select {
		case <-woke:
		case <-timer.C:
		case <-r.Context().Done():
			timer.Stop()
			return
		}
		timer.Stop()
	}
}

func (s *Server) writeAgentBatch(w http.ResponseWriter, r *http.Request, batch *store.AgentInboxBatch) {
	events := make([]agentActivityEvent, 0, len(batch.Events))
	for _, e := range batch.Events {
		ev := agentActivityEvent{AgentInboxEvent: e}
		if e.Kind == store.AgentEventAssigned {
			ev.Brief = s.agentItemBrief(r, e.ItemID)
		}
		events = append(events, ev)
	}
	var batchID any
	if batch.BatchID != "" {
		batchID = batch.BatchID
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"batchId":         batchID,
		"events":          events,
		"remainingUnread": batch.RemainingUnread,
	})
}

// agentItemBrief renders the item's context as the agent would read it from
// GET /api/agent/v1/items/{ref}/context, by running that handler under the
// agent's own request (its visibility, its workspace). Nil when the item is
// not visible or the context fails; the event still goes out without it.
func (s *Server) agentItemBrief(r *http.Request, itemID string) json.RawMessage {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("itemSlug", itemID)
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, rctx)
	sub := httptest.NewRequest(http.MethodGet, agentAPIPrefix+"/items/"+itemID+"/context", nil).WithContext(ctx)
	rec := httptest.NewRecorder()
	s.handleGetItemContext(rec, sub)
	if rec.Code != http.StatusOK || !json.Valid(rec.Body.Bytes()) {
		return nil
	}
	return json.RawMessage(rec.Body.Bytes())
}
