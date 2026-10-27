package server

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"text/template"
	"unicode"

	"github.com/PerpetualSoftware/pad/internal/store"
)

// The join link's document (SPEC-15, TASK-19): GET /api/agent/v1/join?code=
// answers an OpenAPI 3.1 description of the agent API with this link's code
// filled in, so an agent handed only the link knows how to register, listen
// and report. It grants nothing: it describes what the token allows.

//go:embed agent_openapi.yaml.tmpl
var agentOpenAPITemplate string

var agentOpenAPI = template.Must(template.New("agent-openapi").Parse(agentOpenAPITemplate))

type agentOpenAPIData struct {
	Title, WorkspaceLine, BaseURLQuoted, CodeQuoted string
	TokenTTL, LinkExpiresAt                         string
}

// yamlQuoted renders s as a double-quoted scalar: a JSON string is one.
func yamlQuoted(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// oneLine keeps a person-written value (a workspace name) from breaking the
// document's block text: no control characters, no line breaks.
func oneLine(s string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, strings.TrimSpace(s))
}

func (s *Server) handleAgentJoinDocument(w http.ResponseWriter, r *http.Request) {
	if s.rateLimiters != nil && !s.rateLimiters.AgentRegisterAddr.allow(rateLimitAddr(clientIP(r))) {
		writeRateLimitResponse(w, s.rateLimiters.AgentRegisterAddr.config)
		return
	}
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	target, err := s.store.LookupAgentJoinLink(code)
	if errors.Is(err, store.ErrAgentJoinInvalid) {
		writeError(w, http.StatusNotFound, "invalid_join_link", "This join link is invalid, expired or revoked. Ask the person who sent it for a new one.")
		return
	}
	if err != nil {
		slog.Error("agent join document failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Could not read the join link")
		return
	}
	name := oneLine(target.WorkspaceName)
	data := agentOpenAPIData{
		Title:         yamlQuoted("Pad workspace " + name + " for agents"),
		WorkspaceLine: `"` + strings.ReplaceAll(name, `"`, `'`) + `" (` + target.WorkspaceSlug + `)`,
		BaseURLQuoted: yamlQuoted(oneLine(s.agentBaseURL(r)) + agentAPIPrefix),
		CodeQuoted:    yamlQuoted(code),
		TokenTTL:      "7 days",
		LinkExpiresAt: target.ExpiresAt.UTC().Format("2006-01-02 15:04 UTC"),
	}
	var buf bytes.Buffer
	if err := agentOpenAPI.Execute(&buf, data); err != nil {
		slog.Error("agent join document: render failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "Could not render the document")
		return
	}
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	_, _ = w.Write(buf.Bytes())
}
