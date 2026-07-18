package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunReadsAndWritesFiles(t *testing.T) {
	directory := t.TempDir()
	inputPath := filepath.Join(directory, "request.json")
	outputPath := filepath.Join(directory, "result.json")
	input := `{"baseline":[1,2,3,4,5],"candidate":[2,3,4,5,6],"options":{"bootstrapIterations":10,"seed":7}}`
	if err := os.WriteFile(inputPath, []byte(input), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"--input", inputPath, "--output", outputPath, "--pretty"}); err != nil {
		t.Fatal(err)
	}
	output, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(output, []byte(`"classification": "regression"`)) {
		t.Fatalf("unexpected output: %s", output)
	}
}

func TestRunRejectsTrailingJSON(t *testing.T) {
	directory := t.TempDir()
	inputPath := filepath.Join(directory, "request.json")
	if err := os.WriteFile(inputPath, []byte(`{} {}`), 0o600); err != nil {
		t.Fatal(err)
	}
	err := run([]string{"--input", inputPath, "--output", filepath.Join(directory, "result.json")})
	if err == nil || !strings.Contains(err.Error(), "multiple JSON values") {
		t.Fatalf("error = %v, want trailing JSON rejection", err)
	}
}
