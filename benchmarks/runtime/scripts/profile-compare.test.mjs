import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildPairedProfileReport,
  canonicalizeProfileUrl,
  comparePairedSamples,
  flattenProfileRun,
  summarizeDistribution,
} from "./profile-compare.mjs";

test("summarizeDistribution reports robust and conventional statistics", () => {
  const summary = summarizeDistribution([0, 1, 2, 3, 100, null, NaN, Infinity]);
  assert.equal(summary.count, 5);
  assert.equal(summary.missingCount, 3);
  assert.deepEqual(
    {
      min: summary.min,
      p25: summary.p25,
      median: summary.median,
      p75: summary.p75,
      max: summary.max,
      iqr: summary.iqr,
      mad: summary.mad,
    },
    { min: 0, p25: 1, median: 2, p75: 3, max: 100, iqr: 2, mad: 1 },
  );
  assert.equal(summary.mean, 21.2);
  assert(Math.abs(summary.stddev - 44.0647) < 0.001);
});

test("summarizeDistribution distinguishes no data from zero", () => {
  assert.equal(summarizeDistribution([]).median, null);
  assert.equal(summarizeDistribution([undefined, NaN]).missingCount, 2);
  assert.equal(summarizeDistribution([0]).median, 0);
  assert.equal(summarizeDistribution([0]).stddev, 0);
});

test("comparePairedSamples is deterministic and robust to an outlier", () => {
  const baseline = [100, 102, 98, 101, 99, 103, 97, 104, 10_000];
  const candidate = [80, 82, 79, 81, 79, 83, 77, 84, 20_000];
  const options = { seed: 42, bootstrapIterations: 2_000 };
  const first = comparePairedSamples(baseline, candidate, options);
  const second = comparePairedSamples(baseline, candidate, options);
  assert.deepEqual(first.bootstrap95, second.bootstrap95);
  assert.equal(first.absoluteDelta.median, -20);
  assert.equal(first.signConsistency.improvementCount, 8);
  assert.equal(first.signConsistency.regressionCount, 1);
  assert.equal(first.classification, "improvement");
});

test("comparePairedSamples treats crossed confidence intervals as inconclusive", () => {
  const result = comparePairedSamples(
    [10, 10, 10, 10, 10, 10],
    [9, 11, 9, 11, 9, 11],
    { seed: "noise", bootstrapIterations: 2_000 },
  );
  assert(result.bootstrap95.absoluteDelta.lower <= 0);
  assert(result.bootstrap95.absoluteDelta.upper >= 0);
  assert.equal(result.classification, "inconclusive");
  assert.equal(result.signConsistency.dominantDirection, "mixed");
});

test("comparePairedSamples handles zero baselines and missing pairs", () => {
  const result = comparePairedSamples(
    [0, 0, 10, undefined, 20],
    [0, 5, 5, 10, Infinity],
    { bootstrapIterations: 100 },
  );
  assert.equal(result.inputPairCount, 5);
  assert.equal(result.pairCount, 3);
  assert.equal(result.missingPairCount, 2);
  assert.equal(result.percentDelta.count, 2);
  assert.equal(result.percentDeltaUnavailableCount, 1);
  assert.deepEqual(
    result.pairs.map((pair) => pair.percentDelta),
    [0, null, -50],
  );
});

test("higher-is-better metrics reverse classification", () => {
  const result = comparePairedSamples(
    [10, 11, 12, 13, 14],
    [20, 21, 22, 23, 24],
    {
      lowerIsBetter: false,
      bootstrapIterations: 100,
    },
  );
  assert.equal(result.classification, "improvement");
  assert.equal(result.signConsistency.improvementCount, 5);
});

test("comparePairedSamples refuses to classify undersized samples", () => {
  const result = comparePairedSamples([10, 10, 10, 10], [5, 5, 5, 5], {
    bootstrapIterations: 100,
  });
  assert.equal(result.minimumPairsForClassification, 5);
  assert.equal(result.classification, "insufficient-data");
});

