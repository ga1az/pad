package models

import "time"

// AgentJoinLink is an owner-minted invitation through which an agent with
// nothing but HTTP joins a workspace (SPEC-15, TASK-16). Only the code's hash
// is stored, so the plaintext URL exists only in the create response.
type AgentJoinLink struct {
	ID          string     `json:"id"`
	WorkspaceID string     `json:"workspace_id"`
	Label       string     `json:"label"`
	CreatedBy   string     `json:"created_by,omitempty"`
	MaxAgents   int        `json:"max_agents"`
	AgentCount  int        `json:"agent_count"`
	ExpiresAt   time.Time  `json:"expires_at"`
	RevokedAt   *time.Time `json:"revoked_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

// AgentJoinLinkWithCode is the create response: the only time the code is shown.
// InviteMessage is the text to paste into an agent's session: what the link is
// and what to do with it, then the link (TASK-23). Web and CLI copy it as-is.
type AgentJoinLinkWithCode struct {
	AgentJoinLink
	Code          string `json:"code"`
	URL           string `json:"url"`
	InviteMessage string `json:"invite_message"`
}

// WorkspaceAgent is an agent that registered through a join link. It acts as
// the bot principal UserID, an editor member of WorkspaceID.
type WorkspaceAgent struct {
	ID          string     `json:"id"`
	WorkspaceID string     `json:"workspace_id"`
	UserID      string     `json:"user_id"`
	LinkID      string     `json:"link_id,omitempty"`
	DisplayName string     `json:"display_name"`
	Icon        string     `json:"icon,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	LastSeenAt  *time.Time `json:"last_seen_at,omitempty"`
	RevokedAt   *time.Time `json:"revoked_at,omitempty"`
}

// AgentRegistration is what a successful register returns: the agent and its
// padagt_ token, shown once.
type AgentRegistration struct {
	Agent          WorkspaceAgent `json:"agent"`
	Token          string         `json:"token"`
	TokenExpiresAt time.Time      `json:"token_expires_at"`
	WorkspaceSlug  string         `json:"workspace_slug"`
}

// AgentPrincipal is the request-time identity a valid padagt_ token resolves to.
type AgentPrincipal struct {
	AgentID       string
	WorkspaceID   string
	WorkspaceSlug string
	UserID        string
	DisplayName   string
	TokenID       string
}
