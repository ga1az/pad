package store

import (
	"errors"
	"fmt"
	"testing"
)

func TestAgentJoinLinkRegisterAndValidate(t *testing.T) {
	s := testStore(t)
	ws := createTestWorkspace(t, s, "Agents")

	link, err := s.CreateAgentJoinLink(ws.ID, "owner-1", "ci agent")
	if err != nil {
		t.Fatalf("create link: %v", err)
	}
	if !IsAgentJoinCode(link.Code) {
		t.Fatalf("code %q lacks the join prefix", link.Code)
	}

	reg, err := s.RegisterAgent(link.Code, "Claude · pad", "anthropic", "req-1")
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if reg.WorkspaceSlug != ws.Slug || reg.Agent.WorkspaceID != ws.ID {
		t.Fatalf("registration names workspace %q/%q, want %q", reg.WorkspaceSlug, reg.Agent.WorkspaceID, ws.Slug)
	}
	p, err := s.ValidateAgentToken(reg.Token)
	if err != nil || p == nil {
		t.Fatalf("validate: %v %v", p, err)
	}
	if p.AgentID != reg.Agent.ID || p.UserID != reg.Agent.UserID || p.WorkspaceID != ws.ID {
		t.Fatalf("principal %+v does not match the registration %+v", p, reg.Agent)
	}

	// The bot is an editor member of the link's workspace, so work can be
	// assigned to it, and it is an app principal no human door accepts.
	var role, kind string
	if err := s.db.QueryRow(s.q(`SELECT wm.role, u.kind FROM workspace_members wm JOIN users u ON u.id = wm.user_id WHERE wm.workspace_id = ? AND wm.user_id = ?`), ws.ID, reg.Agent.UserID).Scan(&role, &kind); err != nil {
		t.Fatalf("membership: %v", err)
	}
	if role != "editor" || kind != "app" {
		t.Fatalf("bot is %s/%s, want editor/app", role, kind)
	}
	botID := reg.Agent.UserID
	if err := s.validateAssignmentScopeQ(s.db, ws.ID, &botID, nil); err != nil {
		t.Fatalf("the agent is not assignable: %v", err)
	}

	links, err := s.ListAgentJoinLinks(ws.ID)
	if err != nil || len(links) != 1 || links[0].AgentCount != 1 {
		t.Fatalf("links = %+v, %v; want one link with one agent", links, err)
	}
}

func TestAgentRegisterReplayRotatesTheToken(t *testing.T) {
	s := testStore(t)
	ws := createTestWorkspace(t, s, "Replay")
	link, _ := s.CreateAgentJoinLink(ws.ID, "owner-1", "")

	first, err := s.RegisterAgent(link.Code, "Agent", "", "same-request")
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	second, err := s.RegisterAgent(link.Code, "Agent", "", "same-request")
	if err != nil {
		t.Fatalf("replay: %v", err)
	}
	if second.Agent.ID != first.Agent.ID {
		t.Fatalf("a replay made a second agent: %s then %s", first.Agent.ID, second.Agent.ID)
	}
	if second.Token == first.Token {
		t.Fatal("a replay returned the same token; only its hash is stored, so it must be a new one")
	}
	if p, _ := s.ValidateAgentToken(first.Token); p != nil {
		t.Fatal("the replaced token still validates")
	}
	if p, _ := s.ValidateAgentToken(second.Token); p == nil {
		t.Fatal("the new token does not validate")
	}
	agents, _ := s.ListWorkspaceAgents(ws.ID, false)
	if len(agents) != 1 {
		t.Fatalf("agents = %d, want 1", len(agents))
	}
}

func TestAgentRevocationEndsTheToken(t *testing.T) {
	s := testStore(t)
	ws := createTestWorkspace(t, s, "Revoke")
	link, _ := s.CreateAgentJoinLink(ws.ID, "owner-1", "")
	a, _ := s.RegisterAgent(link.Code, "A", "", "r-a")
	b, _ := s.RegisterAgent(link.Code, "B", "", "r-b")

	if err := s.RevokeAgent(ws.ID, a.Agent.ID); err != nil {
		t.Fatalf("revoke agent: %v", err)
	}
	if p, _ := s.ValidateAgentToken(a.Token); p != nil {
		t.Fatal("a revoked agent's token validates")
	}
	if p, _ := s.ValidateAgentToken(b.Token); p == nil {
		t.Fatal("revoking one agent ended another's token")
	}
	if _, err := s.RegisterAgent(link.Code, "A", "", "r-a"); !errors.Is(err, ErrAgentJoinInvalid) {
		t.Fatalf("a revoked agent re-registered by replay: %v", err)
	}

	if err := s.RevokeAgentJoinLink(ws.ID, link.ID); err != nil {
		t.Fatalf("revoke link: %v", err)
	}
	if p, _ := s.ValidateAgentToken(b.Token); p != nil {
		t.Fatal("revoking the link left its agent's token valid")
	}
	if _, err := s.RegisterAgent(link.Code, "C", "", "r-c"); !errors.Is(err, ErrAgentJoinInvalid) {
		t.Fatalf("a revoked link registered an agent: %v", err)
	}

	other := createTestWorkspace(t, s, "Other")
	if err := s.RevokeAgent(other.ID, b.Agent.ID); !errors.Is(err, ErrAgentNotFound) {
		t.Fatalf("revoke from another workspace = %v, want ErrAgentNotFound", err)
	}
}

