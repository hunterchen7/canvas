# Canvas browser parity and performance suite

This suite captures the same deterministic fixture from a reference worktree and a candidate worktree. It never updates or accepts a baseline automatically. Any pixel, DOM, computed-style, SVG, geometry, interaction-checkpoint, or animation-semantic mismatch fails strict parity and is listed in `report.json` under `summary.deferredUserDecisions` for explicit review.

It only reads library source through a Vite alias. The fixture and runner live under `benchmarks/e2e`; no production source or package manifest changes are required.

## What it exercises

- Intro grow, blur, fade, and pan-to-home timing.
- `DefaultIntroContent` logo/title markup, geometry, and stable pixels.
- Pointer pan and ctrl-wheel zoom.
- Instrumented wheel hot paths with MotionValue/event-property read counts.
- Changing-size and same-size resize fanout stress across 100 sections.
- Navbar spring navigation and default, custom, and dynamically enabled Toolbar readout updates.
- Framer Motion drag plus transparent SVG alpha hit-testing, cursor state, and per-hover geometry-read counts.
- Stable full-page screenshots, selected DOM geometry/computed styles, and serialized SVG identity.
- rAF frame intervals, Long Tasks, Long Animation Frames, and Chrome `Performance.getMetrics` task/script/layout/style-duration proxies.

The browser context is fixed to 1280×720, DPR 1, light color scheme, `en-CA`, `America/Toronto`, Arial, and `prefers-reduced-motion: no-preference`. The fixture uses no remote assets, noise texture, clock, or random data.

## Run

Full reference-versus-candidate run:

```sh
node benchmarks/e2e/run.mjs \
  --baseline-root /absolute/path/to/reference-worktree \
  --candidate-root /absolute/path/to/candidate-worktree \
  --output /tmp/canvas-e2e
```

Fast vertical slice:

```sh
node benchmarks/e2e/run.mjs \
  --baseline-root /absolute/path/to/reference-worktree \
  --candidate-root /absolute/path/to/candidate-worktree \
  --scenarios static-home,pan \
  --output /tmp/canvas-e2e-smoke
```

Stress the per-section render path:

```sh
node benchmarks/e2e/run.mjs \
  --baseline-root /absolute/path/to/reference-worktree \
  --candidate-root /absolute/path/to/candidate-worktree \
  --sections 100 \
  --fail-on-perf-regression \
  --output /tmp/canvas-e2e-100
```

Use `--browser chrome` for installed system Chrome, `--headed` for debugging, or `--scenarios intro,zoom,navbar,toolbar,drag` to select cases. Two already-running fixtures can be supplied with `--baseline-url` and `--candidate-url`. Add `--trace` when you need a Playwright trace with screenshots and DOM snapshots; tracing is disabled by default so its recording overhead does not perturb normal CPU comparisons.

## Paired deep profiling

The deep profiler amplifies four implementation-level hot paths while retaining
a strict parity rerun for every measured target:

- `wheel-hot-path`
- `window-dimension-fanout`
- `pinch-hot-path`
- `drag-hover-hit-test`

Start with one profiler kind and a focused scenario:

```sh
npm run bench:profile:e2e -- \
  --baseline-root /absolute/path/to/baseline-worktree \
  --candidate-root /absolute/path/to/candidate-worktree \
  --scenarios wheel-hot-path \
  --kinds cpu \
  --warmups 2 \
  --repetitions 6 \
  --sections 100 \
  --output /tmp/canvas-e2e-profile-wheel-cpu
```

Warmups and measured repetitions must be even. Baseline-first and
candidate-first order alternates independently for every scenario/profile-kind
group. Warmups run the workload without recording a profile; every measured
target gets an isolated context and exactly one CPU, trace, or allocation
capture around the amplified action.

Every target also records a forced-GC live-heap measurement in that same clean
profile context. After scenario preparation, the runner calls
`HeapProfiler.collectGarbage` and reads `Runtime.getHeapUsage` immediately
before starting the profiler. It stops the capture and runs scenario cleanup
before forcing GC and reading the heap again. The scenario result retains the
full before/after/delta record, and target aggregates expose
`forcedGcLiveHeap.beforeBytes`, `.afterBytes`, and `.deltaBytes` as
lower-is-better paired metrics. Both collections are deliberately outside the
action capture, so their CPU and GC work cannot contaminate the recorded hot
path.

`--kinds cpu,trace,allocations` is supported, but the kinds are still captured
separately and the full matrix can be very large. Prefer three serial
invocations with distinct output directories so failures and resource pressure
remain attributable. CPU and allocation captures use `--workload-scale`
(default `1`). Trace uses the separate `--trace-workload-scale` (default `0.1`)
because tracing every event in the full amplified loop creates disproportionate
overhead and very large artifacts. Never compare action duration across kinds
or across different workload scales.

Useful controls include:

