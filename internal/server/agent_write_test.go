package server

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func (e *agentActivityEnv) agentGET(t *testing.T, item, op string, q url.Values) *agentWriteResult {
	t.Helper()
	q.Set("token", e.token)
	rr := doRequest(e.srv, "GET", agentAPIPrefix+"/items/"+item+"/"+op+"?"+q.Encode(), nil)
	return &agentWriteResult{code: rr.Code, body: rr.Body.String(), replayed: rr.Header().Get("X-Pad-Replayed") == "true"}
}

type agentWriteResult struct {
	code     int
	body     string
	replayed bool
}

// AC-5: the agent comments on its task and moves it to review, as itself.
func TestAgentWritesOnItsOwnTask(t *testing.T) {
	t.Parallel()
	e := setupAssignedAgent(t)
	_, first := e.poll(t, "", 0) // the assignment

	res := e.agentGET(t, e.itemRef, "comment", url.Values{"body": {"Done: tests added."}, "requestId": {"c-1"}})
	if res.code != http.StatusCreated {
		t.Fatalf("comment = %d %s", res.code, res.body)
	}
	var comment map[string]any
	_ = json.Unmarshal([]byte(res.body), &comment)
	if comment["author"] != "Worker" || comment["created_by"] != "agent" {
		t.Fatalf("comment attribution = author %v, created_by %v; want the agent", comment["author"], comment["created_by"])
	}

	// A retry with the same requestId replays the answer and writes nothing.
	retry := e.agentGET(t, e.itemRef, "comment", url.Values{"body": {"Done: tests added."}, "requestId": {"c-1"}})
	if retry.code != http.StatusCreated || !retry.replayed || retry.body != res.body {
		t.Fatalf("retry = %d replayed=%v", retry.code, retry.replayed)
	}
	if reused := e.agentGET(t, e.itemRef, "comment", url.Values{"body": {"something else"}, "requestId": {"c-1"}}); reused.code != http.StatusConflict {
		t.Fatalf("reused requestId = %d, want 409", reused.code)
	}
	rr := doRequestWithBearer(e.srv, "GET", agentAPIPrefix+"/items/"+e.itemRef+"/comments", e.token, nil)
	if n := strings.Count(rr.Body.String(), "Done: tests added."); n != 1 {
		t.Fatalf("the comment exists %d times, want once; %s", n, rr.Body.String())
	}

	if res := e.agentGET(t, e.itemRef, "status", url.Values{"status": {"in-progress"}, "requestId": {"s-1"}}); res.code != http.StatusOK {
		t.Fatalf("status = %d %s", res.code, res.body)
	}
	item, err := e.srv.store.ResolveItem(e.ws.ID, e.itemSlug)
	if err != nil || !strings.Contains(item.Fields, `"status":"in-progress"`) {
		t.Fatalf("item fields = %v (%v), want status in-progress", item.Fields, err)
	}
	if res := e.agentGET(t, e.itemRef, "claim", url.Values{"requestId": {"k-1"}}); res.code != http.StatusOK {
		t.Fatalf("claim = %d %s", res.code, res.body)
	}

	// The agent is not told about its own comment or status change.
	_, next := e.poll(t, *first.BatchID, 0)
	if len(next.Events) != 0 {
		t.Fatalf("the agent's own writes came back to it: %+v", next.Events)
	}

	// A person's reply still reaches it.
	e.comment(t, "Thanks, looks good.")
	_, after := e.poll(t, "", 0)
	if len(after.Events) != 1 || after.Events[0].Kind != "comment" {
		t.Fatalf("a person's comment after the agent's = %+v", after.Events)
	}
}

// The agent writes only to the items assigned to it.
func TestAgentCannotWriteToAnotherTask(t *testing.T) {
	t.Parallel()
	e := setupAssignedAgent(t)
	rr := doRequestWithBearer(e.srv, "POST", "/api/v1/workspaces/"+e.ws.Slug+"/collections/tasks/items", e.sessTok,
		map[string]any{"title": "Not yours"})
	if rr.Code != http.StatusCreated {
		t.Fatalf("create = %d", rr.Code)
	}
	other := jsonMap(t, rr.Body.Bytes())["ref"].(string)
	for _, op := range []string{"comment", "status", "claim"} {
		res := e.agentGET(t, other, op, url.Values{"body": {"x"}, "status": {"done"}, "requestId": {"r-" + op}})
		if res.code != http.StatusForbidden || !strings.Contains(res.body, "not_assigned") {
			t.Errorf("%s on another task = %d %s, want 403 not_assigned", op, res.code, res.body)
		}
	}
	if res := e.agentGET(t, e.itemRef, "comment", url.Values{"body": {"x"}}); res.code != http.StatusBadRequest {
		t.Errorf("a write without requestId = %d, want 400", res.code)
	}
	if res := e.agentGET(t, e.itemRef, "delete", url.Values{"requestId": {"d"}}); res.code != http.StatusNotFound {
		t.Errorf("an unknown action = %d, want 404", res.code)
	}
}
