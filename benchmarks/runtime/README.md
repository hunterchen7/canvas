# Canvas runtime benchmark

This isolated Vite fixture profiles the library source without changing production code. It exercises the intro sequence, navbar navigation, viewport visibility changes, a draggable item, wheel panning, modifier-wheel zooming, and the toolbar.

## Run interactively

From the repository root:

```sh
npm exec vite -- --config benchmarks/runtime/vite.config.ts
```

Open the printed URL. Query parameters configure the fixture:

```text
?sections=24&navItems=8&complexity=24&mode=auto&intro=1&seed=42
```

Use **Run in page** to execute the synthetic browser scenario and download its JSON result. The CLI runner below uses trusted Playwright input and is the preferred comparable run.

## Run headlessly

The runner starts and stops Vite itself, drives Chromium, prints one JSON result to stdout, and can also write a result file:

```sh
node benchmarks/runtime/scripts/run.mjs \
  --sections 24 \
  --nav-items 8 \
  --complexity 24 \
  --mode low \
  --output /tmp/canvas-runtime-low.json
```

Useful options:

- `--mode high|medium|low|auto`
- `--sections 1..200`
- `--complexity 1..200`
- `--nav-items 1..sections`
- `--intro 0|1`
- `--seed N`
- `--headed`
- `--port N` to request a specific loopback port; without it the runner asks the
  operating system for an available port and still starts Vite with strict-port
  enforcement
- `--url http://127.0.0.1:4173` to reuse an existing server
- `--width` and `--height` to override the mode viewport preset
- `--library-root /absolute/path/to/worktree` to load another checkout's
  `src/index.ts` through the current checkout's fixture and dependencies
- `--library-label NAME` to give that source an explicit artifact label
- `--production` to build an isolated production-profiling bundle and serve its
  immutable output instead of using the Vite development server

`--url` cannot be combined with `--library-root`, and `--production` cannot be
used with an external `--url`. The development server remains the default for
compatibility and interactive debugging.

Locally spawned build and Vite processes are supervised through normal exit and
`SIGINT`/`SIGTERM`. The standalone runner owns their process groups; paired
captures keep them in the paired runner's group so either layer can await a
graceful stop and escalate without orphaning Vite descendants.

A standalone `--output` file and any enabled `--profile-dir` must not already
exist. The runner claims profile directories before capture and creates result
files exclusively, so a retry cannot silently mix with or overwrite stale
artifacts. Result files and profile directories must not contain one another.

## Browser error policy

The Playwright runner records every unhandled `pageerror` and every
`console.error` from navigation through scenario finalization under
`execution.browserErrors`. Its policy is `fail-on-any`: any recorded event sets
the benchmark result status to `error` and makes the process exit nonzero. The
fixture has no expected browser errors, so there is no allowlist. The paired
runner requires this provenance to be present and rejects any capture containing
an event even if another field incorrectly claims the capture completed.

## Source identity and production bundles

An alternate library root is never copied into or modified by this suite. The
runner canonicalizes the path, verifies the package manifest and `src/index.ts`,
and fingerprints the complete `src` tree with SHA-256. It also records the Git
HEAD, source tree, and source-only dirty status when Git is available. The
fingerprinted identity is compiled into the fixture and asserted after browser
navigation; the JSON result includes the full expected and observed identities
plus `library.verified`.

`--production` creates a fresh temporary Vite cache and build directory for
each invocation, enables source maps, and serves only the completed build with
Vite preview. The selected source is re-fingerprinted after the build and the
run fails if it changed, so a bundle cannot silently become stale between
selection and capture. Temporary build state is removed after the browser and
server stop. For a profiled production run, the immutable JavaScript and its
adjacent source map are also preserved under `production-build/` inside the
profile directory.

