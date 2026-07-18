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

func TestRunRejectsNonPortableOptions(t *testing.T) {
	for _, input := range []string{
		`{"baseline":[1],"candidate":[2],"options":{"seed":[1,2]}}`,
		`{"baseline":[1],"candidate":[2],"options":{"seed":{"a":1}}}`,
		`{"baseline":[1],"candidate":[2],"options":{"seed":"\ud800"}}`,
		`{"baseline":[1],"candidate":[2],"options":{"seed":1e400}}`,
		`{"baseline":[1],"candidate":[2],"options":{"lowerIsBetter":1e400}}`,
	} {
		directory := t.TempDir()
		inputPath := filepath.Join(directory, "request.json")
		if err := os.WriteFile(inputPath, []byte(input), 0o600); err != nil {
			t.Fatal(err)
		}
		err := run([]string{"--input", inputPath, "--output", filepath.Join(directory, "result.json")})
		if err == nil {
			t.Errorf("input %s: error = nil, want validation failure", input)
		}
	}
}

func TestRunAcceptsReplacementCharacterSeed(t *testing.T) {
	directory := t.TempDir()
	inputPath := filepath.Join(directory, "request.json")
	outputPath := filepath.Join(directory, "result.json")
	input := `{"baseline":[1,2,3,4,5],"candidate":[2,3,4,5,6],"options":{"seed":"valid-�","bootstrapIterations":10}}`
	if err := os.WriteFile(inputPath, []byte(input), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"--input", inputPath, "--output", outputPath}); err != nil {
		t.Fatal(err)
	}
}

func TestRunRejectsUnknownMissingAndUnboundedInputs(t *testing.T) {
	for _, input := range []string{
		`{"basline":[1],"candidate":[2]}`,
		`{"baseline":[1],"candidate":[2],"unexpected":true}`,
		`{"baseline":[1],"candidate":[2],"options":{"unexpected":true}}`,
		`{"baseline":[1],"candidate":[2],"options":{"bootstrapIterations":1000001}}`,
		`{"baseline":[1e308],"candidate":[-1e308],"options":{"bootstrapIterations":1}}`,
	} {
		directory := t.TempDir()
		inputPath := filepath.Join(directory, "request.json")
		if err := os.WriteFile(inputPath, []byte(input), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := run([]string{"--input", inputPath, "--output", filepath.Join(directory, "result.json")}); err == nil {
			t.Errorf("input %s: error = nil, want strict validation failure", input)
		}
	}
}

func TestRunAnalyzesBatches(t *testing.T) {
	directory := t.TempDir()
	inputPath := filepath.Join(directory, "request.json")
	outputPath := filepath.Join(directory, "result.json")
	input := `{"comparisons":[{"baseline":[1,2,3,4,5],"candidate":[2,3,4,5,6],"options":{"bootstrapIterations":10}},{"baseline":[5,4,3,2,1],"candidate":[4,3,2,1,0],"options":{"bootstrapIterations":10}}]}`
	if err := os.WriteFile(inputPath, []byte(input), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"--batch", "--input", inputPath, "--output", outputPath}); err != nil {
		t.Fatal(err)
	}
	output, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Count(output, []byte(`"classification"`)) != 2 {
		t.Fatalf("unexpected batch output: %s", output)
	}
}

func TestRunNormalizesSignedZeroLikeJSONStringify(t *testing.T) {
	directory := t.TempDir()
	inputPath := filepath.Join(directory, "request.json")
	outputPath := filepath.Join(directory, "result.json")
	input := `{"baseline":[0,0,0,0,0],"candidate":[-0,-0,-0,-0,-0],"options":{"bootstrapIterations":10}}`
	if err := os.WriteFile(inputPath, []byte(input), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"--input", inputPath, "--output", outputPath}); err != nil {
		t.Fatal(err)
	}
	output, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(output, []byte("-0")) {
		t.Fatalf("signed zero escaped normalization: %s", output)
	}
}