test("unknown-direction metrics report increases instead of unchanged values", () => {
  const result = comparePairedSamples(
    [10, 10, 10, 10, 10],
    [20, 20, 20, 20, 20],
    { lowerIsBetter: null, bootstrapIterations: 100 },
  );
  assert.equal(result.classification, "not-classified");
  assert.equal(result.signConsistency.unchangedCount, 0);
  assert.equal(result.signConsistency.increaseCount, 5);
  assert.equal(result.signConsistency.increaseFraction, 1);
  assert.equal(result.signConsistency.improvementFraction, null);
  assert.equal(result.signConsistency.dominantDirection, "increase");
});

test("canonicalizeProfileUrl joins Vite worktree modules across origins", () => {
  const options = {
    rootPrefixes: ["/work/baseline", "/work/candidate"],
    origins: ["http://127.0.0.1:4100", "http://localhost:4200"],
  };
  assert.equal(
    canonicalizeProfileUrl(
      "http://127.0.0.1:4100/@fs/work/baseline/packages/canvas/src/index.ts?v=aaa#x",
      options,
    ),
    "/packages/canvas/src/index.ts",
  );
  assert.equal(
    canonicalizeProfileUrl(
      "http://localhost:4200/@fs/work/candidate/packages/canvas/src/index.ts?v=bbb",
      options,
    ),
    "/packages/canvas/src/index.ts",
  );
  assert.equal(canonicalizeProfileUrl(""), "<anonymous>");
});

function profileSummary(value, root, lineNumber = 10) {
  const frame = {
    functionName: "renderCanvas",
    url: `http://127.0.0.1:4000/@fs${root}/packages/canvas/src/render.ts?v=x`,
    lineNumber,
    columnNumber: 2,
    selfTimeMs: value,
    inclusiveTimeMs: value * 2,
    selfSamples: value,
    inclusiveSamples: value * 2,
  };
  return {
    react: {
      profiler: {
        commitCount: value,
        actualDuration: { totalMs: value * 3 },
      },
      renderCount: value,
      phases: [
        {
          name: "drag",
          durationMs: value * 10,
          profiler: { commitCount: value },
          renderCount: value,
        },
      ],
    },
    trace: {
      durationMs: value * 100,
      eventCount: value * 10,
      intervalCount: value * 5,
      mainThread: { activeTimeMs: value * 4 },
      tasks: { activeTimeMs: value * 2 },
      mainThreadActivity: { javascript: { activeTimeMs: value } },
      crossThreadActivity: { raster: { threadActiveTimeMs: value * 2 } },
      phases: {
        drag: {
          totalMs: value * 10,
          firstStartUs: 123,
          lastEndUs: 456,
          tasks: { activeTimeMs: value },
          mainThreadActivity: { layout: { activeTimeMs: value / 2 } },
        },
      },
    },
    cpu: {
      durationMs: value * 100,
      sampledTimeMs: value * 50,
      sampleCount: value,
      nodeCount: value,
      sampleIntervalUs: { mean: 1_000 },
      timeBreakdownMs: { javascript: value * 4, idle: value * 20 },
      topSelfTime: [frame],
      topInclusiveTime: [{ ...frame }],
    },
    allocations: {
      nodeCount: value,
      sampleEntryCount: value,
      totalSampledBytes: value * 1_024,
      sampleEntryBytes: value * 1_024,
      topAllocationSites: [
        {
          functionName: "allocateCanvas",
          url: frame.url,
          lineNumber,
          columnNumber: 5,
          sampledBytes: value * 512,
          sampleCount: value,
        },
      ],
    },
  };
}

