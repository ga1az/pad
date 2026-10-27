-- Layer B of the NUL invariant (DOC-2823 S2), for columns added after 084.
--
-- GENERATED from internal/store/nulcolumns.go. Do not edit by hand — run
--   GEN_NUL_TRIGGERS=1 go test ./internal/store/ -run TestGenerateNULTriggerMigration
-- and commit the result. TestNULTriggersMatchTheList fails if this file and the
-- Go list disagree.
--
-- WHY A SEPARATE FILE (BUG-3108). A trigger can only follow its column. 084
-- runs before these columns exist, and SQLite re-parses every trigger during
-- an ALTER TABLE ... RENAME, so a trigger there naming a later column breaks
-- the next table rebuild. The predicate, the marker and the SQLite-only scope
-- are 084's; its header carries the measurements.

CREATE TRIGGER IF NOT EXISTS pad_nul161_agent_inbox_payload_ins
BEFORE INSERT ON agent_inbox
FOR EACH ROW WHEN NEW.payload IS NOT NULL AND (
			instr(NEW.payload, char(0)) > 0
			OR (json_valid(NEW.payload) AND EXISTS (
				SELECT 1 FROM json_tree(NEW.payload)
				WHERE instr(value, char(0)) > 0 OR instr(key, char(0)) > 0
			))
)
BEGIN
	SELECT RAISE(ABORT, 'pad_nul_invariant: agent_inbox.payload must not contain a NUL');
END;

CREATE TRIGGER IF NOT EXISTS pad_nul161_agent_inbox_payload_upd
BEFORE UPDATE OF payload ON agent_inbox
FOR EACH ROW WHEN NEW.payload IS NOT NULL AND (
			instr(NEW.payload, char(0)) > 0
			OR (json_valid(NEW.payload) AND EXISTS (
				SELECT 1 FROM json_tree(NEW.payload)
				WHERE instr(value, char(0)) > 0 OR instr(key, char(0)) > 0
			))
)
BEGIN
	SELECT RAISE(ABORT, 'pad_nul_invariant: agent_inbox.payload must not contain a NUL');
END;

CREATE TRIGGER IF NOT EXISTS pad_nul161_agent_join_links_label_ins
BEFORE INSERT ON agent_join_links
FOR EACH ROW WHEN NEW.label IS NOT NULL AND (
			instr(NEW.label, char(0)) > 0
)
BEGIN
	SELECT RAISE(ABORT, 'pad_nul_invariant: agent_join_links.label must not contain a NUL');
END;

CREATE TRIGGER IF NOT EXISTS pad_nul161_agent_join_links_label_upd
BEFORE UPDATE OF label ON agent_join_links
FOR EACH ROW WHEN NEW.label IS NOT NULL AND (
			instr(NEW.label, char(0)) > 0
)
BEGIN
	SELECT RAISE(ABORT, 'pad_nul_invariant: agent_join_links.label must not contain a NUL');
END;

CREATE TRIGGER IF NOT EXISTS pad_nul161_agent_requests_request_id_ins
BEFORE INSERT ON agent_requests
FOR EACH ROW WHEN NEW.request_id IS NOT NULL AND (
			instr(NEW.request_id, char(0)) > 0
)
BEGIN
	SELECT RAISE(ABORT, 'pad_nul_invariant: agent_requests.request_id must not contain a NUL');
END;

CREATE TRIGGER IF NOT EXISTS pad_nul161_agent_requests_request_id_upd
BEFORE UPDATE OF request_id ON agent_requests
FOR EACH ROW WHEN NEW.request_id IS NOT NULL AND (
			instr(NEW.request_id, char(0)) > 0
)
BEGIN
	SELECT RAISE(ABORT, 'pad_nul_invariant: agent_requests.request_id must not contain a NUL');
END;

CREATE TRIGGER IF NOT EXISTS pad_nul161_agent_requests_response_ins
BEFORE INSERT ON agent_requests
FOR EACH ROW WHEN NEW.response IS NOT NULL AND (
			instr(NEW.response, char(0)) > 0
			OR (json_valid(NEW.response) AND EXISTS (
				SELECT 1 FROM json_tree(NEW.response)
				WHERE instr(value, char(0)) > 0 OR instr(key, char(0)) > 0
			))
)
BEGIN
	SELECT RAISE(ABORT, 'pad_nul_invariant: agent_requests.response must not contain a NUL');
END;

CREATE TRIGGER IF NOT EXISTS pad_nul161_agent_requests_response_upd
BEFORE UPDATE OF response ON agent_requests
FOR EACH ROW WHEN NEW.response IS NOT NULL AND (
			instr(NEW.response, char(0)) > 0
			OR (json_valid(NEW.response) AND EXISTS (
				SELECT 1 FROM json_tree(NEW.response)
				WHERE instr(value, char(0)) > 0 OR instr(key, char(0)) > 0
			))
)
BEGIN
	SELECT RAISE(ABORT, 'pad_nul_invariant: agent_requests.response must not contain a NUL');
END;

CREATE TRIGGER IF NOT EXISTS pad_nul161_workspace_agents_display_name_ins
BEFORE INSERT ON workspace_agents
FOR EACH ROW WHEN NEW.display_name IS NOT NULL AND (
			instr(NEW.display_name, char(0)) > 0
)
BEGIN
	SELECT RAISE(ABORT, 'pad_nul_invariant: workspace_agents.display_name must not contain a NUL');
END;

CREATE TRIGGER IF NOT EXISTS pad_nul161_workspace_agents_display_name_upd
BEFORE UPDATE OF display_name ON workspace_agents
FOR EACH ROW WHEN NEW.display_name IS NOT NULL AND (
			instr(NEW.display_name, char(0)) > 0
)
BEGIN
	SELECT RAISE(ABORT, 'pad_nul_invariant: workspace_agents.display_name must not contain a NUL');
END;

CREATE TRIGGER IF NOT EXISTS pad_nul161_workspace_agents_icon_ins
BEFORE INSERT ON workspace_agents
FOR EACH ROW WHEN NEW.icon IS NOT NULL AND (
			instr(NEW.icon, char(0)) > 0
)
BEGIN
	SELECT RAISE(ABORT, 'pad_nul_invariant: workspace_agents.icon must not contain a NUL');
END;

CREATE TRIGGER IF NOT EXISTS pad_nul161_workspace_agents_icon_upd
BEFORE UPDATE OF icon ON workspace_agents
FOR EACH ROW WHEN NEW.icon IS NOT NULL AND (
			instr(NEW.icon, char(0)) > 0
)
BEGIN
	SELECT RAISE(ABORT, 'pad_nul_invariant: workspace_agents.icon must not contain a NUL');
END;

CREATE TRIGGER IF NOT EXISTS pad_nul161_workspace_agents_register_request_id_ins
BEFORE INSERT ON workspace_agents
FOR EACH ROW WHEN NEW.register_request_id IS NOT NULL AND (
			instr(NEW.register_request_id, char(0)) > 0
)
BEGIN
	SELECT RAISE(ABORT, 'pad_nul_invariant: workspace_agents.register_request_id must not contain a NUL');
END;

CREATE TRIGGER IF NOT EXISTS pad_nul161_workspace_agents_register_request_id_upd
BEFORE UPDATE OF register_request_id ON workspace_agents
FOR EACH ROW WHEN NEW.register_request_id IS NOT NULL AND (
			instr(NEW.register_request_id, char(0)) > 0
)
BEGIN
	SELECT RAISE(ABORT, 'pad_nul_invariant: workspace_agents.register_request_id must not contain a NUL');
END;

