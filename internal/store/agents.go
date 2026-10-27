package store

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/PerpetualSoftware/pad/internal/models"
)

// Agents that join a workspace through a link (SPEC-15, TASK-16).
//
// An owner mints a join link. An agent registers through it with a display
// name and a request id, and becomes a bot principal (users.kind = 'app')
// that is an editor member of the link's workspace, so a task can be assigned
// to it. Its padagt_ token is accepted only by the /api/agent/v1 router.
//
// Replaying a registration with the same request id answers the same agent
// with a NEW token and revokes the old ones: only hashes are stored, so the
// first token cannot be shown again, and a retry after an uncertain response
// must still end with a working credential.

const (
	// AgentJoinLinkTTL and AgentTokenTTL are the 7-day lifetimes SPEC-15
	// settled on (decision recorded on the spec).
	AgentJoinLinkTTL = 7 * 24 * time.Hour
	AgentTokenTTL    = 7 * 24 * time.Hour
	// AgentLinkMaxAgents bounds how many agents one link registers.
	AgentLinkMaxAgents = 20

	agentJoinCodePrefix = "padjoin_"
	agentTokenPrefix    = "padagt_"
	agentEmailPrefix    = "agent+"
)

var (
	// ErrAgentJoinInvalid is the one answer for a code that is unknown,
	// expired or revoked, or whose workspace is gone: the register route must
	// not tell a prober which.
	ErrAgentJoinInvalid = errors.New("invalid agent join link")
	// ErrAgentLinkFull refuses a registration past the link's max_agents.
	ErrAgentLinkFull = errors.New("this join link has registered its maximum number of agents")
	// ErrAgentNotFound answers a revoke of an agent or link not in the workspace.
	ErrAgentNotFound = errors.New("agent not found")
)

// IsAgentJoinCode reports whether s has the shape of a join code.
func IsAgentJoinCode(s string) bool {
	return strings.HasPrefix(strings.TrimSpace(s), agentJoinCodePrefix)
}

// IsAgentToken reports whether s has the shape of an agent token.
func IsAgentToken(s string) bool { return strings.HasPrefix(strings.TrimSpace(s), agentTokenPrefix) }

func agentSecret(prefix string) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return prefix + base64.RawURLEncoding.EncodeToString(raw), nil
}

func agentSecretHash(secret string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(secret)))
	return hex.EncodeToString(sum[:])
}