React normally disables `<Profiler>` callbacks in a standard production build.
To retain commit counts and actual/base durations, this benchmark aliases
`react-dom/client` to the official `react-dom/profiling` production runtime.
That build uses React's production code paths but adds profiling overhead.
Results set `execution.reactRuntime` to `"production-profiling"`; compare them
only with another run using the same mode, not with an uninstrumented
application bundle.

## Paired baseline and candidate captures

Use the paired runner for before/after distributions. It serves historical
source directly from another worktree, so the benchmark does not need to be
backported or committed there:

```sh
npm run bench:runtime:paired -- \
  --baseline-root /absolute/path/to/baseline-worktree \
  --candidate-root /absolute/path/to/candidate-worktree \
  --production \
  --warmups 2 \
  --repetitions 6 \
  --profile-kind none \
  --output /tmp/canvas-runtime-paired
```

Warmup and measured pair counts must be even. Odd-numbered pairs run baseline
then candidate; even-numbered pairs reverse the order. Warmups are retained for
auditability but excluded from the comparison. Each target invocation gets a
fresh server, browser, and optional profiler. The runner rejects identical
baseline/candidate source hashes and revalidates both sources around capture
checkpoints. Ports are OS-assigned by default; use `--port-base N` only when a
fixed range is operationally necessary. Strict-port startup prevents silent
port changes, and the runner verifies both source identity and that its Vite
process remains alive through scenario finalization.

The output directory must be new or empty; the runner refuses to overwrite an
existing capture. It writes `report.json`, progress-safe `checkpoint.json`, raw
per-invocation results and logs, and `comparison.json`. An exclusive
`.canvas-runtime-capture` marker prevents two paired runners from claiming the
same initially empty directory. The comparison contains:

- baseline, candidate, absolute-delta, and percent-delta distributions;
- median, p25/p75, IQR, MAD, mean, and sample standard deviation;
- every positionally paired sample and its baseline/candidate order;
- sign consistency across pairs;
- a deterministic 95% paired-bootstrap interval for the median delta; and
- `improvement`, `regression`, `unchanged`, `inconclusive`, or
  `insufficient-data` classifications where the metric has a known direction,
  plus `not-classified` or `no-data` when direction or paired samples are
  unavailable.

For production CPU and allocation captures, preserved source maps are applied
before function frames are joined. This lets differently hashed and minified
baseline/candidate bundles compare by original module and function; the
generated frame is retained alongside the symbolicated display frame for audit.

Classification requires at least five complete pairs, but five or six pairs are
still a small sample. A narrow interval does not correct thermal drift, browser
noise, background work, or a fixture that does not represent the application.
Treat `comparison.json` as diagnostic evidence, inspect raw samples and effect
sizes, and repeat important findings. The paired runner deliberately has no
performance exit gate.

For a more extensive unprofiled runtime comparison, use at least two warmup
pairs and ten measured pairs:

```sh
npm run bench:runtime:paired -- \
  --baseline-root /absolute/path/to/baseline-worktree \
  --candidate-root /absolute/path/to/candidate-worktree \
  --production \
  --warmups 2 \
  --repetitions 10 \
  --profile-kind none \
  --output /tmp/canvas-runtime-production-10-pairs
```

## Deep CPU and rendering traces

Deep profiling is opt-in because recording a trace changes the timing being
observed. It is a diagnostic tool for locating work after a repeatable runtime
or parity benchmark identifies a regression; its numbers do not feed the
acceptance gates.

Capture a sampled V8 CPU profile and Chrome rendering trace:

```sh
npm run bench:profile -- \
  --sections 24 \
  --complexity 24 \
  --mode high \
  --profile-dir /tmp/canvas-profile
```

`--profile` is shorthand for `--profile=cpu,trace`. Allocation sampling can be
added for a separate diagnostic run:

```sh
npm run bench:runtime -- \
  --profile=cpu,trace,allocations \
  --profile-dir /tmp/canvas-profile-with-allocations
```

Useful controls:

- `--cpu-sampling-interval-us N` (default `1000`)
- `--allocation-sampling-interval-bytes N` (default `32768`)
- `--profile-dir PATH`; if omitted, the runner uses a sibling of `--output` or
  a fresh temporary directory when no result output path was supplied

For baseline/candidate evidence, capture only one profiler kind per paired run:

```sh
npm run bench:runtime:paired -- \
  --baseline-root /absolute/path/to/baseline-worktree \
  --candidate-root /absolute/path/to/candidate-worktree \
  --production \
  --warmups 2 \
  --repetitions 6 \
  --profile-kind cpu \
  --output /tmp/canvas-runtime-paired-cpu
```

Repeat serially with `--profile-kind trace` and `--profile-kind allocations`,
using a different empty output directory each time. The paired runner
intentionally rejects combined profiler kinds: CPU sampling, tracing, and
allocation sampling perturb the workload differently, so a combined capture is
useful for exploration but not an honest per-kind baseline comparison.

The directory contains `cpu.cpuprofile` for the Chrome DevTools Performance
panel, `trace.json.gz` for the DevTools trace viewer, optional
`allocations.heapprofile`, and compact `summary.json`, `manifest.json`, and
`result.json` files. The summary correlates named intro/navbar/visibility/drag/
pan/zoom/settle phases with main-thread tasks, JavaScript, GC, style, layout,
paint, raster, compositor activity, top sampled functions, and the existing
React Profiler/render-counter result.

CPU profiles are statistical samples from the renderer's V8 isolate, not exact
hardware CPU cycle counts. The Chrome trace supplies scheduling and rendering
pipeline context, but headless Chromium may use software rendering and does not
represent physical GPU utilization. Allocation sampling is also statistical;
it intentionally avoids a stop-the-world heap snapshot inside the measured
window.

The mode presets are intentionally viewport-based because the library detects mode from the real window:

| Requested mode | Viewport |
| --- | --- |
| high | 1440 × 900 |
| medium | 900 × 900 |
| low | 600 × 844 |

If Chromium is not installed for Playwright, install only the browser runtime:

```sh
npm exec playwright install chromium
```

## Metrics and result contract

Results conform to [`result.schema.json`](./result.schema.json), currently schema/scenario version `1.0.0`. Each result includes:

- React Profiler commit counts and actual/base durations, globally and by phase;
- explicit render counters for the fixture, section payloads, and runtime probe;
- approximate listener add/remove/active counts by event type;
- rAF frame-interval percentiles and an estimated dropped-frame count;
- Long Task and Long Animation Frame totals when the browser supports them;
- raw rAF-sampled `x`, `y`, `scale`, and animation-stage trajectories;
- animation-stage transition timestamps and per-phase motion path summaries/hashes;
- phase-boundary snapshots of mounted section IDs, draggable transforms, toolbar text, and navbar button state;
- fail-closed Playwright `pageerror` and `console.error` provenance;
- environment, navigation timing, heap snapshot when exposed, warnings, and errors.

The raw trajectory and phase timestamps are intentional: performance changes should also be checked for animation timing/path equivalence. A different trajectory hash is a signal to inspect the normalized raw samples; it is not by itself a failure because frame sampling cadence can vary.

Instrumentation has measurable overhead. Compare runs only when the fixture configuration, browser version, viewport, runner, and machine conditions match. Use several repetitions and compare distributions rather than a single result.

## Resource and parity guidance

Run the runtime paired suite and the E2E suites serially. Do not launch CPU,
trace, and allocation matrices in parallel: every target owns a Chromium
process and a Vite server, traces can be large, and concurrent runs introduce
CPU contention, memory pressure, thermal drift, and misleading results. Prefer
a fresh directory under `/tmp` for large captures, copy out only results you
intend to retain, and confirm interrupted runs have stopped before starting the
next suite.

This runtime fixture records motion and behavior contracts, but it does not
evaluate pixel parity. Use the E2E suite for the zero-pixel, DOM, style,
geometry, interaction, and animation checks required before accepting an
optimization.