func TestAgentJoinLinkRefusals(t *testing.T) {
	s := testStore(t)
	ws := createTestWorkspace(t, s, "Refusals")

	if _, err := s.RegisterAgent("padjoin_unknown", "X", "", "r"); !errors.Is(err, ErrAgentJoinInvalid) {
		t.Fatalf("unknown code = %v", err)
	}
	if _, err := s.RegisterAgent("not-a-code", "X", "", "r"); !errors.Is(err, ErrAgentJoinInvalid) {
		t.Fatalf("malformed code = %v", err)
	}
	if p, err := s.ValidateAgentToken("pad_" + "0"); p != nil || err != nil {
		t.Fatalf("a non-agent token = %v, %v", p, err)
	}

	expired, _ := s.CreateAgentJoinLink(ws.ID, "owner-1", "")
	if _, err := s.db.Exec(s.q(`UPDATE agent_join_links SET expires_at = ? WHERE id = ?`), "2000-01-01T00:00:00Z", expired.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.RegisterAgent(expired.Code, "X", "", "r"); !errors.Is(err, ErrAgentJoinInvalid) {
		t.Fatalf("expired link = %v", err)
	}

	full, _ := s.CreateAgentJoinLink(ws.ID, "owner-1", "")
	if _, err := s.db.Exec(s.q(`UPDATE agent_join_links SET max_agents = 2 WHERE id = ?`), full.ID); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if _, err := s.RegisterAgent(full.Code, "X", "", fmt.Sprintf("r%d", i)); err != nil {
			t.Fatalf("register %d: %v", i, err)
		}
	}
	if _, err := s.RegisterAgent(full.Code, "X", "", "r-over"); !errors.Is(err, ErrAgentLinkFull) {
		t.Fatalf("over the cap = %v, want ErrAgentLinkFull", err)
	}

	reg, _ := s.RegisterAgent(func() string { l, _ := s.CreateAgentJoinLink(ws.ID, "o", ""); return l.Code }(), "X", "", "r")
	if _, err := s.db.Exec(s.q(`UPDATE agent_tokens SET expires_at = ? WHERE agent_id = ?`), "2000-01-01T00:00:00Z", reg.Agent.ID); err != nil {
		t.Fatal(err)
	}
	if p, _ := s.ValidateAgentToken(reg.Token); p != nil {
		t.Fatal("an expired agent token validates")
	}
}

// A bot with no install sees nothing (the app ceiling), except a live agent,
// which reads what its editor membership shows. Revoked, it sees nothing again.
func TestAgentVisibilityFollowsRevocation(t *testing.T) {
	s := testStore(t)
	ws := createTestWorkspace(t, s, "Ceiling")
	if err := s.SeedCollectionsFromTemplate(ws.ID, ""); err != nil {
		t.Fatal(err)
	}
	link, _ := s.CreateAgentJoinLink(ws.ID, "owner-1", "")
	reg, err := s.RegisterAgent(link.Code, "A", "", "r")
	if err != nil {
		t.Fatal(err)
	}
	visible, err := s.VisibleCollectionIDs(ws.ID, reg.Agent.UserID)
	if err != nil {
		t.Fatal(err)
	}
	if visible != nil {
		t.Fatalf("a live agent sees %v, want every collection (nil)", visible)
	}
	if err := s.RevokeAgent(ws.ID, reg.Agent.ID); err != nil {
		t.Fatal(err)
	}
	visible, err = s.VisibleCollectionIDs(ws.ID, reg.Agent.UserID)
	if err != nil {
		t.Fatal(err)
	}
	if visible == nil || len(visible) != 0 {
		t.Fatalf("a revoked agent sees %v, want nothing", visible)
	}
}
