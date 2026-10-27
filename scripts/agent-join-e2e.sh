#!/usr/bin/env bash
# agent-join-e2e.sh — SPEC-15's end-to-end check (TASK-21): an agent with
# nothing but curl joins a workspace through a link, is assigned a task, hears
# about it, talks on it, and loses access when revoked.
#
#   scripts/agent-join-e2e.sh <pad-binary> [port]
#
# It boots a THROWAWAY server: its own data dir and HOME under
# ${XDG_CACHE_HOME:-~/.cache} (not /tmp, which is RAM here) and its own port,
# so it never touches a running instance or its database. The person's side
# (setup, workspace, task, link, assignment, comment, revoke) uses the pad CLI;
# the agent's side is curl only. Each acceptance criterion prints PASS or the
# run stops at the first FAIL. The scratch dir is removed on exit.
set -euo pipefail

bin=$(realpath "${1:?usage: agent-join-e2e.sh <pad-binary> [port]}")
port=${2:-7811}
url="http://127.0.0.1:$port"
work=$(mktemp -d -p "${XDG_CACHE_HOME:-$HOME/.cache}" pad-agent-e2e.XXXXXX)
server_pid=""
cleanup() {
	[[ -n $server_pid ]] && kill "$server_pid" 2>/dev/null && wait "$server_pid" 2>/dev/null || true
	rm -rf "$work"
}
trap cleanup EXIT

say() { printf 'agent-e2e: %s\n' "$*"; }
pass() { printf 'agent-e2e: PASS %s\n' "$*"; }
fail() { printf 'agent-e2e: FAIL %s\n' "$*" >&2; [[ -f $work/server.log ]] && tail -20 "$work/server.log" >&2; exit 1; }
need() { command -v "$1" >/dev/null || fail "needs $1"; }
need curl
need jq

person() { (cd "$work/ws" && HOME="$work/home" "$bin" "$@"); }
uuid() { cat /proc/sys/kernel/random/uuid; }

mkdir -p "$work/home" "$work/data" "$work/ws"
say "booting a throwaway server on $url (data in $work)"
HOME="$work/home" PAD_DATA_DIR="$work/data" "$bin" server start --port "$port" >"$work/server.log" 2>&1 &
server_pid=$!
for _ in $(seq 1 50); do curl -fsS "$url/api/v1/health" >/dev/null 2>&1 && break; sleep 0.2; done
curl -fsS "$url/api/v1/health" >/dev/null || fail "the server did not come up"

password=$(head -c 18 /dev/urandom | base64 | tr -d '/+=')Aa1!
person auth setup --url "$url" --email e2e@pad.test --name "E2E Owner" --password "$password" >/dev/null
person workspace init "Agent E2E" --template startup --url "$url" >/dev/null
ref=$(person item create task "Wire the agent inbox" --format json | jq -r '.ref')
slug=$(sed -n 's/^workspace = "\(.*\)"$/\1/p' "$work/ws/.pad.toml")
owner_token=$(jq -r --arg u "$url" '.credentials[$u].token' "$work/home/.pad/credentials.json")
[[ $ref == TASK-* && -n $slug && $owner_token == padsess_* ]] || fail "setup: ref=$ref slug=$slug"
link=$(person agent link create --label e2e --format json)
join_url=$(jq -r '.url' <<<"$link")
code=$(jq -r '.code' <<<"$link")

# --- AC-1: the link alone is enough, with curl -------------------------------
doc=$(curl -fsS "$join_url")
grep -q '^openapi: 3.1.0' <<<"$doc" || fail "AC-1: the link is not an OpenAPI document"
grep -q -- "$code" <<<"$doc" || fail "AC-1: the document does not carry the code"
api="$url/api/agent/v1"
reg=$(curl -fsS -G "$api/join/register" --data-urlencode "code=$code" --data-urlencode "name=Curl Agent" \
	--data-urlencode "requestId=$(uuid)" --data-urlencode "icon=anthropic")
token=$(jq -r '.token' <<<"$reg")
agent_id=$(jq -r '.agent.id' <<<"$reg")
bot=$(jq -r '.agent.user_id' <<<"$reg")
[[ $token == padagt_* ]] || fail "AC-1: no token in $reg"
[[ $(curl -fsS "$api/me?token=$token" | jq -r '.agent.display_name') == "Curl Agent" ]] || fail "AC-1: /me"
pass "AC-1 the agent read the link and registered with curl only"