// CreateAgentJoinLink mints a join link for workspaceID. The code is returned
// once; the caller builds the URL around it.
func (s *Store) CreateAgentJoinLink(workspaceID, createdBy, label string) (*models.AgentJoinLinkWithCode, error) {
	code, err := agentSecret(agentJoinCodePrefix)
	if err != nil {
		return nil, fmt.Errorf("agent join link: %w", err)
	}
	id := newID()
	ts := now()
	expires := time.Now().Add(AgentJoinLinkTTL).UTC().Truncate(time.Second)
	if _, err := s.db.Exec(s.q(`
		INSERT INTO agent_join_links (id, workspace_id, code_sha256, label, created_by_user_id, max_agents, expires_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
		id, workspaceID, agentSecretHash(code), strings.TrimSpace(label), createdBy, AgentLinkMaxAgents, timeText(expires), ts); err != nil {
		return nil, fmt.Errorf("agent join link: insert: %w", err)
	}
	return &models.AgentJoinLinkWithCode{
		AgentJoinLink: models.AgentJoinLink{
			ID: id, WorkspaceID: workspaceID, Label: strings.TrimSpace(label), CreatedBy: createdBy,
			MaxAgents: AgentLinkMaxAgents, ExpiresAt: expires, CreatedAt: parseTime(ts),
		},
		Code: code,
	}, nil
}

// ListAgentJoinLinks lists a workspace's links, newest first, each with the
// number of its agents that are not revoked.
func (s *Store) ListAgentJoinLinks(workspaceID string) ([]models.AgentJoinLink, error) {
	rows, err := s.db.Query(s.q(`
		SELECT l.id, l.workspace_id, l.label, l.created_by_user_id, l.max_agents, l.expires_at, l.revoked_at, l.created_at,
		       (SELECT COUNT(*) FROM workspace_agents a WHERE a.link_id = l.id AND a.revoked_at IS NULL)
		FROM agent_join_links l
		WHERE l.workspace_id = ?
		ORDER BY l.created_at DESC, l.id`), workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list agent join links: %w", err)
	}
	defer rows.Close()
	out := []models.AgentJoinLink{}
	for rows.Next() {
		var l models.AgentJoinLink
		var expires, created string
		var revoked sql.NullString
		if err := rows.Scan(&l.ID, &l.WorkspaceID, &l.Label, &l.CreatedBy, &l.MaxAgents, &expires, &revoked, &created, &l.AgentCount); err != nil {
			return nil, fmt.Errorf("list agent join links: %w", err)
		}
		l.ExpiresAt = parseTime(expires)
		l.CreatedAt = parseTime(created)
		if revoked.Valid {
			l.RevokedAt = parseTimePtr(&revoked.String)
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// AgentJoinTarget is what a usable join code names.
type AgentJoinTarget struct {
	LinkID        string
	WorkspaceID   string
	WorkspaceSlug string
	WorkspaceName string
	ExpiresAt     time.Time
}

// LookupAgentJoinLink resolves a code that can still register an agent, or
// ErrAgentJoinInvalid.
func (s *Store) LookupAgentJoinLink(code string) (*AgentJoinTarget, error) {
	return s.lookupAgentJoinLinkQ(s.db, code, "")
}

func (s *Store) lookupAgentJoinLinkQ(q Queryer, code, suffix string) (*AgentJoinTarget, error) {
	if !IsAgentJoinCode(code) {
		return nil, ErrAgentJoinInvalid
	}
	var t AgentJoinTarget
	var expires string
	var revoked, wsDeleted sql.NullString
	err := q.QueryRow(s.q(`
		SELECT l.id, l.workspace_id, w.slug, w.name, l.expires_at, l.revoked_at, w.deleted_at
		FROM agent_join_links l JOIN workspaces w ON w.id = l.workspace_id
		WHERE l.code_sha256 = ?`+suffix), agentSecretHash(code)).
		Scan(&t.LinkID, &t.WorkspaceID, &t.WorkspaceSlug, &t.WorkspaceName, &expires, &revoked, &wsDeleted)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrAgentJoinInvalid
	}
	if err != nil {
		return nil, fmt.Errorf("agent join link: %w", err)
	}
	t.ExpiresAt = parseTime(expires)
	if revoked.Valid || wsDeleted.Valid || !time.Now().Before(t.ExpiresAt) {
		return nil, ErrAgentJoinInvalid
	}
	return &t, nil
}

// RegisterAgent registers (or, for a replayed request id, re-credentials) an
// agent through a join code.
func (s *Store) RegisterAgent(code, displayName, icon, requestID string) (*models.AgentRegistration, error) {
	displayName = strings.TrimSpace(displayName)
	requestID = strings.TrimSpace(requestID)
	icon = strings.TrimSpace(icon)
	if displayName == "" || requestID == "" {
		return nil, errors.New("register agent: name and request id are required")
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	forUpdate := ""
	if s.dialect.Driver() == DriverPostgres {
		forUpdate = ` FOR UPDATE OF l`
	}
	target, err := s.lookupAgentJoinLinkQ(tx, code, forUpdate)
	if err != nil {
		return nil, err
	}

	agent, err := s.agentByRequestQ(tx, target.LinkID, requestID)
	if err != nil {
		return nil, err
	}
	if agent != nil && agent.RevokedAt != nil {
		return nil, ErrAgentJoinInvalid
	}
	if agent == nil {
		var active int
		if err := tx.QueryRow(s.q(`SELECT COUNT(*) FROM workspace_agents WHERE link_id = ? AND revoked_at IS NULL`), target.LinkID).Scan(&active); err != nil {
			return nil, fmt.Errorf("register agent: %w", err)
		}
		var max int
		if err := tx.QueryRow(s.q(`SELECT max_agents FROM agent_join_links WHERE id = ?`), target.LinkID).Scan(&max); err != nil {
			return nil, fmt.Errorf("register agent: %w", err)
		}
		if active >= max {
			return nil, ErrAgentLinkFull
		}
		agent, err = s.createAgentTx(tx, target, displayName, icon, requestID)
		if err != nil {
			return nil, err
		}
	} else {
		// A replay: the old credential cannot be shown again, so it is
		// replaced. The agent keeps its identity, membership and inbox.
		if _, err := tx.Exec(s.q(`UPDATE agent_tokens SET revoked_at = ? WHERE agent_id = ? AND revoked_at IS NULL`), now(), agent.ID); err != nil {
			return nil, fmt.Errorf("register agent: revoke previous token: %w", err)
		}
	}

	token, err := agentSecret(agentTokenPrefix)
	if err != nil {
		return nil, fmt.Errorf("register agent: %w", err)
	}
	expires := time.Now().Add(AgentTokenTTL).UTC().Truncate(time.Second)
	if _, err := tx.Exec(s.q(`
		INSERT INTO agent_tokens (id, agent_id, token_sha256, expires_at, created_at)
		VALUES (?, ?, ?, ?, ?)`), newID(), agent.ID, agentSecretHash(token), timeText(expires), now()); err != nil {
		return nil, fmt.Errorf("register agent: token: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &models.AgentRegistration{Agent: *agent, Token: token, TokenExpiresAt: expires, WorkspaceSlug: target.WorkspaceSlug}, nil
}

func (s *Store) createAgentTx(tx *sql.Tx, target *AgentJoinTarget, displayName, icon, requestID string) (*models.WorkspaceAgent, error) {
	agentID := newID()
	userID := newID()
	username, err := s.uniqueUsernameTx(tx, "agent-"+agentID[:8], userID)
	if err != nil {
		return nil, fmt.Errorf("register agent: %w", err)
	}
	ts := now()
	// The reserved domain keeps the address out of every human door, as
	// CreateAppUserTx's does; the agent+ prefix keeps appPrincipalInstallID
	// from reading it as an install.
	email := agentEmailPrefix + strings.ToLower(agentID) + "@" + models.AppPrincipalEmailDomain
	if _, err := tx.Exec(s.q(`
		INSERT INTO users (id, email, username, name, password_hash, role, password_set, kind, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, 'member', ?, 'app', ?, ?)
	`), userID, email, username, displayName, appPrincipalPasswordHash, false, ts, ts); err != nil {
		return nil, fmt.Errorf("register agent: user: %w", err)
	}
	if err := s.addAppPrincipalMemberTx(tx, target.WorkspaceID, userID, "editor"); err != nil {
		return nil, fmt.Errorf("register agent: %w", err)
	}
	if _, err := tx.Exec(s.q(`
		INSERT INTO workspace_agents (id, workspace_id, user_id, link_id, register_request_id, display_name, icon, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
		agentID, target.WorkspaceID, userID, target.LinkID, requestID, displayName, icon, ts); err != nil {
		return nil, fmt.Errorf("register agent: %w", err)
	}
	return &models.WorkspaceAgent{
		ID: agentID, WorkspaceID: target.WorkspaceID, UserID: userID, LinkID: target.LinkID,
		DisplayName: displayName, Icon: icon, CreatedAt: parseTime(ts),
	}, nil
}

const workspaceAgentColumns = `id, workspace_id, user_id, link_id, display_name, icon, created_at, last_seen_at, revoked_at`

func scanWorkspaceAgent(sc scanner) (*models.WorkspaceAgent, error) {
	var a models.WorkspaceAgent
	var link, seen, revoked sql.NullString
	var created string
	if err := sc.Scan(&a.ID, &a.WorkspaceID, &a.UserID, &link, &a.DisplayName, &a.Icon, &created, &seen, &revoked); err != nil {
		return nil, err
	}
	a.LinkID = link.String
	a.CreatedAt = parseTime(created)
	if seen.Valid {
		a.LastSeenAt = parseTimePtr(&seen.String)
	}
	if revoked.Valid {
		a.RevokedAt = parseTimePtr(&revoked.String)
	}
	return &a, nil
}

func (s *Store) agentByRequestQ(q Queryer, linkID, requestID string) (*models.WorkspaceAgent, error) {
	a, err := scanWorkspaceAgent(q.QueryRow(s.q(`SELECT `+workspaceAgentColumns+` FROM workspace_agents WHERE link_id = ? AND register_request_id = ?`), linkID, requestID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("agent by request: %w", err)
	}
	return a, nil
}

// GetWorkspaceAgent reads one agent of a workspace, or nil.
func (s *Store) GetWorkspaceAgent(workspaceID, agentID string) (*models.WorkspaceAgent, error) {
	a, err := scanWorkspaceAgent(s.db.QueryRow(s.q(`SELECT `+workspaceAgentColumns+` FROM workspace_agents WHERE id = ? AND workspace_id = ?`), agentID, workspaceID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get workspace agent: %w", err)
	}
	return a, nil
}

// ListWorkspaceAgents lists a workspace's agents, oldest first; revoked ones
// only when includeRevoked.
func (s *Store) ListWorkspaceAgents(workspaceID string, includeRevoked bool) ([]models.WorkspaceAgent, error) {
	query := `SELECT ` + workspaceAgentColumns + ` FROM workspace_agents WHERE workspace_id = ?`
	if !includeRevoked {
		query += ` AND revoked_at IS NULL`
	}
	rows, err := s.db.Query(s.q(query+` ORDER BY created_at, id`), workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list workspace agents: %w", err)
	}
	defer rows.Close()
	out := []models.WorkspaceAgent{}
	for rows.Next() {
		a, err := scanWorkspaceAgent(rows)
		if err != nil {
			return nil, fmt.Errorf("list workspace agents: %w", err)
		}
		out = append(out, *a)
	}
	return out, rows.Err()
}

// RevokeAgent revokes an agent and every token it holds. Its bot stays a
// member, so the items it touched keep their author and assignee.
func (s *Store) RevokeAgent(workspaceID, agentID string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	ts := now()
	res, err := tx.Exec(s.q(`UPDATE workspace_agents SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND workspace_id = ?`), ts, agentID, workspaceID)
	if err != nil {
		return fmt.Errorf("revoke agent: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrAgentNotFound
	}
	if _, err := tx.Exec(s.q(`UPDATE agent_tokens SET revoked_at = ? WHERE agent_id = ? AND revoked_at IS NULL`), ts, agentID); err != nil {
		return fmt.Errorf("revoke agent: tokens: %w", err)
	}
	return tx.Commit()
}

// RevokeAgentJoinLink revokes a link and, with it, every agent it registered
// (SPEC-15: revoking the link invalidates its agents' tokens).
func (s *Store) RevokeAgentJoinLink(workspaceID, linkID string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	ts := now()
	res, err := tx.Exec(s.q(`UPDATE agent_join_links SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND workspace_id = ?`), ts, linkID, workspaceID)
	if err != nil {
		return fmt.Errorf("revoke agent join link: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrAgentNotFound
	}
	if _, err := tx.Exec(s.q(`UPDATE agent_tokens SET revoked_at = ? WHERE revoked_at IS NULL AND agent_id IN (SELECT id FROM workspace_agents WHERE link_id = ?)`), ts, linkID); err != nil {
		return fmt.Errorf("revoke agent join link: tokens: %w", err)
	}
	if _, err := tx.Exec(s.q(`UPDATE workspace_agents SET revoked_at = ? WHERE link_id = ? AND revoked_at IS NULL`), ts, linkID); err != nil {
		return fmt.Errorf("revoke agent join link: agents: %w", err)
	}
	return tx.Commit()
}

// ValidateAgentToken resolves a live padagt_ token to its agent, or nil when
// the token is unknown, expired or revoked, or its agent, link or workspace
// is. A valid token's last use and its agent's last-seen are stamped.
func (s *Store) ValidateAgentToken(token string) (*models.AgentPrincipal, error) {
	if !IsAgentToken(token) {
		return nil, nil
	}
	var p models.AgentPrincipal
	var expires string
	var tokRevoked, agentRevoked, linkRevoked, wsDeleted sql.NullString
	err := s.db.QueryRow(s.q(`
		SELECT t.id, t.expires_at, t.revoked_at, a.id, a.workspace_id, a.user_id, a.display_name, a.revoked_at,
		       l.revoked_at, w.slug, w.deleted_at
		FROM agent_tokens t
		JOIN workspace_agents a ON a.id = t.agent_id
		JOIN workspaces w ON w.id = a.workspace_id
		LEFT JOIN agent_join_links l ON l.id = a.link_id
		WHERE t.token_sha256 = ?`), agentSecretHash(token)).
		Scan(&p.TokenID, &expires, &tokRevoked, &p.AgentID, &p.WorkspaceID, &p.UserID, &p.DisplayName, &agentRevoked,
			&linkRevoked, &p.WorkspaceSlug, &wsDeleted)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("validate agent token: %w", err)
	}
	if tokRevoked.Valid || agentRevoked.Valid || linkRevoked.Valid || wsDeleted.Valid || !time.Now().Before(parseTime(expires)) {
		return nil, nil
	}
	ts := now()
	if _, err := s.db.Exec(s.q(`UPDATE agent_tokens SET last_used_at = ? WHERE id = ?`), ts, p.TokenID); err != nil {
		return nil, fmt.Errorf("validate agent token: touch: %w", err)
	}
	if _, err := s.db.Exec(s.q(`UPDATE workspace_agents SET last_seen_at = ? WHERE id = ?`), ts, p.AgentID); err != nil {
		return nil, fmt.Errorf("validate agent token: touch: %w", err)
	}
	return &p, nil
}

// isLiveWorkspaceAgentQ reports whether userID is the bot of an agent of
// workspaceID that is not revoked (the app ceiling's exception for agents).
func (s *Store) isLiveWorkspaceAgentQ(q Queryer, workspaceID, userID string) (bool, error) {
	var n int
	if err := q.QueryRow(s.q(`SELECT COUNT(*) FROM workspace_agents WHERE workspace_id = ? AND user_id = ? AND revoked_at IS NULL`), workspaceID, userID).Scan(&n); err != nil {
		return false, fmt.Errorf("read workspace agent: %w", err)
	}
	return n > 0, nil
}
