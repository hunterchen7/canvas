import { performance } from "node:perf_hooks";
import { comparePairedSamples } from "../runtime/scripts/profile-compare.ts";

const baseline = Array.from({ length: 64 }, (_, index) => 100 + (index % 13));
const candidate = baseline.map((value, index) => value - 2 + (index % 5) / 10);
const options = {
  bootstrapIterations: 10_000,
  minimumPairs: 5,
  seed: "canvas-native-benchmark",
};

for (let index = 0; index < 3; index += 1) {
  comparePairedSamples(baseline, candidate, options);
}

const repetitions = 20;
let checksum = 0;
const startedAt = performance.now();
for (let index = 0; index < repetitions; index += 1) {
  checksum += comparePairedSamples(baseline, candidate, options).pairCount;
}
const durationMs = performance.now() - startedAt;

console.log(JSON.stringify({
  implementation: "typescript-reference",
  bootstrapIterations: options.bootstrapIterations,
  pairsPerComparison: baseline.length,
  repetitions,
  totalDurationMs: durationMs,
  millisecondsPerComparison: durationMs / repetitions,
  checksum,
}, null, 2));
