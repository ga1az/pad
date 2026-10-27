-- Migration 127 (Postgres): agents that join a workspace through a link (SPEC-15, TASK-16).
-- Postgres counterpart to migrations/160_agent_join.sql; the rationale is there.
-- Additive only: new tables, nothing existing is altered or dropped.

CREATE TABLE IF NOT EXISTS agent_join_links (
    id                 TEXT PRIMARY KEY,
    workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    code_sha256        TEXT NOT NULL UNIQUE,
    label              TEXT NOT NULL DEFAULT '',
    created_by_user_id TEXT NOT NULL DEFAULT '',
    max_agents         INTEGER NOT NULL DEFAULT 20 CHECK (max_agents >= 1),
    expires_at         TEXT NOT NULL,
    revoked_at         TEXT,
    created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_join_links_workspace ON agent_join_links(workspace_id);

CREATE TABLE IF NOT EXISTS workspace_agents (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id             TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    link_id             TEXT REFERENCES agent_join_links(id) ON DELETE SET NULL,
    register_request_id TEXT NOT NULL,
    display_name        TEXT NOT NULL,
    icon                TEXT NOT NULL DEFAULT '',
    last_seq            BIGINT NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
    acked_seq           BIGINT NOT NULL DEFAULT 0 CHECK (acked_seq >= 0),
    batch_id            TEXT,
    batch_end_seq       BIGINT NOT NULL DEFAULT 0 CHECK (batch_end_seq >= 0),
    acked_batch_id      TEXT,
    created_at          TEXT NOT NULL,
    last_seen_at        TEXT,
    revoked_at          TEXT,
    UNIQUE (link_id, register_request_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_agents_workspace ON workspace_agents(workspace_id);

CREATE TABLE IF NOT EXISTS agent_tokens (
    id           TEXT PRIMARY KEY,
    agent_id     TEXT NOT NULL REFERENCES workspace_agents(id) ON DELETE CASCADE,
    token_sha256 TEXT NOT NULL UNIQUE,
    expires_at   TEXT NOT NULL,
    revoked_at   TEXT,
    created_at   TEXT NOT NULL,
    last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_tokens_agent ON agent_tokens(agent_id);

-- One row per event an agent must see, numbered per agent (TASK-17).
CREATE TABLE IF NOT EXISTS agent_inbox (
    id         TEXT PRIMARY KEY,
    agent_id   TEXT NOT NULL REFERENCES workspace_agents(id) ON DELETE CASCADE,
    seq        BIGINT NOT NULL CHECK (seq >= 1),
    kind       TEXT NOT NULL,
    item_id    TEXT NOT NULL DEFAULT '',
    payload    TEXT NOT NULL DEFAULT '{}',
    dedupe_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (agent_id, seq),
    UNIQUE (agent_id, dedupe_key)
);

-- Idempotency for an agent's writes (TASK-18): the first answer to a
-- request_id is replayed for a retry of it.
CREATE TABLE IF NOT EXISTS agent_requests (
    agent_id    TEXT NOT NULL REFERENCES workspace_agents(id) ON DELETE CASCADE,
    request_id  TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    status      INTEGER NOT NULL,
    response    TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    PRIMARY KEY (agent_id, request_id)
);
