# PR 49 performance evidence

This directory preserves a compact, reviewable audit of the benchmark results used for PR #49. Raw screenshots, diffs, browser traces, CPU profiles, allocation profiles, and per-run logs are intentionally kept as CI/local artifacts; the JSON files here retain the selected measurements, paired samples, bootstrap intervals, environment, and source provenance needed to audit the claims.

## Provenance

- Baseline: `476f6c939907849df9ecded77b0729ed84cf3833`
- Final source benchmark commit: `4b479bdb9fa08f0e04295f0f887d6a3169d73f62`
- Baseline source SHA-256: `326d96b9687797b30244c2e64ea3750e9cdb2f7e821617acbb226cbacba1dd1d`
- Candidate source SHA-256: `1acb4e0419924730cd989a9f7943704bd14d03928a3b4f44b2920e89f5802034`
- Toolchain: Node 24.18.0 and npm 11.16.0

The evidence-only commit that adds this directory does not change `src`. Final browser/runtime captures used clean source trees, verified the page-exposed source proof, checked the source before and after paired runs, and failed on any page or console error.

## Evidence map

- [bundle.json](./bundle.json): complete baseline/candidate fixture bundles, assets, package artifact sizes, and the enforced budget.
- [strict-parity.json](./strict-parity.json): the final 14-scenario exact-parity run plus six focused dynamic-toolbar replications.
- [runtime-selected.json](./runtime-selected.json): two final-head 10-pair runtime replications and selected historical CPU, trace, and allocation profiles.
- [forced-gc.json](./forced-gc.json): the deliberately preserved forced-GC heap tradeoff from two capture modes.

## Exact visual and behavioral parity

The final full run passed all 14 scenarios:

- 0 differing pixels across 12,902,400 compared pixels.
- 0 px maximum geometry difference.
- 0 numeric difference across 160 interaction checkpoints.
- Animation semantics and sampled trajectories matched.
- No page errors or parity failures.
- The restored HackWestern draggable hover expansion is covered by the drag-hover hit-test scenario.

The full run emitted one report-only p99 frame warning for the dynamic-toolbar case (10.471 ms to 12.760 ms), while p95 improved slightly, task time improved by 3.220 ms, script time improved by 11.389 ms, and long-task/LoAF blocking stayed at zero. It did not reproduce: all six focused repetitions passed, p95 remained effectively identical, and task/script duration improved in all six.

## Final-head runtime replication

Both independent 10-pair production/profiling-runtime studies improved the primary React-work metrics in every pair:

| Metric | Replication A | Replication B |
| --- | ---: | ---: |
| Overall commits | 754 → 20 | 789 → 20 |
| Overall React work | 65.05 → 22.35 ms | 63.85 → 21.15 ms |
| Navbar commits | 206 → 4 | 214.5 → 4 |
| Navbar React work | 16.30 → 1.75 ms | 16.15 → 1.40 ms |
| Active listeners | 273 → 221 | 273 → 221 |
| Active resize listeners | 79 → 27 | 79 → 27 |

The much higher per-commit mean and percentile values are denominator effects: the candidate consolidates hundreds of tiny commits into a few commits while total work falls. They are not increases in total rendering work.

A volatile intro maximum-frame signal appeared in replication A (24.35 to 37.50 ms) but reversed in replication B's paired median delta (-1.60 ms). Across 20 pairs, the median paired delta was +8.30 ms with a 95% bootstrap interval from -4.00 to +18.65 ms, so it is inconclusive. Intro p95 remained inconclusive/near-identical, the large gaps generally overlapped no React commit, and React intro work improved in every pair. This is retained as an outlier/scheduler caveat rather than hidden.

## Historical deep profiles

Deep profiles were captured at candidate `d012bfa27ac0821d81528380603b0b17bde1f086` (source SHA-256 `d5cbf7274d024fd6e3e594824ec59a7a05113faba4dfd8afab547c0647e52a10`). They precede the later hydration-only server-snapshot change and are diagnostic, not final-head gates.

- JavaScript CPU sampled time: 261.771 to 135.380 ms (-47.42%).
- GC sampled time: 20.155 to 6.188 ms (-65.43%).
- Trace main-thread JavaScript active time: 407.889 to 181.110 ms (-56.22%).
- Sampled allocations: 68,604,766 to 18,862,846 bytes (-72.88%).
- Trace intro JavaScript active time: 147.785 to 80.360 ms (-46.43%).

Each headline improvement above occurred in all six measured pairs. Instrumentation has non-zero overhead, so paired direction and distributions matter more than absolute values.

## Bundle and package gate

All consumer fixture/module budgets passed. The npm artifact grew within the explicit 2% package allowance:

- Packed: 99,302 to 101,288 bytes (+1,986; +2.000%, exactly the floored limit).
- Unpacked: 382,417 to 389,893 bytes (+7,476; +1.955%).
- Files: 95 to 95.

## Forced-GC tradeoff

Two 10-pair forced-GC captures agree on a subtle memory tradeoff:

- Absolute post-capture live heap improved by 257,302 to 304,730 bytes.
- Incremental live-heap growth regressed by 219,910 to 276,900 bytes (about 1.1-1.4%) in all pairs.

This does not imply a visual or animation change, and the allocation profiler recorded a much larger reduction in sampled allocation traffic. Because forced-GC deltas depend on what was live before the action, this remains a disclosed diagnostic for reviewer judgment rather than a performance gate.

## Interpretation limits

Runtime/deep-profile classifications are exploratory, diagnostic-only, and unadjusted across many metrics. The merge gates are deterministic correctness checks: build/type/test/audit, consumer bundle/package budgets, fail-closed browser capture, and exact visual/geometry/interaction/animation parity.
