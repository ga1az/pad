package server

import (
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/pb33f/libopenapi"

	"github.com/PerpetualSoftware/pad/internal/models"
)

// AC-1: the link alone is enough. It answers a valid OpenAPI document with
// its code filled in, describing only routes the agent router serves.
func TestAgentJoinDocument(t *testing.T) {
	t.Parallel()
	e := setupAgentEnv(t)
	// A person-written name with quotes must not break the document.
	name := `Evil "quoted" workspace`
	if _, err := e.srv.store.UpdateWorkspace(e.ws.Slug, models.WorkspaceUpdate{Name: &name}); err != nil {
		t.Fatalf("rename workspace: %v", err)
	}
	code, _ := e.createJoinLink(t)

	rr := doRequest(e.srv, "GET", agentAPIPrefix+"/join?code="+url.QueryEscape(code), nil)
	if rr.Code != http.StatusOK || !strings.HasPrefix(rr.Header().Get("Content-Type"), "application/yaml") {
		t.Fatalf("join document = %d %q", rr.Code, rr.Header().Get("Content-Type"))
	}
	body := rr.Body.Bytes()
	doc, err := libopenapi.NewDocument(body)
	if err != nil {
		t.Fatalf("not an OpenAPI document: %v\n%s", err, body)
	}
	model, err := doc.BuildV3Model()
	if model == nil || err != nil {
		t.Fatalf("OpenAPI model does not build: %v", err)
	}
	if !strings.Contains(model.Model.Info.Title, name) {
		t.Fatalf("title = %q, want the workspace name verbatim", model.Model.Info.Title)
	}
	if !strings.Contains(string(body), code) {
		t.Fatal("the document does not carry the link's code")
	}

	// Every documented path is served: none answers the router's 404.
	want := map[string]bool{"/join/register": true, "/me": true, "/activity": true,
		"/items/{itemRef}/context": true, "/items/{itemRef}/comments": true, "/items/{itemRef}/comment": true,
		"/items/{itemRef}/status": true, "/items/{itemRef}/claim": true, "/items/{itemRef}/release": true}
	got := 0
	for path := range model.Model.Paths.PathItems.FromOldest() {
		if !want[path] {
			t.Errorf("documented path %s is not one the agent router serves", path)
			continue
		}
		got++
		rr := doRequest(e.srv, "GET", agentAPIPrefix+strings.ReplaceAll(path, "{itemRef}", "TASK-1"), nil)
		if rr.Code == http.StatusNotFound || rr.Code == http.StatusMethodNotAllowed {
			t.Errorf("GET %s = %d; the documented route is not mounted", path, rr.Code)
		}
	}
	if got != len(want) {
		t.Errorf("documented %d of the %d agent routes", got, len(want))
	}

	if rr := doRequest(e.srv, "GET", agentAPIPrefix+"/join?code=padjoin_nope", nil); rr.Code != http.StatusNotFound {
		t.Errorf("an unknown code = %d, want 404", rr.Code)
	}
}
