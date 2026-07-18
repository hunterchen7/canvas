import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { comparePairedSamples } from "../runtime/scripts/profile-compare.ts";
import { compareNativeBatch, compareNativeBatches } from "./native.ts";

type AnalyzerRequest = {
  baseline: Array<number | null | string>;
  candidate: Array<number | null | string>;
  options?: Record<string, unknown>;
};

const analyzerRoot = path.dirname(fileURLToPath(import.meta.url));
const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "canvas-analyzer-"));
const binaryPath = path.join(temporaryDirectory, "canvas-profile-analyzer");

before(() => {
  execFileSync("go", ["build", "-o", binaryPath, "."], {
    cwd: analyzerRoot,
    stdio: "pipe",
  });
});

after(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

function nativeComparison(request: AnalyzerRequest) {
  const output = execFileSync(binaryPath, [], {
    encoding: "utf8",
    input: JSON.stringify(request),
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function assertEquivalent(actual: unknown, expected: unknown, location = "result") {
  if (typeof actual === "number" && typeof expected === "number") {
    const tolerance = Math.max(1, Math.abs(expected)) * 1e-12;
    assert.ok(
      Math.abs(actual - expected) <= tolerance,
      `${location}: ${actual} differs from ${expected}`,
    );
    return;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    assert.ok(Array.isArray(actual) && Array.isArray(expected), `${location}: array shape differs`);
    assert.equal(actual.length, expected.length, `${location}: array length differs`);
    for (let index = 0; index < actual.length; index += 1) {
      assertEquivalent(actual[index], expected[index], `${location}[${index}]`);
    }
    return;
  }
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    const actualRecord = actual as Record<string, unknown>;
    const expectedRecord = expected as Record<string, unknown>;
    assert.deepEqual(Object.keys(actualRecord).sort(), Object.keys(expectedRecord).sort(), `${location}: keys differ`);
    for (const key of Object.keys(expectedRecord)) {
      assertEquivalent(actualRecord[key], expectedRecord[key], `${location}.${key}`);
    }
    return;
  }
  assert.deepEqual(actual, expected, location);
}

function referenceComparison(request: AnalyzerRequest) {
  return comparePairedSamples(request.baseline, request.candidate, request.options);
}

const edgeCases: AnalyzerRequest[] = [
  { baseline: [], candidate: [], options: {} },
  { baseline: [0, 0, 1, -1, null], candidate: [0, 2, 2, -2], options: { seed: "zeros", bootstrapIterations: 257 } },
  { baseline: [10, 20, 30, 40, 50], candidate: [9, 18, 27, 36, 45], options: { seed: "improvement", bootstrapIterations: 1_000 } },
  { baseline: [10, 20, 30, 40, 50], candidate: [11, 22, 33, 44, 55], options: { seed: -17, bootstrapIterations: 1_000, lowerIsBetter: false } },
  { baseline: [1, 2, 3], candidate: [1, 2, 3], options: { seed: "unchanged", minimumPairs: 1, zeroTolerance: 0.001 } },
  { baseline: [1, 2, 3, 4], candidate: [2, 1, 4, 3], options: { seed: "not-classified", lowerIsBetter: null, minimumPairs: 1 } },
  { baseline: ["missing", 5, null, 10], candidate: [1, 4, 3, 9, 11], options: { seed: "missing-🚀", bootstrapIterations: 333 } },
  { baseline: [1, 2, 3, 4, 5], candidate: [2, 3, 4, 5, 6], options: { seed: 1e-7, bootstrapIterations: 257 } },
  { baseline: [1, 2, 3, 4, 5], candidate: [2, 3, 4, 5, 6], options: { seed: 1e-6, bootstrapIterations: 257 } },
  { baseline: [1, 2, 3, 4, 5], candidate: [2, 3, 4, 5, 6], options: { seed: 1e20, bootstrapIterations: 257 } },
  { baseline: [1, 2, 3, 4, 5], candidate: [2, 3, 4, 5, 6], options: { seed: 1e21, bootstrapIterations: 257 } },
];

for (const [index, request] of edgeCases.entries()) {
  test(`Go analyzer matches TypeScript edge case ${index + 1}`, () => {
    assertEquivalent(nativeComparison(request), referenceComparison(request));
  });
}

test("Go analyzer matches TypeScript across 100 seeded randomized comparisons", () => {
  let state = 0x7f4a7c15;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };

  for (let caseIndex = 0; caseIndex < 100; caseIndex += 1) {
    const baseline: AnalyzerRequest["baseline"] = [];
    const candidate: AnalyzerRequest["candidate"] = [];
    const pairCount = caseIndex % 17;
    for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      const baselineValue = Math.round((random() * 400 - 100) * 1_000) / 1_000;
      const delta = Math.round((random() * 20 - 10) * 1_000) / 1_000;
      baseline.push(random() < 0.08 ? null : baselineValue);
      candidate.push(random() < 0.08 ? null : baselineValue + delta);
    }
    if (caseIndex % 9 === 0) candidate.push(caseIndex);
    const direction = caseIndex % 3;
    const options: Record<string, unknown> = {
      bootstrapIterations: 129 + (caseIndex % 31),
      minimumPairs: 1 + (caseIndex % 8),
      seed: `differential-${caseIndex}-🧪`,
      zeroTolerance: (caseIndex % 5) / 10,
    };
    if (direction === 0) options.lowerIsBetter = true;
    else if (direction === 1) options.lowerIsBetter = false;
    else options.lowerIsBetter = null;
    const request = { baseline, candidate, options };
    assertEquivalent(
      nativeComparison(request),
      referenceComparison(request),
      `randomized[${caseIndex}]`,
    );
  }
});

test("Go analyzer output is byte-stable for identical inputs", () => {
  const request = edgeCases[2];
  const input = JSON.stringify(request);
  const first = execFileSync(binaryPath, [], { encoding: "utf8", input });
  const second = execFileSync(binaryPath, [], { encoding: "utf8", input });
  assert.equal(first, second);
});

test("Go batch transport and TypeScript bridge preserve comparison order", async () => {
  const expected = edgeCases.map(referenceComparison);
  const directOutput = execFileSync(binaryPath, ["--batch"], {
    encoding: "utf8",
    input: JSON.stringify({ comparisons: edgeCases }),
  });
  const direct = JSON.parse(directOutput).comparisons;
  assertEquivalent(direct, expected, "directBatch");

  const bridged = await compareNativeBatch(edgeCases, {
    executable: binaryPath,
    arguments: ["--batch"],
    cwd: analyzerRoot,
  });
  assertEquivalent(bridged, expected, "bridgedBatch");
});

test("TypeScript bridge aborts and awaits the complete subprocess tree", async () => {
  const controller = new AbortController();
  const childScript = [
    "const { spawn } = require('node:child_process');",
    "spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
    "setInterval(() => {}, 1000);",
  ].join("");
  const startedAt = performance.now();
  const pending = compareNativeBatch([edgeCases[0]], {
    executable: process.execPath,
    arguments: ["-e", childScript],
    cwd: analyzerRoot,
    timeoutMs: 10_000,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(new Error("test abort")), 100);
  await assert.rejects(pending, /test abort/);
  assert.ok(performance.now() - startedAt < 3_000, "abort did not await prompt tree cleanup");
});

test("TypeScript bridge chunks large workloads without reordering results", async () => {
  const expected = edgeCases.map(referenceComparison);
  const chunked = await compareNativeBatches(edgeCases, {
    executable: binaryPath,
    arguments: ["--batch"],
    cwd: analyzerRoot,
    maximumBatchComparisons: 3,
  });
  assert.ok(chunked.batchCount > 1, "test workload did not exercise chunking");
  assertEquivalent(chunked.comparisons, expected, "chunkedBatch");
});

test("TypeScript bridge rejects impossible batch ceilings before spawning", async () => {
  await assert.rejects(
    compareNativeBatches([edgeCases[0]], { maximumBatchComparisons: 0 }),
    /maximumBatchComparisons must be a positive safe integer/,
  );
  await assert.rejects(
    compareNativeBatches([edgeCases[0]], { maximumBatchWork: 1 }),
    /exceeds maximumBatchWork/,
  );
  await assert.rejects(
    compareNativeBatches([edgeCases[0]], { maximumBatchBytes: 18 }),
    /exceeds maximumBatchBytes/,
  );
  await assert.rejects(
    compareNativeBatches([edgeCases[0]], { timeoutMs: Number.NaN }),
    /timeoutMs must be a positive finite number/,
  );
});
