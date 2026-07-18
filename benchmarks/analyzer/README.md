# Native paired-profile analyzer

This directory contains a dependency-free Go port of the paired-sample statistics used by the TypeScript profiling reports. Browser capture remains in TypeScript because Playwright and the Chrome DevTools Protocol own that boundary; the deterministic, CPU-heavy bootstrap analysis can run natively.

The Go result matches `comparePairedSamples()` in `benchmarks/runtime/scripts/profile-compare.ts`, including:

- positionally paired samples and missing-value handling;
- absolute and percent deltas, including the `0 -> 0` special case;
- descriptive distributions, MAD, and sample standard deviation;
- the seeded Mulberry32 paired-bootstrap confidence intervals;
- lower-is-better, higher-is-better, and unclassified metrics;
- zero tolerances, minimum-pair rules, sign consistency, and classifications.

## Use the CLI

```sh
go -C benchmarks/analyzer run . --input request.json --output result.json --pretty
```

Omit the paths, or pass `-`, to use stdin and stdout. A request has this shape:

```json
{
  "baseline": [10, 20, 30, 40, 50],
  "candidate": [9, 18, 27, 36, 45],
  "options": {
    "lowerIsBetter": true,
    "bootstrapIterations": 10000,
    "minimumPairs": 5,
    "seed": "my-profile"
  }
}
```

`baseline` and `candidate` must be arrays; non-numeric entries are treated as missing samples. `lowerIsBetter` accepts a boolean or `null`. The bootstrap seed accepts a finite JSON number or a string containing Unicode scalar values. Iteration and minimum-pair counts must be safe integers, and the zero tolerance must be finite. The CLI rejects other option types instead of applying JavaScript-specific coercions that cannot be represented portably in Go.

For one process boundary across many metrics within the CLI limits, pass `--batch` with
`{"comparisons":[...requests]}`. The paired runtime runner uses this mode when
invoked with `--analysis-engine go`; long reports are split into bounded,
ordered sequential subprocess batches under one total deadline. The CLI rejects unknown/missing fields,
unpaired surrogate escapes, non-finite derived deltas, inputs over 16 MiB,
more than 100,000 samples per side, more than 1,000,000 bootstrap iterations,
or requests that exceed the documented sample-iteration work limits.

## Verify compatibility

```sh
go -C benchmarks/analyzer test ./...
node --test benchmarks/analyzer/differential.ts
```

This runs Go unit tests and then builds the native binary and differentially compares it with the TypeScript reference over fixed edge cases, 100 seeded randomized comparisons, and a byte-stability check.

## Benchmark both implementations

```sh
node benchmarks/analyzer/benchmark.ts
go -C benchmarks/analyzer test -run '^$' -bench BenchmarkComparePairedSamples -benchmem -count=5
```

The TypeScript harness reports both an in-process reference and a JSON batch path. It then invokes the exact `go run` bridge used by paired reports twice with an isolated Go build cache: the cold result includes first-use compile/link setup, and the warm result shows reuse. Both include JSON input, process startup, analysis, and JSON output. Go's standard benchmark separately reports native nanoseconds per operation and allocation counts for the same 64-pair, 10,000-bootstrap workload. The command above collects five native in-process samples. Compare medians across repeated runs on an otherwise idle machine; small cold batches can be slower than TypeScript because setup dominates.
