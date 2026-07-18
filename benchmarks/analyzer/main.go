package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strconv"
	"unicode/utf8"
)

const (
	maxInputBytes       = 16 * 1024 * 1024
	maxBatchComparisons = 10_000
	maxBatchWork        = 200_000_000
)

type batchRequest struct {
	Comparisons []request `json:"comparisons"`
}

type batchResult struct {
	Comparisons []comparison `json:"comparisons"`
}

func printUsage(output io.Writer) {
	fmt.Fprintln(output, "Canvas native paired-profile analyzer")
	fmt.Fprintln(output)
	fmt.Fprintln(output, "Usage:")
	fmt.Fprintln(output, "  canvas-profile-analyzer [--input request.json] [--output result.json] [--pretty]")
	fmt.Fprintln(output, "  canvas-profile-analyzer --batch [--input requests.json] [--output results.json]")
	fmt.Fprintln(output)
	fmt.Fprintln(output, "Without file flags, JSON is read from stdin and written to stdout.")
}

func openInput(filename string) (io.ReadCloser, error) {
	if filename == "" || filename == "-" {
		return io.NopCloser(os.Stdin), nil
	}
	return os.Open(filename)
}

func openOutput(filename string) (io.WriteCloser, error) {
	if filename == "" || filename == "-" {
		return nopWriteCloser{Writer: os.Stdout}, nil
	}
	return os.Create(filename)
}

type nopWriteCloser struct {
	io.Writer
}

func (nopWriteCloser) Close() error { return nil }

func decodeStrict(data []byte, destination any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("multiple JSON values are not allowed")
		}
		return err
	}
	return nil
}

func validateJSONEncoding(data []byte) error {
	if !utf8.Valid(data) {
		return errors.New("input must be valid UTF-8")
	}
	inString := false
	for index := 0; index < len(data); index++ {
		switch data[index] {
		case '"':
			inString = !inString
		case '\\':
			if !inString || index+1 >= len(data) {
				continue
			}
			if data[index+1] != 'u' || index+5 >= len(data) {
				index++
				continue
			}
			codeUnit, err := strconv.ParseUint(string(data[index+2:index+6]), 16, 16)
			if err != nil {
				continue
			}
			if codeUnit >= 0xd800 && codeUnit <= 0xdbff {
				if index+11 >= len(data) || data[index+6] != '\\' || data[index+7] != 'u' {
					return errors.New("JSON strings must not contain unpaired surrogate escapes")
				}
				low, lowError := strconv.ParseUint(string(data[index+8:index+12]), 16, 16)
				if lowError != nil || low < 0xdc00 || low > 0xdfff {
					return errors.New("JSON strings must not contain unpaired surrogate escapes")
				}
				index += 11
				continue
			}
			if codeUnit >= 0xdc00 && codeUnit <= 0xdfff {
				return errors.New("JSON strings must not contain unpaired surrogate escapes")
			}
			index += 5
		}
	}
	return nil
}

func requestWork(input request) int64 {
	iterations := defaultBootstrapIterations
	if value, exists := input.Options["bootstrapIterations"]; exists && value != nil {
		parsed, _ := safeInteger(value)
		iterations = max(1, int(parsed))
	}
	return int64(max(len(input.Baseline), len(input.Candidate), 1)) * int64(iterations)
}

func analyzeRequest(payload request) (comparison, error) {
	if payload.Options == nil {
		payload.Options = map[string]any{}
	}
	if err := validateRequest(payload); err != nil {
		return comparison{}, err
	}
	result := comparePairedSamples(payload)
	if _, err := json.Marshal(result); err != nil {
		return comparison{}, fmt.Errorf("analysis produced a non-finite result: %w", err)
	}
	return result, nil
}

func run(arguments []string) error {
	flags := flag.NewFlagSet("canvas-profile-analyzer", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	inputPath := flags.String("input", "-", "input JSON path, or - for stdin")
	outputPath := flags.String("output", "-", "output JSON path, or - for stdout")
	pretty := flags.Bool("pretty", false, "indent output JSON")
	batch := flags.Bool("batch", false, "analyze a comparisons array in one process")
	help := flags.Bool("help", false, "show help")
	flags.BoolVar(help, "h", false, "show help")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if *help {
		printUsage(os.Stdout)
		return nil
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("unexpected positional arguments: %v", flags.Args())
	}

	input, err := openInput(*inputPath)
	if err != nil {
		return fmt.Errorf("open input: %w", err)
	}
	defer input.Close()
	data, err := io.ReadAll(io.LimitReader(input, maxInputBytes+1))
	if err != nil {
		return fmt.Errorf("read input: %w", err)
	}
	if len(data) > maxInputBytes {
		return fmt.Errorf("input exceeds the %d-byte limit", maxInputBytes)
	}
	if err := validateJSONEncoding(data); err != nil {
		return fmt.Errorf("validate input encoding: %w", err)
	}

	var result any
	if *batch {
		var payload batchRequest
		if err := decodeStrict(data, &payload); err != nil {
			return fmt.Errorf("decode batch request: %w", err)
		}
		if payload.Comparisons == nil || len(payload.Comparisons) == 0 {
			return errors.New("validate batch request: comparisons must be a non-empty array")
		}
		if len(payload.Comparisons) > maxBatchComparisons {
			return fmt.Errorf("validate batch request: comparisons must contain at most %d entries", maxBatchComparisons)
		}
		results := make([]comparison, 0, len(payload.Comparisons))
		normalized := make([]request, len(payload.Comparisons))
		var totalWork int64
		for index, entry := range payload.Comparisons {
			if entry.Options == nil {
				entry.Options = map[string]any{}
			}
			totalWork += requestWork(entry)
			if totalWork > maxBatchWork {
				return fmt.Errorf("validate batch request: comparisons exceed the %d total work limit", maxBatchWork)
			}
			if validateError := validateRequest(entry); validateError != nil {
				return fmt.Errorf("validate batch request comparison %d: %w", index, validateError)
			}
			normalized[index] = entry
		}
		for index, entry := range normalized {
			analyzed, analyzeError := analyzeRequest(entry)
			if analyzeError != nil {
				return fmt.Errorf("analyze batch request comparison %d: %w", index, analyzeError)
			}
			results = append(results, analyzed)
		}
		result = batchResult{Comparisons: results}
	} else {
		var payload request
		if err := decodeStrict(data, &payload); err != nil {
			return fmt.Errorf("decode request: %w", err)
		}
		analyzed, analyzeError := analyzeRequest(payload)
		if analyzeError != nil {
			return fmt.Errorf("validate request: %w", analyzeError)
		}
		result = analyzed
	}

	output, err := openOutput(*outputPath)
	if err != nil {
		return fmt.Errorf("open output: %w", err)
	}
	defer output.Close()
	encoder := json.NewEncoder(output)
	encoder.SetEscapeHTML(false)
	if *pretty {
		encoder.SetIndent("", "  ")
	}
	if err := encoder.Encode(result); err != nil {
		return fmt.Errorf("encode result: %w", err)
	}
	return nil
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "canvas-profile-analyzer:", err)
		os.Exit(1)
	}
}
