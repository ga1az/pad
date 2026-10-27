package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"

	"github.com/PerpetualSoftware/pad/internal/models"
	"github.com/PerpetualSoftware/pad/internal/store"
)

// The agent API (SPEC-15): /api/agent/v1, the door an agent with nothing but
// HTTP uses after joining a workspace through a link. It is mounted outside
// TokenAuth and SessionAuth, so no session or PAT authenticates it, and a
// padagt_ token reaches nothing else: /api/v1's TokenAuth refuses the prefix
// as an invalid format.
//
// The token may ride in "Authorization: Bearer padagt_..." or in ?token= for
// an agent whose only tool fetches URLs. The request logger redacts token=
// (middleware_logging.go), and join codes travel as ?code= for the same reason.

const agentAPIPrefix = "/api/agent/v1"

type agentPrincipalKey struct{}

// agentPrincipal returns the agent a request authenticated as, or nil.
func agentPrincipal(r *http.Request) *models.AgentPrincipal {
	p, _ := r.Context().Value(agentPrincipalKey{}).(*models.AgentPrincipal)
	return p
}

// registerAgentAPIRoutes mounts the agent router.
func (s *Server) registerAgentAPIRoutes(r chi.Router) {
	r.Route(agentAPIPrefix, func(r chi.Router) {
		r.Use(agentJSONContentType)
		// Unauthenticated: the join code IS the credential. Its own address
		// limiter runs inside the handler, before the code is looked up.
		// The join link itself: an OpenAPI document with the code filled in.
		r.Get("/join", s.handleAgentJoinDocument)
		r.Get("/join/register", s.handleAgentRegister)
		r.Post("/join/register", s.handleAgentRegister)

		r.Group(func(r chi.Router) {
			r.Use(s.agentTokenAuth)
			r.Use(s.RateLimit)
			r.Get("/me", s.handleAgentMe)
			r.Get("/activity", s.handleAgentActivity)
			// Reads reuse the /api/v1 handlers: the context below sets the
			// workspace and the bot's member role they authorize against.
			r.Get("/items/{itemSlug}/context", s.handleGetItemContext)
			r.Get("/items/{itemSlug}/comments", s.handleListComments)
			// Writes, on the agent's own tasks only (TASK-18): comment, status,
			// claim and release. GET and POST are the same request.
			r.Get("/items/{itemSlug}/{op}", s.handleAgentWrite)
			r.Post("/items/{itemSlug}/{op}", s.handleAgentWrite)
		})
	})
}

func agentJSONContentType(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// agentTokenAuth admits a live padagt_ token and sets the agent and its bot
// user on the context. Every refusal is the same 401.
func (s *Server) agentTokenAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := ""
		if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			token = strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
		}
		if token == "" {
			token = strings.TrimSpace(r.URL.Query().Get("token"))
		}
		if !store.IsAgentToken(token) {
			writeError(w, http.StatusUnauthorized, "unauthorized", "An agent token is required (Authorization: Bearer padagt_... or ?token=padagt_...)")
			return
		}
		p, err := s.store.ValidateAgentToken(token)
		if err != nil {
			slog.Error("agent token validation failed", "error", err)
			writeError(w, http.StatusInternalServerError, "internal_error", "Token validation failed")
			return
		}
		if p == nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "Invalid, expired or revoked agent token")
			return
		}
		user, err := s.store.GetUser(p.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "Token validation failed")
			return
		}
		if user == nil || user.IsDisabled() {
			writeError(w, http.StatusUnauthorized, "unauthorized", "Invalid, expired or revoked agent token")
			return
		}
		// The bot's membership is its authority, read per request so a
		// removed member loses access at once, like RequireWorkspaceAccess.
		member, err := s.store.GetWorkspaceMember(p.WorkspaceID, p.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal_error", "Token validation failed")
			return
		}
		if member == nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "Invalid, expired or revoked agent token")
			return
		}
		ctx := context.WithValue(r.Context(), agentPrincipalKey{}, p)
		ctx = context.WithValue(ctx, ctxCurrentUser, user)
		ctx = context.WithValue(ctx, ctxResolvedWorkspaceID, p.WorkspaceID)
		ctx = context.WithValue(ctx, ctxWorkspaceRole, member.Role)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// agentBaseURL is the absolute origin the agent's URLs are built on: the
