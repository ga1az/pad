package server

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"
)

type agentActivityEnv struct {
	*agentEnv
	token    string
	botID    string
	itemSlug string
	itemRef  string
}

// setupAssignedAgent registers an agent and assigns it a fresh task.
func setupAssignedAgent(t *testing.T) *agentActivityEnv {
	t.Helper()
	e := setupAgentEnv(t)
	if err := e.srv.store.SeedCollectionsFromTemplate(e.ws.ID, ""); err != nil {
		t.Fatalf("seed collections: %v", err)
	}
	code, _ := e.createJoinLink(t)
	reg := e.register(t, code, "Worker", "req-1")
	botID := reg["agent"].(map[string]any)["user_id"].(string)

	rr := doRequestWithBearer(e.srv, "POST", "/api/v1/workspaces/"+e.ws.Slug+"/collections/tasks/items", e.sessTok,
		map[string]any{"title": "Ship the inbox", "content": "Do the thing."})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create item = %d %s", rr.Code, rr.Body.String())
	}
	item := jsonMap(t, rr.Body.Bytes())
	env := &agentActivityEnv{agentEnv: e, token: reg["token"].(string), botID: botID,
		itemSlug: item["slug"].(string), itemRef: item["ref"].(string)}

	rr = doRequestWithBearer(e.srv, "PATCH", "/api/v1/workspaces/"+e.ws.Slug+"/items/"+env.itemSlug, e.sessTok,
		map[string]any{"assigned_user_id": botID})
	if rr.Code != http.StatusOK {
		t.Fatalf("assign to agent = %d %s", rr.Code, rr.Body.String())
	}
	return env
}

type activityAnswer struct {
	BatchID         *string `json:"batchId"`
	RemainingUnread int64   `json:"remainingUnread"`
	Events          []struct {
		Seq     int64             `json:"seq"`
		Kind    string            `json:"kind"`
		Payload map[string]string `json:"payload"`
		Brief   json.RawMessage   `json:"brief"`
	} `json:"events"`
}

func (e *agentActivityEnv) poll(t *testing.T, ack string, wait int) (int, activityAnswer) {
	t.Helper()
	q := url.Values{"token": {e.token}, "wait": {strconv.Itoa(wait)}}
	if ack != "" {
		q.Set("ackBatch", ack)
	}
	rr := doRequest(e.srv, "GET", agentAPIPrefix+"/activity?"+q.Encode(), nil)
	var a activityAnswer
	if rr.Code == http.StatusOK {
		if err := json.Unmarshal(rr.Body.Bytes(), &a); err != nil {
			t.Fatalf("decode activity: %v; body=%s", err, rr.Body.String())
		}
	}
	return rr.Code, a
}

func (e *agentActivityEnv) comment(t *testing.T, body string) {
	t.Helper()
	rr := doRequestWithBearer(e.srv, "POST", "/api/v1/workspaces/"+e.ws.Slug+"/items/"+e.itemSlug+"/comments", e.sessTok,
		map[string]any{"body": body})
	if rr.Code != http.StatusCreated {
		t.Fatalf("comment = %d %s", rr.Code, rr.Body.String())
	}
}

// AC-3: the assignment reaches the agent with the brief to start from.
func TestAgentActivityAssignedCarriesTheBrief(t *testing.T) {
	t.Parallel()
	e := setupAssignedAgent(t)

	code, a := e.poll(t, "", 0)
	if code != http.StatusOK || a.BatchID == nil || len(a.Events) != 1 {
		t.Fatalf("activity = %d %+v, want one event in a batch", code, a)
	}
	ev := a.Events[0]
	if ev.Kind != "assigned" || ev.Payload["item_ref"] != e.itemRef {
		t.Fatalf("event = %+v, want assigned for %s", ev, e.itemRef)
	}
	var brief struct {
		Item struct {
			Ref, Title, Content string
		} `json:"item"`
		Conventions []json.RawMessage `json:"conventions"`
	}
	if err := json.Unmarshal(ev.Brief, &brief); err != nil {
		t.Fatalf("brief does not decode: %v (%s)", err, ev.Brief)
	}
	if brief.Item.Ref != e.itemRef || brief.Item.Title != "Ship the inbox" || brief.Item.Content != "Do the thing." {
		t.Fatalf("brief item = %+v", brief.Item)
	}
	if brief.Conventions == nil {
		t.Fatal("brief has no conventions array")
	}

	// The same context is readable directly, with the agent's token.
	rr := doRequestWithBearer(e.srv, "GET", agentAPIPrefix+"/items/"+e.itemRef+"/context", e.token, nil)
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), "Ship the inbox") {
		t.Fatalf("agent context = %d %s", rr.Code, rr.Body.String())
	}
}

