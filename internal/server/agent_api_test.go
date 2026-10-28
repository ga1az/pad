package server

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/PerpetualSoftware/pad/internal/models"
)

type agentEnv struct {
	srv     *Server
	ws      *models.Workspace
	sessTok string
	patTok  string
}

func setupAgentEnv(t *testing.T) *agentEnv {
	t.Helper()
	srv := testServer(t)
	user, err := srv.store.CreateUser(models.UserCreate{
		Email: "agents-owner@example.com", Name: "Agent Owner",
		Password: "correct-horse-battery-staple", Role: "member",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	ws, err := srv.store.CreateWorkspace(models.WorkspaceCreate{Name: "Agents WS", OwnerID: user.ID})
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	if err := srv.store.AddWorkspaceMember(ws.ID, user.ID, "owner"); err != nil {
		t.Fatalf("add owner: %v", err)
	}
	pat, err := srv.store.CreateAPIToken(user.ID, models.APITokenCreate{Name: "pat"}, 0, 0)
	if err != nil {
		t.Fatalf("create pat: %v", err)
	}
	return &agentEnv{
		srv:     srv,
		ws:      ws,
		sessTok: loginUser(t, srv, "agents-owner@example.com", "correct-horse-battery-staple"),
		patTok:  pat.Token,
	}
}

func jsonMap(t *testing.T, b []byte) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("decode %s: %v", b, err)
	}
	return m
}

// createJoinLink mints a link as the owner and returns its code.
func (e *agentEnv) createJoinLink(t *testing.T) (code, linkID string) {
	t.Helper()
	rr := doRequestWithBearer(e.srv, "POST", "/api/v1/workspaces/"+e.ws.Slug+"/agent-links", e.sessTok, map[string]any{"label": "ci"})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create link = %d %s", rr.Code, rr.Body.String())
	}
	m := jsonMap(t, rr.Body.Bytes())
	u, err := url.Parse(m["url"].(string))
	if err != nil || u.Path != agentAPIPrefix+"/join" || u.Query().Get("code") != m["code"] {
		t.Fatalf("link url %q does not carry the code on %s/join", m["url"], agentAPIPrefix)
	}
	return m["code"].(string), m["id"].(string)
}

// register joins through code with only a GET, as a URL-fetching agent would.
func (e *agentEnv) register(t *testing.T, code, name, requestID string) map[string]any {
	t.Helper()
	q := url.Values{"code": {code}, "name": {name}, "requestId": {requestID}, "icon": {"anthropic"}}
	rr := doRequest(e.srv, "GET", agentAPIPrefix+"/join/register?"+q.Encode(), nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("register = %d %s", rr.Code, rr.Body.String())
	}
	return jsonMap(t, rr.Body.Bytes())
}

func TestAgentJoinWithOnlyGET(t *testing.T) {
	t.Parallel()
	e := setupAgentEnv(t)
	code, _ := e.createJoinLink(t)

	reg := e.register(t, code, "Claude · pad", "req-1")
	token, _ := reg["token"].(string)
	if !strings.HasPrefix(token, "padagt_") {
		t.Fatalf("token %q lacks padagt_", token)
	}
	urls, _ := reg["urls"].(map[string]any)
	meURL, _ := urls["me"].(string)
	if !strings.Contains(meURL, agentAPIPrefix+"/me?token=") {
		t.Fatalf("me url = %q", meURL)
	}

	// The token works in the query (a URL-fetching agent) and as a bearer.
	rr := doRequest(e.srv, "GET", agentAPIPrefix+"/me?token="+url.QueryEscape(token), nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("me (query) = %d %s", rr.Code, rr.Body.String())
	}
	me := jsonMap(t, rr.Body.Bytes())
	if me["workspace"].(map[string]any)["slug"] != e.ws.Slug {
		t.Fatalf("me workspace = %v, want %s", me["workspace"], e.ws.Slug)
	}
	if rr := doRequestWithBearer(e.srv, "GET", agentAPIPrefix+"/me", token, nil); rr.Code != http.StatusOK {
		t.Fatalf("me (bearer) = %d %s", rr.Code, rr.Body.String())
	}

	// Members see the agent, so they can assign it work.
	rr = doRequestWithBearer(e.srv, "GET", "/api/v1/workspaces/"+e.ws.Slug+"/agents", e.sessTok, nil)
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), "Claude · pad") {
		t.Fatalf("agents = %d %s", rr.Code, rr.Body.String())
	}
}

// AC-2: the agent token reaches nothing outside /api/agent/v1, so it can
// neither read another workspace nor mint tokens.
func TestAgentTokenIsConfinedToTheAgentAPI(t *testing.T) {
	t.Parallel()
	e := setupAgentEnv(t)
	code, _ := e.createJoinLink(t)
	token := e.register(t, code, "Agent", "req-1")["token"].(string)

	for _, tc := range []struct{ method, path string }{
		{"GET", "/api/v1/workspaces/" + e.ws.Slug + "/items"},
		{"GET", "/api/v1/workspaces"},
		{"POST", "/api/v1/auth/tokens"},
		{"POST", "/api/v1/workspaces/" + e.ws.Slug + "/agent-links"},
	} {
		rr := doRequestWithBearer(e.srv, tc.method, tc.path, token, map[string]any{"name": "x"})
		if rr.Code != http.StatusUnauthorized {
			t.Errorf("%s %s with an agent token = %d, want 401; body=%s", tc.method, tc.path, rr.Code, rr.Body.String())
		}
	}
}

