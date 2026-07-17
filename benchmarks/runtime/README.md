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
