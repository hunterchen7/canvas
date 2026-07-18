# Bundle and package benchmark

This benchmark builds consumer-style fixture imports from the package root and
measures each fixture in two modes:

- `externalPeers`: React, React DOM, and Framer Motion are external, exposing
  the library's marginal bundle cost.
- `bundled`: all dependencies are included, approximating a standalone browser
  bundle.

The fixtures cover `Canvas`, `CanvasComponent`, `DefaultIntroContent`,
`CanvasNavbar`, `Draggable`, `isIOS`, `getDistance`, and `cn`. Each result
records minified raw, gzip, and Brotli bytes; output chunks;
total/workspace/dependency module counts; and a per-package module breakdown.
The run also measures compiled CSS and the npm tarball's packed bytes, unpacked
bytes, and file count.

Total bytes are split into initial and asynchronously loaded delivery metrics.
This keeps code-splitting proposals measurable without treating deferred bytes
as eliminated bytes: the JSON shows initial/async compressed sizes, chunks,
module counts, and dependency attribution separately. Any resulting load-timing
or rendering tradeoff still requires an explicit product decision.

## Run

The default command rebuilds `dist` before measuring it:

```sh
node benchmarks/bundle/run.mjs
```

Use the Node version pinned in the repository's `.nvmrc`. The JSON baseline
records both Node and Rolldown versions, and comparison refuses a toolchain
mismatch because gzip and npm tarball output can change across Node/npm releases.
The baseline was regenerated under Node 24.18.0/npm 11.16.0 by backporting this
suite to the recorded historical sources: `476f6c9` for the original fixtures
and `f435142` for `DefaultIntroContent`, which was introduced later. Current
candidate measurements were not promoted into the baseline. Changing the pin
requires the same explicit historical remeasurement.

Reuse an existing build when iterating on the benchmark itself:

```sh
node benchmarks/bundle/run.mjs --skip-build
```

Write or intentionally update a deterministic JSON baseline:

```sh
node benchmarks/bundle/run.mjs \
  --write-baseline benchmarks/bundle/baseline.json
```

Compare against that baseline. This exits non-zero if any measured byte or
module count grows:

```sh
node benchmarks/bundle/run.mjs \
  --baseline benchmarks/bundle/baseline.json
```

CI can allow a small byte tolerance while keeping module counts exact:

```sh
node benchmarks/bundle/run.mjs \
  --baseline benchmarks/bundle/baseline.json \
  --byte-tolerance-percent 1
```

Consumer bundles, CSS, and the packed npm artifact can be budgeted
independently. This is useful when an optimization makes every consumer entry
smaller but adds a small amount of shipped source or source-map metadata:

```sh
node benchmarks/bundle/run.mjs \
  --baseline benchmarks/bundle/baseline.json \
  --package-byte-tolerance-percent 2
```

That option applies only to `package.packedBytes` and
`package.unpackedBytes`; fixture and CSS byte tolerances remain unchanged.
Package file-count growth is still controlled separately by
`--file-tolerance`.

Use `--output <file>` to save a current result without treating it as the
baseline. Run with `--help` for all comparison tolerances and skip flags.

## Explore packaging candidates

The exploratory candidate runner compares benchmark-only simulations of
side-effect metadata, direct subpath entries, type-only React cleanup, and two
Lucide-loading designs against the checked-in baseline:

```sh
node benchmarks/bundle/evaluate-candidates.mjs
```

It does not edit package source or published metadata. The component-only icon
and dynamically loaded legacy-icon rows are deliberately prototypes: both need
an explicit API or load-timing decision before production use.

## Tooling and package scripts

The implementation uses Node built-ins, npm, and the repository's existing
`rolldown` dev dependency. The checked-in scripts keep consumer bundle, CSS,
module, chunk, and package file-count growth at zero tolerance. The comparison
allows up to 2% byte growth only for the npm artifact, matching the explicitly
reviewed source/source-map metadata tradeoff in this optimization PR:

```json
{
  "bench:bundle": "node benchmarks/bundle/run.mjs",
  "bench:bundle:compare": "node benchmarks/bundle/run.mjs --baseline benchmarks/bundle/baseline.json --package-byte-tolerance-percent 2"
}
```

Baseline changes should be reviewed like code: inspect both byte deltas and the
per-package module breakdown before accepting a new snapshot.
