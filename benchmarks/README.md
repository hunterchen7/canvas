# Performance benchmark workflow

This directory is the acceptance gate for Canvas performance work. An
optimization is kept only when it improves a repeatable metric and preserves
the existing visual and interaction contracts.

## Suites

- `bundle/` measures minified raw, gzip, and Brotli bytes, initial versus async
  delivery, module attribution, CSS, and the packed npm artifact.
- `runtime/` runs a configurable Canvas stress fixture and records React
  Profiler commits/durations, render counters, listener counts, rAF pacing,
  Long Tasks, Long Animation Frames, heap data, and motion trajectories.
- `e2e/` compares a reference worktree with a candidate worktree using exact
  screenshots, DOM/computed-style/SVG/geometry contracts, deterministic input
  checkpoints, animation semantics, and Chrome main-thread CPU proxies.

Each suite has its own README with commands and result schemas.

## Acceptance policy

For each production change:

1. Run the same scenario on the untouched reference worktree and the candidate
   worktree, on the same browser and machine.
2. Compare several runtime repetitions; use medians for CPU and frame metrics.
3. Require zero changed screenshot pixels at the fixed browser configuration.
4. Require identical settled DOM, computed styles, SVG markup, geometry,
   interaction checkpoints, animation configuration, stage order, and
   endpoints.
5. Revert the change if it does not improve its target metric or regresses a
   different performance gate.

Raw wall-clock animation samples remain in the reports, but browser scheduling
noise is not silently converted into a wider visual tolerance. Exact transition
configuration and deterministic behavior checkpoints are the blocking gates.

Any proposal with a real tradeoff—different loading timing, public API,
animation/culling timing, compositing, texture fidelity, or event latency—is
measured separately and deferred for an explicit product decision. It is not
accepted by updating a baseline.

## Common commands

```sh
npm run bench:bundle:compare
npm run bench:runtime -- --sections 24 --nav-items 8 --complexity 24 --mode high
npm run bench:parity -- \
  --baseline-root /absolute/path/to/reference \
  --candidate-root /absolute/path/to/candidate \
  --sections 100 \
  --output /tmp/canvas-parity
```

Generated runtime and browser artifacts belong outside the repository or under
the ignored suite artifact directory. Baselines and reports should change only
when the measurement contract itself changes.