test("flattenProfileRun includes all deep-profile families and ignores function lines", () => {
  const flattened = flattenProfileRun(
    {
      profileSummary: profileSummary(2, "/work/candidate", 99),
      runtimeResult: {
        frames: { p95Ms: 8.3, estimatedDroppedFrames: 2 },
        listeners: { totals: { active: 27 } },
        environment: { usedJsHeapSizeBytes: 1_024 },
        phases: [
          {
            name: "drag",
            frames: { p95Ms: 7.2, estimatedDroppedFrames: 1 },
            longTasks: { supported: true, totalMs: 4 },
            longAnimationFrames: {
              supported: true,
              totalBlockingDurationMs: 3,
            },
          },
        ],
      },
    },
    { rootPrefixes: ["/work/candidate"] },
  );
  const keys = new Set(flattened.map((metric) => metric.key));
  assert(keys.has("runtime.overall.profiler.commitCount"));
  assert(keys.has("runtime.phase.drag.profiler.commitCount"));
  assert(keys.has("runtime.overall.frames.p95Ms"));
  assert(keys.has("runtime.overall.listeners.totals.active"));
  assert(keys.has("runtime.phase.drag.frames.p95Ms"));
  assert(keys.has("runtime.phase.drag.longTasks.totalMs"));
  assert(
    keys.has(
      "runtime.phase.drag.longAnimationFrames.totalBlockingDurationMs",
    ),
  );
  assert(keys.has("trace.overall.mainThreadActivity.javascript.activeTimeMs"));
  assert(keys.has("trace.phase.drag.mainThreadActivity.layout.activeTimeMs"));
  assert(keys.has("cpu.breakdown.javascript"));
  assert(keys.has("allocations.overall.totalSampledBytes"));
  const cpuFunction = flattened.find(
    (metric) => metric.source === "cpu" && metric.scope === "function",
  );
  assert.equal(cpuFunction.function.module, "/packages/canvas/src/render.ts");
  assert.equal(cpuFunction.function.functionName, "renderCanvas");
  assert.equal(cpuFunction.displayFrames[0].lineNumber, 99);
  assert(!keys.has("trace.phase.drag.firstStartUs"));
});

test("buildPairedProfileReport constructs case metrics and preserves display frames", () => {
  const runs = [];
  for (let pairIndex = 0; pairIndex < 3; pairIndex += 1) {
    runs.push({
      caseName: "high",
      pairIndex,
      target: "baseline",
      orderIndex: pairIndex % 2,
      profileDirectory: `/tmp/baseline-${pairIndex}`,
      profileSummary: profileSummary(10 + pairIndex, "/work/baseline", 10),
    });
    runs.push({
      caseName: "high",
      pairIndex,
      target: "candidate",
      orderIndex: (pairIndex + 1) % 2,
      profileDirectory: `/tmp/candidate-${pairIndex}`,
      profileSummary: profileSummary(5 + pairIndex, "/work/candidate", 200),
    });
  }
  runs.push({
    caseName: "low",
    pairIndex: 0,
    target: "baseline",
    profileSummary: profileSummary(1, "/work/baseline"),
  });

  const report = buildPairedProfileReport({
    targets: {
      baseline: { label: "old", root: "/work/baseline" },
      candidate: { label: "new", root: "/work/candidate" },
    },
    cases: [{ name: "high", sections: 24 }, "low"],
    runs,
    settings: {
      bootstrapIterations: 500,
      bootstrapSeed: 7,
      minimumPairs: 3,
    },
    environment: { browser: "Chromium" },
  });

  assert.equal(report.summary.runCount, 7);
  assert.equal(report.summary.completePairCount, 3);
  assert.equal(report.cases[0].pairCount, 3);
  assert.equal(report.cases[1].incompletePairCount, 1);
  assert.equal(report.warnings.length, 2);
  assert.equal(report.settings.multipleComparisons.exploratory, true);
  assert.equal(report.settings.multipleComparisons.adjusted, false);
  assert.match(report.warnings[0], /unadjusted for multiple comparisons/);
  const commitMetric = report.cases[0].metrics.find(
    (metric) => metric.key === "runtime.overall.profiler.commitCount",
  );
  assert.equal(commitMetric.comparison.classification, "improvement");
  assert.equal(commitMetric.comparison.pairCount, 3);
  const functionMetric = report.cases[0].metrics.find(
    (metric) =>
      metric.scope === "function" && metric.key.endsWith(".selfTimeMs"),
  );
  assert.equal(functionMetric.comparison.pairCount, 3);
  assert.equal(functionMetric.displayFrames.baseline[0].lineNumber, 10);
  assert.equal(functionMetric.displayFrames.candidate[0].lineNumber, 200);
  assert.equal(functionMetric.function.module, "/packages/canvas/src/render.ts");
});

