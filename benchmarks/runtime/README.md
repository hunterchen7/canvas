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
- `--url http://127.0.0.1:4173` to reuse an existing server
- `--width` and `--height` to override the mode viewport preset

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
- `--profile-dir PATH`; if omitted, the runner uses a temporary directory

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
- environment, navigation timing, heap snapshot when exposed, warnings, and errors.

The raw trajectory and phase timestamps are intentional: performance changes should also be checked for animation timing/path equivalence. A different trajectory hash is a signal to inspect the normalized raw samples; it is not by itself a failure because frame sampling cadence can vary.

Instrumentation has measurable overhead. Compare runs only when the fixture configuration, browser version, viewport, runner, and machine conditions match. Use several repetitions and compare distributions rather than a single result.
