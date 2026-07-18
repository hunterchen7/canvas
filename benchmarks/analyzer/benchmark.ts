import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
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

const measurements: any[] = [{
  implementation: "typescript-in-process",
  bootstrapIterations: options.bootstrapIterations,
  pairsPerComparison: baseline.length,
  repetitions,
  totalDurationMs: durationMs,
  millisecondsPerComparison: durationMs / repetitions,
  checksum,
}];

const comparisons = Array.from({ length: repetitions }, () => ({
  baseline,
  candidate,
  options,
}));
const requestJson = JSON.stringify({ comparisons });
const batchStartedAt = performance.now();
const parsedRequest = JSON.parse(requestJson);
const referenceResults = parsedRequest.comparisons.map((entry) =>
  comparePairedSamples(entry.baseline, entry.candidate, entry.options),
);
const referenceOutput = JSON.stringify({ comparisons: referenceResults });
const parsedReferenceOutput = JSON.parse(referenceOutput);
const batchDurationMs = performance.now() - batchStartedAt;
measurements.push({
  implementation: "typescript-batch-end-to-end",
  bootstrapIterations: options.bootstrapIterations,
  pairsPerComparison: baseline.length,
  repetitions,
  totalDurationMs: batchDurationMs,
  millisecondsPerComparison: batchDurationMs / repetitions,
  checksum: parsedReferenceOutput.comparisons.reduce(
    (sum, result) => sum + result.pairCount,
    0,
  ),
});

const analyzerRoot = path.dirname(fileURLToPath(import.meta.url));
const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "canvas-analyzer-benchmark-"));
const binaryPath = path.join(temporaryDirectory, "canvas-profile-analyzer");
try {
  execFileSync("go", ["build", "-o", binaryPath, "."], {
    cwd: analyzerRoot,
    stdio: "pipe",
  });
  const nativeStartedAt = performance.now();
  const nativeOutput = execFileSync(binaryPath, ["--batch"], {
    encoding: "utf8",
    input: requestJson,
    maxBuffer: 64 * 1024 * 1024,
  });
  const nativeResult = JSON.parse(nativeOutput);
  const nativeDurationMs = performance.now() - nativeStartedAt;
  measurements.push({
    implementation: "go-batch-end-to-end",
    bootstrapIterations: options.bootstrapIterations,
    pairsPerComparison: baseline.length,
    repetitions,
    totalDurationMs: nativeDurationMs,
    millisecondsPerComparison: nativeDurationMs / repetitions,
    checksum: nativeResult.comparisons.reduce(
      (sum, result) => sum + result.pairCount,
      0,
    ),
    includes: ["JSON input", "process startup", "analysis", "JSON output"],
    excludes: ["one-time go build"],
  });
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log(JSON.stringify(measurements, null, 2));
