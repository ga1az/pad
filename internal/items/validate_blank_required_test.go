package items

import (
	"strings"
	"testing"

	"github.com/PerpetualSoftware/pad/internal/models"
)

// Fork ga1az/pad: a REQUIRED field that opts in with non_blank must carry
// content. A whitespace-only string or an empty list is "no value" on both
// write shapes; fields without the flag keep the upstream behaviour.

func blankRequiredSchema() models.CollectionSchema {
	return models.CollectionSchema{
		Fields: []models.FieldDef{
			{Key: "expected", Label: "Expected", Type: "text", Required: true, NonBlank: true},
			{Key: "deliverables", Label: "Deliverables", Type: "multi_select", Options: []string{"tests", "screenshots"}, Required: true, NonBlank: true},
			{Key: "stage", Label: "Stage", Type: "select", Options: []string{"open", "done"}, Required: true},
			{Key: "notes", Label: "Notes", Type: "text"},
		},
	}
}

func TestBlankRequired_FullAndPartialWrites(t *testing.T) {
	t.Parallel()
	schema := blankRequiredSchema()

	// Full write: blank values in required fields are refused as required.
	for _, tc := range []map[string]any{
		{"expected": "", "deliverables": []any{"tests"}, "stage": "open"},
		{"expected": "   \n\t", "deliverables": []any{"tests"}, "stage": "open"},
		{"expected": "GET /health returns 200", "deliverables": []any{}, "stage": "open"},
		{"expected": "GET /health returns 200", "deliverables": []string{}, "stage": "open"},
	} {
		err := ValidateFields(tc, schema)
		if err == nil || !strings.Contains(err.Error(), "is required") {
			t.Errorf("ValidateFields(%#v) = %v, want a required error", tc, err)
		}
	}

	// Full write: real content passes, a blank OPTIONAL field is untouched, and
	// a required field WITHOUT non_blank still stores "" (BUG-3043 lane rule).
	ok := map[string]any{"expected": "GET /health returns 200", "deliverables": []any{"tests"}, "notes": "  ", "stage": ""}
	if err := ValidateFields(ok, schema); err != nil {
		t.Fatalf("ValidateFields(valid) = %v, want nil", err)
	}
	if ok["notes"] != "  " {
		t.Errorf("optional blank field was rewritten to %#v", ok["notes"])
	}
	if got, present := ok["stage"]; !present || got != "" {
		t.Errorf("required select without non_blank must keep \"\", got %#v (present=%v)", got, present)
	}

	// Partial write: blanking a required field is refused like deleting it.
	for _, patch := range []map[string]any{
		{"expected": ""},
		{"expected": "  "},
		{"deliverables": []any{}},
	} {
		err := ValidatePartialFields(patch, schema)
		if err == nil || !strings.Contains(err.Error(), "cannot be deleted") {
			t.Errorf("ValidatePartialFields(%#v) = %v, want a cannot-be-deleted error", patch, err)
		}
	}

	// Partial write: an optional field can still be blanked.
	if err := ValidatePartialFields(map[string]any{"notes": ""}, schema); err != nil {
		t.Errorf("ValidatePartialFields(optional blank) = %v, want nil", err)
	}
}
