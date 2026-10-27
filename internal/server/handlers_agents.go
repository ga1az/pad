package server

import (
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/PerpetualSoftware/pad/internal/store"
)

// Owner doors for agents that join through a link (SPEC-15, TASK-16):
// /api/v1/workspaces/{ws}/agent-links and /agents.

type agentJoinLinkCreateRequest struct {
	Label string `json:"label"`
}

// handleCreateAgentJoinLink mints a join link. Owner-only and, like token
// minting (BUG-2890), refused to a PAT: a link mints agent credentials, so a
// credential that could mint links would outlive its own revocation.
func (s *Server) handleCreateAgentJoinLink(w http.ResponseWriter, r *http.Request) {
	if !requireInteractiveSession(w, r) {
		return
	}
	if !requireMinRole(w, r, "owner") {
		return
	}
	workspaceID, ok := s.getWorkspaceID(w, r)
	if !ok {
		return
	}
	var req agentJoinLinkCreateRequest
	if r.ContentLength != 0 {
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", err.Error())
			return
		}
	}
	label := strings.TrimSpace(req.Label)
	if len(label) > 80 || strings.ContainsRune(label, 0) {
		writeError(w, http.StatusBadRequest, "validation_error", "label must be at most 80 characters")
		return
	}
	link, err := s.store.CreateAgentJoinLink(workspaceID, currentUserID(r), label)
	if err != nil {
		slog.Error("create agent join link failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Could not create the join link")
		return
	}
	link.URL = s.agentJoinURL(r, link.Code)
	writeJSON(w, http.StatusCreated, link)
}

// agentJoinURL is the link an owner hands an agent.
func (s *Server) agentJoinURL(r *http.Request, code string) string {
	return s.agentBaseURL(r) + agentAPIPrefix + "/join?code=" + url.QueryEscape(code)
}

func (s *Server) handleListAgentJoinLinks(w http.ResponseWriter, r *http.Request) {
	if !requireMinRole(w, r, "owner") {
		return
	}
	workspaceID, ok := s.getWorkspaceID(w, r)
	if !ok {
		return
	}
	links, err := s.store.ListAgentJoinLinks(workspaceID)
	if err != nil {
		slog.Error("list agent join links failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Could not list join links")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"links": links})
}

func (s *Server) handleRevokeAgentJoinLink(w http.ResponseWriter, r *http.Request) {
	if !requireMinRole(w, r, "owner") {
		return
	}
	workspaceID, ok := s.getWorkspaceID(w, r)
	if !ok {
		return
	}
	err := s.store.RevokeAgentJoinLink(workspaceID, chi.URLParam(r, "linkID"))
	if errors.Is(err, store.ErrAgentNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "Join link not found")
		return
	}
	if err != nil {
		slog.Error("revoke agent join link failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Could not revoke the join link")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleListWorkspaceAgents lists the agents any member may assign work to;
// ?all=true adds revoked ones for an owner.
func (s *Server) handleListWorkspaceAgents(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := s.getWorkspaceID(w, r)
	if !ok {
		return
	}
	all := r.URL.Query().Get("all") == "true"
	if all && !requireMinRole(w, r, "owner") {
		return
	}
	agents, err := s.store.ListWorkspaceAgents(workspaceID, all)
	if err != nil {
		slog.Error("list workspace agents failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Could not list agents")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"agents": agents})
}

func (s *Server) handleRevokeWorkspaceAgent(w http.ResponseWriter, r *http.Request) {
	if !requireMinRole(w, r, "owner") {
		return
	}
	workspaceID, ok := s.getWorkspaceID(w, r)
	if !ok {
		return
	}
	err := s.store.RevokeAgent(workspaceID, chi.URLParam(r, "agentID"))
	if errors.Is(err, store.ErrAgentNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "Agent not found")
		return
	}
	if err != nil {
		slog.Error("revoke agent failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Could not revoke the agent")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
