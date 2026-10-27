package server

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

// An agent's writes (SPEC-15, TASK-18): comment on, change the status of,
// claim and release the items ASSIGNED to it. GET with query parameters and
// POST (JSON body or query) are the same request, so an agent that only
// fetches URLs can work. Every write needs a requestId; a retry with the same
// id and parameters replays the first answer instead of writing again.
//
// Each write runs the /api/v1 handler in process under the agent's context
// (the pattern internal/mcp's HTTP dispatcher uses), so validation,
// attribution, the activity feed, SSE and watch notifications are exactly
// those of a person's write. The agent is the author: X-Pad-Agent carries its
// name, so the row reads created_by='agent'.

const agentWriteBodyLimit = 64 << 10

type agentWriteOp struct {
	name    string
	handler func(*Server, http.ResponseWriter, *http.Request)
	method  string
	suffix  string // the /api/v1 item sub-path the handler serves
	body    func(p map[string]string) (map[string]any, string)
}

var agentWriteOps = map[string]agentWriteOp{
	"comment": {
		name: "comment", handler: (*Server).handleCreateComment, method: http.MethodPost, suffix: "/comments",
		body: func(p map[string]string) (map[string]any, string) {
			if strings.TrimSpace(p["body"]) == "" {
				return nil, "body is required"
			}
			return map[string]any{"body": p["body"]}, ""
		},
	},
	"status": {
		name: "status", handler: (*Server).handleUpdateItem, method: http.MethodPatch, suffix: "",
		body: func(p map[string]string) (map[string]any, string) {
			status := strings.TrimSpace(p["status"])
			if status == "" {
				return nil, "status is required"
			}
			b := map[string]any{"fields_patch": map[string]any{"status": status}}
			if c := strings.TrimSpace(p["comment"]); c != "" {
				b["comment"] = c
			}
			return b, ""
		},
	},
	"claim": {
		name: "claim", handler: (*Server).handleClaimItem, method: http.MethodPost, suffix: "/claim",
		body: func(p map[string]string) (map[string]any, string) {
			b := map[string]any{}
			if v := p["ttl_seconds"]; v != "" {
				n, err := strconv.Atoi(v)
				if err != nil || n <= 0 {
					return nil, "ttl_seconds must be a positive whole number"
				}
				b["ttl_seconds"] = n
			}
			return b, ""
		},
	},
	"release": {
		name: "release", handler: (*Server).handleReleaseItem, method: http.MethodPost, suffix: "/release",
		body: func(p map[string]string) (map[string]any, string) { return map[string]any{}, "" },
	},
}

// agentWriteParams merges the query with a POST body (JSON object of strings
// or numbers). The token never counts as a parameter.
func agentWriteParams(w http.ResponseWriter, r *http.Request) (map[string]string, bool) {
	p := map[string]string{}
	for k, v := range r.URL.Query() {
		if len(v) > 0 {
			p[k] = v[0]
		}
	}
	if r.Method == http.MethodPost && r.ContentLength != 0 && strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		var body map[string]any
		if err := decodeJSONWithLimit(r, &body, agentWriteBodyLimit); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "Invalid JSON body")
			return nil, false
		}
		for k, v := range body {
			switch t := v.(type) {
			case string:
				p[k] = t
			case float64:
				p[k] = strconv.FormatFloat(t, 'f', -1, 64)
			}
		}
	}
	delete(p, "token")
	return p, true
}

func agentWriteFingerprint(op, itemID string, p map[string]string) string {
	keys := make([]string, 0, len(p))
	for k := range p {
		if k != "requestId" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	h := sha256.New()
	h.Write([]byte(op + "\x00" + itemID))
	for _, k := range keys {
		h.Write([]byte("\x00" + k + "=" + p[k]))
	}
	return hex.EncodeToString(h.Sum(nil))
}

func (s *Server) handleAgentWrite(w http.ResponseWriter, r *http.Request) {
	op, ok := agentWriteOps[chi.URLParam(r, "op")]
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "Unknown action; use comment, status, claim or release")
		return
	}
	p := agentPrincipal(r)
	params, ok := agentWriteParams(w, r)
	if !ok {
		return
	}
	requestID := strings.TrimSpace(params["requestId"])
	if requestID == "" || len(requestID) > 128 {
		writeError(w, http.StatusBadRequest, "validation_error", "requestId is required (a fresh UUID per write; reuse it to retry)")
		return
	}
	body, problem := op.body(params)
	if problem != "" {
		writeError(w, http.StatusBadRequest, "validation_error", problem)
		return
	}

	item, err := s.store.ResolveItem(p.WorkspaceID, chi.URLParam(r, "itemSlug"))
	if err != nil {
		writeInternalError(w, err)
		return
	}
	if item == nil || !s.requireItemVisible(w, r, p.WorkspaceID, item) {
		if item == nil {
			writeError(w, http.StatusNotFound, "not_found", "Item not found")
		}
		return
	}
	// The agent writes only where it was put to work (SPEC-15 decision 4).
	if item.AssignedUserID == nil || *item.AssignedUserID != p.UserID {
		writeError(w, http.StatusForbidden, "not_assigned", item.Ref+" is not assigned to this agent; it can only write to its own tasks")
		return
	}

	fp := agentWriteFingerprint(op.name, item.ID, params)
	prior, err := s.store.ReserveAgentRequest(p.AgentID, requestID, fp)
	if err != nil {
		writeInternalError(w, err)
		return
	}
	if prior != nil {
		switch {
		case prior.Fingerprint != fp:
			writeError(w, http.StatusConflict, "request_id_reused", "This requestId was used for a different write; use a fresh one")
		case prior.Status == 0:
			writeError(w, http.StatusConflict, "request_in_progress", "This requestId is still being written; retry it shortly")
		default:
			w.Header().Set("X-Pad-Replayed", "true")
			w.WriteHeader(prior.Status)
			_, _ = w.Write([]byte(prior.Response))
		}
		return
	}

	rec := s.runAgentSubRequest(r, op, item.ID, body)
	if rec.Code >= http.StatusInternalServerError {
		if err := s.store.ReleaseAgentRequest(p.AgentID, requestID); err != nil {
			slog.Warn("agent write: release reservation failed", "error", err)
		}
	} else if err := s.store.CompleteAgentRequest(p.AgentID, requestID, rec.Code, rec.Body.String()); err != nil {
		slog.Warn("agent write: record answer failed", "error", err)
	}
	w.WriteHeader(rec.Code)
	_, _ = w.Write(rec.Body.Bytes())
}

// runAgentSubRequest runs op's /api/v1 handler for itemID under the agent's
// request context.
func (s *Server) runAgentSubRequest(r *http.Request, op agentWriteOp, itemID string, body map[string]any) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(body)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("itemSlug", itemID)
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, rctx)
	sub := httptest.NewRequest(op.method, "/api/v1/workspaces/-/items/"+itemID+op.suffix, bytes.NewReader(raw)).WithContext(ctx)
	sub.Header.Set("Content-Type", "application/json")
	sub.Header.Set("X-Pad-Agent", agentPrincipal(r).DisplayName)
	// A marker, not a credential: actorFromRequest reads any Authorization
	// header as an API caller (source "cli"). Nothing re-authenticates the
	// sub-request; the agent's context already carries its identity.
	sub.Header.Set("Authorization", "Bearer padagt")
	sub.RemoteAddr = r.RemoteAddr
	rec := httptest.NewRecorder()
	op.handler(s, rec, sub)
	return rec
}