func TestAgentJoinLinkCreateRefusesAPAT(t *testing.T) {
	t.Parallel()
	e := setupAgentEnv(t)
	rr := doRequestWithBearer(e.srv, "POST", "/api/v1/workspaces/"+e.ws.Slug+"/agent-links", e.patTok, nil)
	if rr.Code != http.StatusForbidden || errorCode(t, rr) != "session_required" {
		t.Fatalf("PAT minted a join link: %d %s", rr.Code, rr.Body.String())
	}
}

// AC-6: revoking the agent, or its link, ends its token.
func TestAgentRevocationIsA401(t *testing.T) {
	t.Parallel()
	e := setupAgentEnv(t)
	code, linkID := e.createJoinLink(t)
	a := e.register(t, code, "A", "r-a")
	b := e.register(t, code, "B", "r-b")

	agentID := a["agent"].(map[string]any)["id"].(string)
	rr := doRequestWithBearer(e.srv, "DELETE", "/api/v1/workspaces/"+e.ws.Slug+"/agents/"+agentID, e.sessTok, nil)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("revoke agent = %d %s", rr.Code, rr.Body.String())
	}
	if rr := doRequestWithBearer(e.srv, "GET", agentAPIPrefix+"/me", a["token"].(string), nil); rr.Code != http.StatusUnauthorized {
		t.Fatalf("revoked agent me = %d", rr.Code)
	}
	if rr := doRequestWithBearer(e.srv, "GET", agentAPIPrefix+"/me", b["token"].(string), nil); rr.Code != http.StatusOK {
		t.Fatalf("other agent me = %d", rr.Code)
	}

	rr = doRequestWithBearer(e.srv, "DELETE", "/api/v1/workspaces/"+e.ws.Slug+"/agent-links/"+linkID, e.sessTok, nil)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("revoke link = %d %s", rr.Code, rr.Body.String())
	}
	if rr := doRequestWithBearer(e.srv, "GET", agentAPIPrefix+"/me", b["token"].(string), nil); rr.Code != http.StatusUnauthorized {
		t.Fatalf("agent of a revoked link me = %d", rr.Code)
	}
	q := url.Values{"code": {code}, "name": {"C"}, "requestId": {"r-c"}}
	if rr := doRequest(e.srv, "GET", agentAPIPrefix+"/join/register?"+q.Encode(), nil); rr.Code != http.StatusBadRequest || errorCode(t, rr) != "invalid_join_link" {
		t.Fatalf("register on a revoked link = %d %s", rr.Code, rr.Body.String())
	}
}

func TestAgentRegisterValidation(t *testing.T) {
	t.Parallel()
	e := setupAgentEnv(t)
	code, _ := e.createJoinLink(t)
	for name, q := range map[string]url.Values{
		"no name":       {"code": {code}, "requestId": {"r"}},
		"@ in name":     {"code": {code}, "name": {"a@b"}, "requestId": {"r"}},
		"no request id": {"code": {code}, "name": {"A"}},
		"bad icon":      {"code": {code}, "name": {"A"}, "requestId": {"r"}, "icon": {"Not An Icon"}},
	} {
		if rr := doRequest(e.srv, "GET", agentAPIPrefix+"/join/register?"+q.Encode(), nil); rr.Code != http.StatusBadRequest {
			t.Errorf("%s: register = %d, want 400", name, rr.Code)
		}
	}
	if rr := doRequest(e.srv, "GET", agentAPIPrefix+"/me", nil); rr.Code != http.StatusUnauthorized {
		t.Errorf("me without a token = %d, want 401", rr.Code)
	}
}

// AC-7: neither the join code nor the agent token survives into a log line.
func TestAgentSecretsAreRedactedFromLogs(t *testing.T) {
	t.Parallel()
	got := redactQueryString("code=padjoin_secretcode&name=A&token=padagt_secrettoken")
	if strings.Contains(got, "secretcode") || strings.Contains(got, "secrettoken") {
		t.Fatalf("redacted query still carries a secret: %q", got)
	}
	if !strings.Contains(got, "name=A") {
		t.Fatalf("redaction took a harmless parameter too: %q", got)
	}
}

// TASK-23: the create answer carries the text to paste into an agent's
// session, the invitation and then the link, as Radio's channel invite.
func TestAgentJoinLinkInviteMessage(t *testing.T) {
	t.Parallel()
	e := setupAgentEnv(t)
	rr := doRequestWithBearer(e.srv, "POST", "/api/v1/workspaces/"+e.ws.Slug+"/agent-links", e.sessTok, nil)
	if rr.Code != http.StatusCreated {
		t.Fatalf("create link = %d %s", rr.Code, rr.Body.String())
	}
	m := jsonMap(t, rr.Body.Bytes())
	msg, _ := m["invite_message"].(string)
	if !strings.HasPrefix(msg, `Join my Pad workspace "Agents WS". Read the API instructions at the link below`) {
		t.Fatalf("invite_message = %q", msg)
	}
	if !strings.HasSuffix(msg, "\n\n"+m["url"].(string)) {
		t.Fatalf("invite_message does not end with the link: %q", msg)
	}
}
