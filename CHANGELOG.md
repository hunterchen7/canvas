# Changelog

## [0.12.2](https://github.com/hunterchen7/canvas/compare/canvas-v0.12.1...canvas-v0.12.2) (2026-07-19)


### Performance Improvements

* **navbar:** lazy-load lucide-react icons to fix consumer bundle bloat ([1536851](https://github.com/hunterchen7/canvas/commit/1536851463d72d4ba247c70769469d24b7397eb4))
* **navbar:** lazy-load lucide-react icons to fix consumer bundle bloat ([e36058e](https://github.com/hunterchen7/canvas/commit/e36058e55d9cfac39c2071c7b8e673483c25bea8))


### Miscellaneous Chores

* **bench:** add native Go profile analyzer ([341229e](https://github.com/hunterchen7/canvas/commit/341229e01c1be8f46190a1de6a0d594dbdfc530b))
* **bench:** enforce native batch ceilings ([2acacda](https://github.com/hunterchen7/canvas/commit/2acacdae217228aba5834fdb9fdf1956727bfd62))
* **bench:** harden and batch native analysis ([0c760fd](https://github.com/hunterchen7/canvas/commit/0c760fdde9f915db9d3c8758303ddd79d961601e))
* **bench:** harden native profiling workflow ([f017f2a](https://github.com/hunterchen7/canvas/commit/f017f2ac7a15e7bf9e44fc6a2d9bc0545879df2b))
* **bench:** match JavaScript numeric seed formatting ([b2cd95d](https://github.com/hunterchen7/canvas/commit/b2cd95db285028c8e5594e8b7ade0dd3e926e394))
* **bench:** migrate profiling tools to TypeScript and Go ([f8f868e](https://github.com/hunterchen7/canvas/commit/f8f868ea98dfb72d9a40e3a70f2965dd47629dc1))
* **bench:** preserve interrupted report state ([399e65e](https://github.com/hunterchen7/canvas/commit/399e65ee7eb29aebf8ce669aca8b0bdcb894492c))
* **bench:** reject nonportable analyzer options ([e80797a](https://github.com/hunterchen7/canvas/commit/e80797a17eb496c2705600472ce04dce3f22044f))
* **bench:** spawn converted runtime entry point ([133d18e](https://github.com/hunterchen7/canvas/commit/133d18e6d018c563309d3a2a69e82f395d5834cf))
* **bench:** update bundle baseline for lucide code-split ([9c4ff1d](https://github.com/hunterchen7/canvas/commit/9c4ff1db2e96fdd8bd68e9920ef02c0a9b25f95c))


### Code Refactoring

* **bench:** convert bundle tooling to TypeScript ([256cb7b](https://github.com/hunterchen7/canvas/commit/256cb7bbb1223bb8d04092a8ee8082b2ee4e2c1b))
* **bench:** convert e2e tooling to TypeScript ([e4dc1c2](https://github.com/hunterchen7/canvas/commit/e4dc1c2523dfdc11fc4bc7f1668ad35c2d30c44c))
* **bench:** convert runtime tooling to TypeScript ([aeaf6f2](https://github.com/hunterchen7/canvas/commit/aeaf6f245b85d37aaccb4c97766cc4292798dbaf))
* **test:** convert browser test to TypeScript ([138c7cb](https://github.com/hunterchen7/canvas/commit/138c7cb54564e9627fa34627c2e5b69ca6564312))


### Tests

* **bench:** exercise native analysis end to end ([d2d923b](https://github.com/hunterchen7/canvas/commit/d2d923b86a89fc553a4e0e80cc3ebc9b31be2db1))
* **bench:** exercise parity harness on every PR ([5fce5a4](https://github.com/hunterchen7/canvas/commit/5fce5a4c94366a799ef11eceb6ece34169346403))


### Build System

* **bench:** preserve package size budget ([dca3f77](https://github.com/hunterchen7/canvas/commit/dca3f771bfa9bdd3d4807c8849028f3a161245d1))


### Continuous Integration

* **bench:** keep the bundle report free of build-tool noise ([d6f783c](https://github.com/hunterchen7/canvas/commit/d6f783cf3f7a38ec93b6b94991d92e3fd73a8204))
* **bench:** make bundle budget informational, report deltas on the PR ([aa7e8b2](https://github.com/hunterchen7/canvas/commit/aa7e8b28b9f4ccc2f163531b4c04b954f63cdab1))
* **bench:** make bundle budget informational, report deltas on the PR ([7c3a6eb](https://github.com/hunterchen7/canvas/commit/7c3a6eb4b25453ecd1b74b99321f6f52434a5992))
* **bench:** render the bundle report as a Markdown table ([bec285e](https://github.com/hunterchen7/canvas/commit/bec285ec0913abd58f0a9588fda5ef0509b83775))
* **bench:** show before/after deltas in the bundle report ([309ef80](https://github.com/hunterchen7/canvas/commit/309ef8022855fb042f9edab5cf66e853a27b0593))

## [0.12.1](https://github.com/hunterchen7/canvas/compare/canvas-v0.12.0...canvas-v0.12.1) (2026-07-18)

This release reduces rendering, subscription, and interaction hot-path overhead while adding reproducible before/after performance and strict visual-parity tooling. The public API and import paths are unchanged, so no migration is required. The complete work landed in [PR #49](https://github.com/hunterchen7/canvas/pull/49).

### Performance improvements

* Reduced unnecessary React work by sharing window-size updates, removing duplicate internal dimension subscriptions, skipping unused high-mode visibility subscriptions, stopping loading-state updates after the intro, and avoiding toolbar React renders unless custom formatters need them.
* Reduced wheel and pan property reads, removed per-event pinch arrays and midpoint allocations, and reused draggable-image geometry for bounds and alpha hit-testing.
* Improved consumer tree-shaking by marking only CSS as side-effectful and removed Framer Motion overhead from the already-static default intro logo.

### Benchmark evidence

Against `0.12.0`, two independent 10-pair production-profiling fixture runs produced:

| Metric | Replication A | Replication B |
| --- | ---: | ---: |
| Total React Profiler work | 65.05 → 22.35 ms | 63.85 → 21.15 ms |
| React commits | 754 → 20 | 789 → 20 |
| Active listeners | 273 → 221 | 273 → 221 |
| Active resize listeners | 79 → 27 | 79 → 27 |

The primary React-work metrics improved in every measured pair: about 66% less total React Profiler work and 97.3–97.5% fewer commits. These are fixture-specific React Profiler and listener measurements, not whole-application CPU-cycle or FPS guarantees.

Pinned-toolchain consumer fixture bundles all became smaller. Focused-import gzip bundles shrank 10.9–89.5%, the `Draggable` fixture shrank 21.3%, and the full `Canvas` fixture shrank 0.18%; generated CSS was byte-identical. The packed npm artifact instead grew from 99,302 to 101,288 bytes (+2.000%), with the same 95 files, and remained within the explicitly reviewed package-size gate.

A fail-closed 14-scenario Chromium comparison at 1280×720/DPR 1 detected 0 differing pixels across 12,902,400 compared pixels, 0 px maximum geometry difference, and 0 numeric difference across 160 interaction checkpoints. Animation semantics and sampled trajectories also matched in the fixed benchmark environment.

### Fixes and examples

* Made shared window-dimension snapshots deterministic and hydration-safe.
* Restored the HackWestern example's 1.05× draggable-image hover expansion by opting that demo into the existing `hoverScale` behavior; this is not a new library default.

### Benchmarking and CI

* Added paired production-runtime benchmarks for React commits and render work, listeners, frame pacing, Long Tasks, Long Animation Frames, heap usage, and motion trajectories.
* Added opt-in CPU, browser-trace, allocation, and forced-GC profiling, plus exact screenshot, DOM, style, SVG, geometry, interaction, and animation-parity comparisons.
* Added Node 24 CI checks for dependency auditing, package and fixture types, tests, builds, consumer bundle/package budgets, fail-closed browser capture, and strict parity.

### Measurement scope and disclosed tradeoffs

* Final-head frame-time signals were noisy or inconclusive, so this release does not claim universally higher FPS or smoother frames. A single report-only dynamic-toolbar p99 warning did not reproduce in six focused repeats.
* Two forced-GC studies found about 1.1–1.4% more incremental live-heap growth even though absolute post-capture live heap decreased by roughly 257–305 KB and sampled allocation traffic improved. This release therefore does not claim uniformly lower memory use.
* CPU, trace, and allocation profiles remain diagnostic: they were captured on a near-final source revision before the final hydration-only change and are not presented as release-head guarantees.

See the [full benchmark evidence and interpretation limits](https://github.com/hunterchen7/canvas/blob/8740f0c356cc252bea0b0457ee9384afd0df17c2/benchmarks/results/pr-49/README.md).

## [0.12.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.11.1...canvas-v0.12.0) (2026-02-25)


### Features

* add configurable zoom multipliers via zoomConfig prop ([#47](https://github.com/hunterchen7/canvas/issues/47)) ([d8aa866](https://github.com/hunterchen7/canvas/commit/d8aa866d6e105b07613f726ed71cebbc90d2001c))

## [0.11.1](https://github.com/hunterchen7/canvas/compare/canvas-v0.11.0...canvas-v0.11.1) (2026-02-24)


### Bug Fixes

* resize off-screen canvas to match image for alpha detection ([#45](https://github.com/hunterchen7/canvas/issues/45)) ([ee2b982](https://github.com/hunterchen7/canvas/commit/ee2b98200a140bdfc4b287250794b6c4a06f61ac)), closes [#44](https://github.com/hunterchen7/canvas/issues/44)

## [0.11.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.10.1...canvas-v0.11.0) (2026-02-23)


### Features

* add navigateToSection to canvas context ([#42](https://github.com/hunterchen7/canvas/issues/42)) ([2037274](https://github.com/hunterchen7/canvas/commit/203727423b1d7c7d91aa3a0dbfe4f3a702cae512))

## [0.10.1](https://github.com/hunterchen7/canvas/compare/canvas-v0.10.0...canvas-v0.10.1) (2026-02-22)


### Bug Fixes

* skip all animations when skipIntro is true ([#39](https://github.com/hunterchen7/canvas/issues/39)) ([406cd91](https://github.com/hunterchen7/canvas/commit/406cd912f89543a368da090cde3d42772c43e615))

## [0.10.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.9.0...canvas-v0.10.0) (2026-02-05)


### Features

* add panTransition prop for customizable pan-to-home animation timing ([#37](https://github.com/hunterchen7/canvas/issues/37)) ([24d33cd](https://github.com/hunterchen7/canvas/commit/24d33cd8a6fed4118e50347dbfe2a93476014104))

## [0.9.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.8.0...canvas-v0.9.0) (2026-02-03)


### Features

* add rolldown bundler for library builds ([#35](https://github.com/hunterchen7/canvas/issues/35)) ([b88611d](https://github.com/hunterchen7/canvas/commit/b88611d0df261ae837c1979874705bf094343dbf))

## [0.8.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.7.0...canvas-v0.8.0) (2026-01-31)


### Features

* customizable navbar styling ([#34](https://github.com/hunterchen7/canvas/issues/34)) ([3b978ba](https://github.com/hunterchen7/canvas/commit/3b978ba8b35e3df7feff8d3e4dbe69a44b1faa26))


### Documentation

* add claude.md for AI assistant guidelines ([#32](https://github.com/hunterchen7/canvas/issues/32)) ([3f42e85](https://github.com/hunterchen7/canvas/commit/3f42e85428f77a01f88ca942f7454c9308ea1d97))

## [0.7.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.6.0...canvas-v0.7.0) (2026-01-15)


### Features

* Add customizable canvas size ([#26](https://github.com/hunterchen7/canvas/issues/26)) ([d959255](https://github.com/hunterchen7/canvas/commit/d9592557a3eab44cf686e70fb8b090b09e4d08b6))

## [0.6.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.5.0...canvas-v0.6.0) (2026-01-15)


### Features

* toolbar styling ([#29](https://github.com/hunterchen7/canvas/issues/29)) ([063f2e8](https://github.com/hunterchen7/canvas/commit/063f2e88d0dd33fa4e95e48a8f549ba1a25273a2))

## [0.5.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.4.1...canvas-v0.5.0) (2026-01-14)


### Features

* example demo ([#24](https://github.com/hunterchen7/canvas/issues/24)) ([2acdef6](https://github.com/hunterchen7/canvas/commit/2acdef69509177c5c41aec5e6655bccabfec14a9))

## [0.4.1](https://github.com/hunterchen7/canvas/compare/canvas-v0.4.0...canvas-v0.4.1) (2026-01-14)


### Bug Fixes

* npm downloads badge to show total downloads ([#23](https://github.com/hunterchen7/canvas/issues/23)) ([b49c7f7](https://github.com/hunterchen7/canvas/commit/b49c7f7f33454bd08d4356c8a7cef49be678e12d))


### Miscellaneous Chores

* Add npm downloads badge to README ([#21](https://github.com/hunterchen7/canvas/issues/21)) ([71c44e2](https://github.com/hunterchen7/canvas/commit/71c44e2d79b46a6098a9a96b8ad46e60e24c0a6b))

## [0.4.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.3.1...canvas-v0.4.0) (2026-01-13)


### Features

* allow customizable backgrounds ([#18](https://github.com/hunterchen7/canvas/issues/18)) ([9614433](https://github.com/hunterchen7/canvas/commit/9614433ec8349d048e3f1f3e3c1fbd5bddfbadca))

## [0.3.1](https://github.com/hunterchen7/canvas/compare/canvas-v0.3.0...canvas-v0.3.1) (2026-01-13)


### Miscellaneous Chores

* remove `next.js` as dependency ([#13](https://github.com/hunterchen7/canvas/issues/13)) ([a2a727c](https://github.com/hunterchen7/canvas/commit/a2a727c9d9c9800794411ef7b0864292297725a0))

## [0.3.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.2.1...canvas-v0.3.0) (2026-01-12)


### Features

* generic navbar ([#11](https://github.com/hunterchen7/canvas/issues/11)) ([5c85950](https://github.com/hunterchen7/canvas/commit/5c85950dae9ec03135e10065de6ef826241a6fb2))

## [0.2.1](https://github.com/hunterchen7/canvas/compare/canvas-v0.2.0...canvas-v0.2.1) (2026-01-12)


### Bug Fixes

* add repo url to `package.json` ([#9](https://github.com/hunterchen7/canvas/issues/9)) ([687731a](https://github.com/hunterchen7/canvas/commit/687731ae0779004e61f97e91240d70ee126a7709))

## [0.2.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.1.3...canvas-v0.2.0) (2026-01-12)


### Features

* compiled styles ([7293473](https://github.com/hunterchen7/canvas/commit/7293473a2bec90d846235c3e2b22a2f21fa28603))
* release please auto publishing ([0f162ec](https://github.com/hunterchen7/canvas/commit/0f162ec89b6396ff085f8732f918233251860c32))

## [0.1.3](https://github.com/hunterchen7/canvas/releases/tag/v0.1.3) (2026-01-11)

Initial version tracked by release-please.