// AC-4: a batch repeats until acknowledged, and what happened while the agent
// was away is waiting for it.
func TestAgentActivityBatchesAndAcks(t *testing.T) {
	t.Parallel()
	e := setupAssignedAgent(t)

	_, first := e.poll(t, "", 0)
	_, again := e.poll(t, "", 0)
	if first.BatchID == nil || again.BatchID == nil || *first.BatchID != *again.BatchID || len(again.Events) != 1 {
		t.Fatalf("an unacknowledged batch did not repeat: %+v then %+v", first, again)
	}

	// The agent is not polling; a person comments.
	e.comment(t, "Please also cover the retry path.")

	_, next := e.poll(t, *first.BatchID, 0)
	if next.BatchID == nil || len(next.Events) != 1 || next.Events[0].Kind != "comment" ||
		!strings.Contains(next.Events[0].Payload["summary"], "retry path") {
		t.Fatalf("after ack = %+v, want the comment made while away", next)
	}

	// Retrying the previous ack is safe: it recovers the same next batch.
	if code, retry := e.poll(t, *first.BatchID, 0); code != http.StatusOK || retry.BatchID == nil || *retry.BatchID != *next.BatchID {
		t.Fatalf("retried ack = %d %+v, want batch %s again", code, retry, *next.BatchID)
	}
	if code, _ := e.poll(t, "b_not_a_batch", 0); code != http.StatusConflict {
		t.Fatalf("unknown ack = %d, want 409", code)
	}

	_, empty := e.poll(t, *next.BatchID, 0)
	if empty.BatchID != nil || len(empty.Events) != 0 {
		t.Fatalf("after acking everything = %+v, want an empty timeout", empty)
	}

	// The status change of an assigned item is an event too.
	rr := doRequestWithBearer(e.srv, "PATCH", "/api/v1/workspaces/"+e.ws.Slug+"/items/"+e.itemSlug, e.sessTok,
		map[string]any{"fields": `{"status":"in-progress"}`})
	if rr.Code != http.StatusOK {
		t.Fatalf("status change = %d %s", rr.Code, rr.Body.String())
	}
	_, status := e.poll(t, "", 0)
	if len(status.Events) != 1 || status.Events[0].Kind != "status" || status.Events[0].Payload["status"] != "in-progress" {
		t.Fatalf("status event = %+v", status)
	}
}

// An agent hears only about the items assigned to it.
func TestAgentActivityIgnoresOtherItems(t *testing.T) {
	t.Parallel()
	e := setupAssignedAgent(t)
	_, first := e.poll(t, "", 0)

	rr := doRequestWithBearer(e.srv, "POST", "/api/v1/workspaces/"+e.ws.Slug+"/collections/tasks/items", e.sessTok,
		map[string]any{"title": "Someone else's"})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create = %d", rr.Code)
	}
	other := jsonMap(t, rr.Body.Bytes())["slug"].(string)
	if rr := doRequestWithBearer(e.srv, "POST", "/api/v1/workspaces/"+e.ws.Slug+"/items/"+other+"/comments", e.sessTok,
		map[string]any{"body": "not for the agent"}); rr.Code != http.StatusCreated {
		t.Fatalf("comment = %d", rr.Code)
	}
	_, next := e.poll(t, *first.BatchID, 0)
	if len(next.Events) != 0 {
		t.Fatalf("the agent heard about an item not assigned to it: %+v", next)
	}
}

// A waiting poll returns as soon as an event arrives, not at the end of its wait.
func TestAgentActivityLongPollWakes(t *testing.T) {
	t.Parallel()
	e := setupAssignedAgent(t)
	_, first := e.poll(t, "", 0)

	done := make(chan activityAnswer, 1)
	start := time.Now()
	go func() {
		_, a := e.poll(t, *first.BatchID, 20)
		done <- a
	}()
	time.Sleep(200 * time.Millisecond)
	e.comment(t, "wake up")

	select {
	case a := <-done:
		if len(a.Events) != 1 || a.Events[0].Kind != "comment" {
			t.Fatalf("woken poll = %+v", a)
		}
		if waited := time.Since(start); waited > 10*time.Second {
			t.Fatalf("the poll waited %v; it should wake on the event", waited)
		}
	case <-time.After(15 * time.Second):
		t.Fatal("the long poll did not wake on a new event")
	}
}