# --- AC-2: confined to the agent API -----------------------------------------
for spec in "GET /api/v1/workspaces" "POST /api/v1/auth/tokens"; do
	read -r method path <<<"$spec"
	code_got=$(curl -s -o /dev/null -w '%{http_code}' -X "$method" -H "Authorization: Bearer $token" "$url$path")
	[[ $code_got == 401 ]] || fail "AC-2: $spec with the agent token = $code_got, want 401"
done
pass "AC-2 the agent token reaches nothing outside /api/agent/v1"

# --- AC-3: assigned, with the brief ------------------------------------------
curl -fsS -X PATCH -H "Authorization: Bearer $owner_token" -H 'Content-Type: application/json' \
	-d "{\"assigned_user_id\":\"$bot\"}" "$url/api/v1/workspaces/$slug/items/$ref" >/dev/null
act=$(curl -fsS "$api/activity?token=$token&wait=0")
batch=$(jq -r '.batchId' <<<"$act")
[[ $(jq -r '.events[0].kind' <<<"$act") == assigned ]] || fail "AC-3: first event is not assigned: $act"
[[ $(jq -r '.events[0].brief.item.title' <<<"$act") == "Wire the agent inbox" ]] || fail "AC-3: the brief lacks the task"
jq -e '.events[0].brief.conventions | type == "array"' <<<"$act" >/dev/null || fail "AC-3: the brief lacks conventions"
pass "AC-3 the assignment arrived with the brief ($ref)"

# --- AC-4: nothing lost while away, batches repeat until acked ---------------
person item comment "$ref" "While you were away: cover the retry path." >/dev/null
again=$(curl -fsS "$api/activity?token=$token&wait=0")
[[ $(jq -r '.batchId' <<<"$again") == "$batch" ]] || fail "AC-4: an unacknowledged batch did not repeat"
next=$(curl -fsS "$api/activity?token=$token&wait=0&ackBatch=$batch")
[[ $(jq -r '.events[0].kind' <<<"$next") == comment ]] || fail "AC-4: the comment made while away is missing: $next"
jq -r '.events[0].payload.summary' <<<"$next" | grep -q 'retry path' || fail "AC-4: wrong comment"
curl -fsS "$api/activity?token=$token&wait=0&ackBatch=$(jq -r '.batchId' <<<"$next")" >/dev/null
pass "AC-4 the comment made while the agent was away was delivered after the ack"

# --- AC-5: the agent reports on its task, as itself --------------------------
rid=$(uuid)
c1=$(curl -fsS -G "$api/items/$ref/comment" --data-urlencode "token=$token" --data-urlencode "requestId=$rid" \
	--data-urlencode "body=Done. Verified with go test ./internal/server -run TestAgent.")
c2=$(curl -fsS -G "$api/items/$ref/comment" --data-urlencode "token=$token" --data-urlencode "requestId=$rid" \
	--data-urlencode "body=Done. Verified with go test ./internal/server -run TestAgent.")
[[ $(jq -r '.id' <<<"$c1") == "$(jq -r '.id' <<<"$c2")" ]] || fail "AC-5: a retry wrote a second comment"
[[ $(jq -r '.created_by' <<<"$c1") == agent && $(jq -r '.author' <<<"$c1") == "Curl Agent" ]] || fail "AC-5: attribution: $c1"
curl -fsS -G "$api/items/$ref/status" --data-urlencode "token=$token" --data-urlencode "requestId=$(uuid)" \
	--data-urlencode "status=in-progress" --data-urlencode "comment=Started" >/dev/null
[[ $(person item show "$ref" --format json | jq -r '(.fields | if type == "string" then fromjson else . end).status') == in-progress ]] ||
	fail "AC-5: the status did not change"
pass "AC-5 the agent commented (idempotent retry) and moved $ref to in-progress, as itself"

# --- AC-6: revoked means 401 -------------------------------------------------
person agent revoke "$agent_id" >/dev/null
[[ $(curl -s -o /dev/null -w '%{http_code}' "$api/me?token=$token") == 401 ]] || fail "AC-6: a revoked token still works"
pass "AC-6 after revoke the agent gets 401"

# --- AC-7: no secret in the server log ---------------------------------------
grep -qF -- "$token" "$work/server.log" && fail "AC-7: the agent token is in the server log"
grep -qF -- "$code" "$work/server.log" && fail "AC-7: the join code is in the server log"
grep -q 'REDACTED' "$work/server.log" || fail "AC-7: no redacted request was logged at all (is request logging on?)"
pass "AC-7 neither the join code nor the token reached the server log"

say "all acceptance criteria passed"