// configured public URL when there is one, else this request's own host.
func (s *Server) agentBaseURL(r *http.Request) string {
	if s.hasUsableBaseURL() {
		return s.baseURL
	}
	return cliAuthScheme(r, s.trustedProxyCIDRs) + "://" + r.Host
}

// agentURLs are the endpoints a registered agent is handed, each with its
// token in the query so a URL-fetching agent can use them as-is.
func (s *Server) agentURLs(r *http.Request, token string) map[string]string {
	base := s.agentBaseURL(r) + agentAPIPrefix
	q := "?token=" + url.QueryEscape(token)
	return map[string]string{
		"me":       base + "/me" + q,
		"activity": base + "/activity" + q,
	}
}

var agentIconPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,31}$`)

// validAgentName accepts 1-40 runes with no control characters and no '@',
// the shape Radio settled on for display names.
func validAgentName(name string) bool {
	n := utf8.RuneCountInString(name)
	if n < 1 || n > 40 || strings.ContainsRune(name, '@') {
		return false
	}
	for _, r := range name {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}

type agentRegisterRequest struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	Icon      string `json:"icon"`
	RequestID string `json:"requestId"`
}

// handleAgentRegister registers an agent through a join code. GET (query
// parameters) and POST (JSON body or query) are the same request, so an agent
// that can only fetch URLs can join. Replaying the same requestId answers the
// same agent with a fresh token.
func (s *Server) handleAgentRegister(w http.ResponseWriter, r *http.Request) {
	if s.rateLimiters != nil && !s.rateLimiters.AgentRegisterAddr.allow(rateLimitAddr(clientIP(r))) {
		writeRateLimitResponse(w, s.rateLimiters.AgentRegisterAddr.config)
		return
	}
	q := r.URL.Query()
	req := agentRegisterRequest{Code: q.Get("code"), Name: q.Get("name"), Icon: q.Get("icon"), RequestID: q.Get("requestId")}
	if r.Method == http.MethodPost && r.ContentLength != 0 && strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		var body agentRegisterRequest
		if err := decodeJSONWithLimit(r, &body, 4<<10); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "Invalid JSON body")
			return
		}
		if body.Code != "" {
			req.Code = body.Code
		}
		if body.Name != "" {
			req.Name = body.Name
		}
		if body.Icon != "" {
			req.Icon = body.Icon
		}
		if body.RequestID != "" {
			req.RequestID = body.RequestID
		}
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Icon = strings.ToLower(strings.TrimSpace(req.Icon))
	req.RequestID = strings.TrimSpace(req.RequestID)
	switch {
	case !validAgentName(req.Name):
		writeError(w, http.StatusBadRequest, "validation_error", "name must be 1-40 characters, with no '@' and no control characters")
		return
	case req.RequestID == "" || len(req.RequestID) > 128:
		writeError(w, http.StatusBadRequest, "validation_error", "requestId is required (a fresh UUID per agent; reuse it to retry)")
		return
	case req.Icon != "" && !agentIconPattern.MatchString(req.Icon):
		writeError(w, http.StatusBadRequest, "validation_error", "icon must be a short lowercase slug, e.g. anthropic")
		return
	}

	reg, err := s.store.RegisterAgent(req.Code, req.Name, req.Icon, req.RequestID)
	switch {
	case errors.Is(err, store.ErrAgentJoinInvalid):
		writeError(w, http.StatusBadRequest, "invalid_join_link", "This join link is invalid, expired or revoked")
		return
	case errors.Is(err, store.ErrAgentLinkFull):
		writeError(w, http.StatusConflict, "join_link_full", err.Error())
		return
	case err != nil:
		slog.Error("agent register failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Registration failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"agent":            reg.Agent,
		"token":            reg.Token,
		"token_expires_at": reg.TokenExpiresAt,
		"workspace":        map[string]string{"id": reg.Agent.WorkspaceID, "slug": reg.WorkspaceSlug},
		"urls":             s.agentURLs(r, reg.Token),
	})
}

// handleAgentMe answers who the token is: the agent and its workspace.
func (s *Server) handleAgentMe(w http.ResponseWriter, r *http.Request) {
	p := agentPrincipal(r)
	agent, err := s.store.GetWorkspaceAgent(p.WorkspaceID, p.AgentID)
	if err != nil || agent == nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "Could not read the agent")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"agent":     agent,
		"workspace": map[string]string{"id": p.WorkspaceID, "slug": p.WorkspaceSlug},
	})
}
