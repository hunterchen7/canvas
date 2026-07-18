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

The TypeScript harness reports milliseconds per comparison. Go's standard benchmark reports nanoseconds per operation and allocation counts for the same 64-pair, 10,000-bootstrap workload. The command above collects five native samples. Compare medians across repeated runs on an otherwise idle machine; process startup is intentionally excluded from both measurements.
