# Canvas browser parity and performance suite

This suite captures the same deterministic fixture from a reference worktree and a candidate worktree. It never updates or accepts a baseline automatically. Any pixel, DOM, computed-style, SVG, geometry, interaction-checkpoint, or animation-semantic mismatch fails strict parity and is listed in `report.json` under `summary.deferredUserDecisions` for explicit review.

It only reads library source through a Vite alias. The fixture and runner live under `benchmarks/e2e`; no production source or package manifest changes are required.

## What it exercises

- Intro grow, blur, fade, and pan-to-home timing.
- Pointer pan and ctrl-wheel zoom.
- Navbar spring navigation and Toolbar readout updates.
- Framer Motion drag plus transparent SVG alpha hit-testing.
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

Use `--browser chrome` for installed system Chrome, `--headed` for debugging, or `--scenarios intro,zoom,navbar,toolbar,drag` to select cases. Two already-running fixtures can be supplied with `--baseline-url` and `--candidate-url`.

## Artifacts

`report.json` is the machine-readable comparison summary. Each target also contains:

- `scenarios/<name>.json`: raw trajectory, event, frame interval, long-task/LoAF, CDP, DOM, style, geometry, and SVG data.
- `screenshots/<name>.png`: stable-state full-page screenshot.
- `trace.zip`: Playwright trace with screenshots and DOM snapshots.
- `target.json`: target metadata, browser errors, and scenario records.

`diffs/<name>.png` is an exact pixel diff. The default gate allows zero different pixels. Geometry allows only 0.01 px to absorb serialization rounding. Direct interactions are gated at input-indexed state checkpoints, including draggable translation, and intro/navigation animations gate exact configuration, stage order, endpoints, and truly settled pixels/geometry. Wall-clock rAF trajectories and stage timing remain advisory because browser scheduling varies between identical runs; all raw samples and advisory differences are retained for inspection. Before the stable capture, the runner waits for motion and document animations to settle, stops fixture-only intervals, and deterministically rebuilds compositing layers.

Performance comparisons are reported separately because single-run CPU timing is noisy. Add `--fail-on-perf-regression` to make the configured 15% plus 2 ms regression heuristic affect the exit code. Parity always affects the exit code.

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