test("production source maps join differently hashed target bundles", (context) => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "canvas-profile-compare-"));
  context.after(() => rmSync(temporary, { recursive: true, force: true }));

  const runs = [];
  for (const [target, hash, root] of [
    ["baseline", "baselineHash", "/work/baseline"],
    ["candidate", "candidateHash", "/work/candidate"],
  ]) {
    const portableDirectory = `pairs/pair-1/${target}/profile`;
    const absoluteDirectory = path.join(temporary, target, "profile");
    const assets = path.join(absoluteDirectory, "production-build", "assets");
    mkdirSync(assets, { recursive: true });
    const generatedFile = `index-${hash}.js`;
    writeFileSync(
      path.join(assets, `${generatedFile}.map`),
      JSON.stringify({
        version: 3,
        file: generatedFile,
        sources: [`${root}/src/render.ts`],
        sourcesContent: ["export function renderCanvas() {}\n"],
        names: ["renderCanvas"],
        mappings: "AAAAA",
      }),
    );
    runs.push({
      caseName: "production-cpu",
      pairIndex: 1,
      target,
      profileDirectory: portableDirectory,
      profileDirectoryAbsolute: absoluteDirectory,
      profileSummary: {
        cpu: {
          topSelfTime: [
            {
              functionName: target === "baseline" ? "a" : "b",
              url: `http://127.0.0.1:4000/assets/${generatedFile}`,
              lineNumber: 1,
              columnNumber: 1,
              selfTimeMs: target === "baseline" ? 10 : 5,
              selfSamples: target === "baseline" ? 10 : 5,
            },
          ],
          topInclusiveTime: [],
        },
        allocations: {
          topAllocationSites: [
            {
              functionName: target === "baseline" ? "a" : "b",
              url: `http://127.0.0.1:4000/assets/${generatedFile}`,
              lineNumber: 1,
              columnNumber: 1,
              sampledBytes: target === "baseline" ? 1_024 : 512,
              sampleCount: target === "baseline" ? 2 : 1,
            },
          ],
        },
      },
    });
  }

  const report = buildPairedProfileReport({
    targets: {
      baseline: { root: "/work/baseline" },
      candidate: { root: "/work/candidate" },
    },
    cases: ["production-cpu"],
    runs,
    settings: { minimumPairs: 1, bootstrapIterations: 100 },
  });
  const metric = report.cases[0].metrics.find(
    (entry) =>
      entry.scope === "function" && entry.key.endsWith(".selfTimeMs"),
  );
  assert(metric);
  assert.equal(metric.function.module, "/src/render.ts");
  assert.equal(metric.function.functionName, "renderCanvas");
  assert.equal(metric.comparison.pairCount, 1);
  assert.equal(metric.comparison.absoluteDelta.median, -5);
  const allocationMetric = report.cases[0].metrics.find(
    (entry) =>
      entry.source === "allocations" && entry.key.endsWith(".sampledBytes"),
  );
  assert(allocationMetric);
  assert.equal(allocationMetric.function.module, "/src/render.ts");
  assert.equal(allocationMetric.function.functionName, "renderCanvas");
  assert.equal(allocationMetric.comparison.pairCount, 1);
  assert.equal(allocationMetric.comparison.absoluteDelta.median, -512);
  assert.equal(
    metric.displayFrames.baseline[0].generated.functionName,
    "a",
  );
  assert.equal(
    metric.displayFrames.candidate[0].generated.functionName,
    "b",
  );
  assert.equal(
    report.cases[0].pairs[0].targets.baseline.profileDirectory,
    "pairs/pair-1/baseline/profile",
  );
  assert.equal(JSON.stringify(report).includes(temporary), false);
});