- `--scenarios` with a comma-separated subset of the four scenarios
- `--kinds cpu|trace|allocations`, or a comma-separated list
- `--sections 0..250`
- `--workload-scale` greater than zero and at most `100`
- `--trace-workload-scale` greater than zero and at most `10`
- `--cpu-sampling-interval-us` and
  `--allocation-sampling-interval-bytes`
- `--browser chromium|chrome` and `--headed`

The deep action runs in an instrumentation-free context. The same scenario is
then rerun in a separate instrumented context for screenshots and contracts, so
profiling instrumentation cannot be mistaken for parity. Strict pixel, DOM,
computed-style, SVG, geometry, interaction-checkpoint, and animation-semantic
differences are reported for every measured pair. Performance remains
diagnostic-only and never changes the exit status; a capture failure exits 1
and a strict parity review exits 2.

Both roots are canonicalized and fingerprinted using package identity, a
source-only SHA-256, and Git provenance. The suite rejects identical source
hashes, injects each expected identity into its fixture, asserts the loaded
identity in the browser, and revalidates both worktrees before and after every
measured pair and again at finalization. This allows the latest harness to serve
an old checkout without changing or backporting files into that checkout.

The artifact root contains `manifest.json`, `report.json`, and
`profiles/<scenario>/<kind>/pair-<n>/<target>/`. Each pair also has a local
`comparison.json` with parity details and raw target/profile references. The
top-level report aggregates min, p25, median, p75, max, mean, paired
absolute/percent changes, sign consistency, and a seeded 95% paired-bootstrap
interval for the median delta. Classification requires five complete pairs and
is exploratory and unadjusted for multiple comparisons. These diagnostics are
not proof of a causal improvement: profiler overhead, headless rendering,
background load, thermal state, and a small number of pairs can all move the
result. Inspect the raw profiles, parity artifacts, pair direction, and effect
size, then reproduce important findings in another serial run.

Forced-GC live-heap delta is retained JavaScript heap for the whole renderer
isolate after scenario cleanup, not total allocation volume and not proof of a
memory leak. Browser caches, GC compaction, and unrelated fixture state can
move it or make a single delta negative. The profiler lifecycle also sits
between the endpoints, although harness-owned User Timing entries are cleared
before the second collection. Compare only the same profile kind under matching
browser/settings, use the paired distribution rather than one run, and use
allocation profiles when the question is which call sites allocate during the
action.

## Artifacts

`report.json` is the machine-readable comparison summary. Each target also contains:

- `scenarios/<name>.json`: raw trajectory, event, frame interval, long-task/LoAF, CDP, DOM, style, geometry, and SVG data.
- `screenshots/<name>.png`: stable-state full-page screenshot.
- `trace.zip`: Playwright trace with screenshots and DOM snapshots, created only with `--trace`.
- `target.json`: target metadata, browser errors, and scenario records.

`diffs/<name>.png` is an exact pixel diff. The default gate allows zero different pixels. Geometry allows only 0.01 px to absorb serialization rounding. Direct interactions are gated at input-indexed state checkpoints, including draggable translation, and intro/navigation animations gate exact configuration, stage order, endpoints, and truly settled pixels/geometry. Wall-clock rAF trajectories and stage timing remain advisory because browser scheduling varies between identical runs; all raw samples and advisory differences are retained for inspection. Before the stable capture, the runner waits for motion and document animations to settle, stops fixture-only intervals, and deterministically rebuilds compositing layers.

Performance comparisons are reported separately because single-run CPU timing is noisy. Add `--fail-on-perf-regression` to make the configured 15% plus 2 ms regression heuristic affect the exit code. Parity always affects the exit code.

Use a new directory under `/tmp` for each run. Deep CPU and allocation artifacts
can be sizable, and traces can consume several times their compressed size
during summarization. Run regular parity, runtime pairs, and deep-profile groups
serially rather than in parallel to avoid Chromium/Vite contention, memory
pressure, and thermal bias. If a run is interrupted, wait for its browser and
fixture servers to stop before starting another.

## Tooling requirements

The runner reuses repository-local `vite`, `tailwindcss`, `@playwright/test`, `pixelmatch`, and `pngjs`. If the packages are not present, install them without changing manifests or lockfiles:

```sh
npm install --no-save --package-lock=false vite tailwindcss @playwright/test pixelmatch pngjs
```

If Playwright Chromium is absent, either pass `--browser chrome` to use `/Applications/Google Chrome.app`, or install the browser binary:

```sh
npx playwright install chromium
```

## Interpreting failures

- Exit 0: strict parity passed; performance results remain in the report.
- Exit 1: a parity mismatch or runner error requires review.
- Exit 2: parity passed, but `--fail-on-perf-regression` found a configured performance regression.

Do not regenerate or bless a mismatch as part of an optimization. Review the baseline/candidate screenshots, magenta diff, DOM/SVG contracts, and raw trajectory first, then defer any intentional visual, animation, loading, or interactivity change for an explicit user decision.
