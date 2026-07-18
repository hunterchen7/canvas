package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
)

func printUsage(output io.Writer) {
	fmt.Fprintln(output, "Canvas native paired-profile analyzer")
	fmt.Fprintln(output)
	fmt.Fprintln(output, "Usage:")
	fmt.Fprintln(output, "  canvas-profile-analyzer [--input request.json] [--output result.json] [--pretty]")
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

func run(arguments []string) error {
	flags := flag.NewFlagSet("canvas-profile-analyzer", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	inputPath := flags.String("input", "-", "input JSON path, or - for stdin")
	outputPath := flags.String("output", "-", "output JSON path, or - for stdout")
	pretty := flags.Bool("pretty", false, "indent output JSON")
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
	decoder := json.NewDecoder(input)
	decoder.UseNumber()
	var payload request
	if err := decoder.Decode(&payload); err != nil {
		return fmt.Errorf("decode request: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("decode request: multiple JSON values are not allowed")
		}
		return fmt.Errorf("decode request trailer: %w", err)
	}
	if payload.Options == nil {
		payload.Options = map[string]any{}
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
	if err := encoder.Encode(comparePairedSamples(payload)); err != nil {
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
