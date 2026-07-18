import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertBrowserErrorFree,
  applyNativeAnalysis,
  assertObservedLibraryIdentity,
  createPairSchedule,
  createPortAllocator,
  observedLibraryIdentityFromResult,
  parseArguments,
  parseObservedLibraryIdentity,
  prepareOutputDirectory,
  RUNTIME_RUNNER_PATH,
  targetOrder,
} from "./run-paired.ts";

const repositoryRoot = "/workspace/candidate";
const cwd = "/workspace";

test("paired captures spawn the TypeScript runtime entry point", () => {
  assert.equal(path.basename(RUNTIME_RUNNER_PATH), "run.ts");
  assert.equal(existsSync(RUNTIME_RUNNER_PATH), true);
});

test("paired order counterbalances baseline and candidate within each phase", () => {
  assert.deepEqual(targetOrder(1), ["baseline", "candidate"]);
  assert.deepEqual(targetOrder(2), ["candidate", "baseline"]);
  assert.deepEqual(
    createPairSchedule({ warmups: 2, repetitions: 4 }),
    [
      { phase: "warmup", pairNumber: 1, order: ["baseline", "candidate"] },
      { phase: "warmup", pairNumber: 2, order: ["candidate", "baseline"] },
      { phase: "measured", pairNumber: 1, order: ["baseline", "candidate"] },
      { phase: "measured", pairNumber: 2, order: ["candidate", "baseline"] },
      { phase: "measured", pairNumber: 3, order: ["baseline", "candidate"] },
      { phase: "measured", pairNumber: 4, order: ["candidate", "baseline"] },
    ],
  );
  assert.throws(
    () => createPairSchedule({ warmups: 1, repetitions: 4 }),
    /warmups must be a non-negative even integer/,
  );
  assert.throws(
    () => createPairSchedule({ warmups: 2, repetitions: 3 }),
    /repetitions must be a positive even integer/,
  );
});

test("arguments resolve both sources and accept exactly one profile kind", () => {
  const options = parseArguments(
    [
      "--baseline-root",
      "baseline",
      "--candidate-root=candidate-two",
      "--output",
      "artifacts/run",
      "--warmups",
      "2",
      "--repetitions=10",
      "--profile-kind",
      "cpu",
      "--sections",
      "100",
      "--nav-items",
      "12",
      "--intro",
      "0",
      "--production",
    ],
    {
      repositoryRoot,
      cwd,
      now: new Date("2026-07-17T12:00:00.000Z"),
      processId: 1,
    },
  );

  assert.equal(options.baselineRoot, path.join(cwd, "baseline"));
  assert.equal(options.candidateRoot, path.join(cwd, "candidate-two"));
  assert.equal(options.output, path.join(cwd, "artifacts/run"));
  assert.equal(options.warmups, 2);
  assert.equal(options.repetitions, 10);
  assert.equal(options.profileKind, "cpu");
  assert.equal(options.analysisEngine, "typescript");
  assert.equal(options.sections, 100);
  assert.equal(options.navItems, 12);
  assert.equal(options.intro, false);
  assert.equal(options.production, true);
});

test("arguments accept the opt-in Go analysis engine", () => {
  const options = parseArguments(
    [
      "--baseline-root",
      "baseline",
      "--analysis-engine",
      "go",
      "--warmups",
      "0",
      "--repetitions",
      "2",
    ],
    { repositoryRoot, cwd },
  );
  assert.equal(options.analysisEngine, "go");
  assert.throws(
    () =>
      parseArguments(
        ["--baseline-root", "baseline", "--analysis-engine", "rust"],
        { repositoryRoot, cwd },
      ),
    /analysis-engine must be one of typescript, go/,
  );
});

test("native analysis replaces pending metrics and recomputes classifications", async () => {
  const comparison = {
    cases: [
      {
        classifications: { "pending-native-analysis": 2 },
        metrics: [
          { comparison: { classification: "pending-native-analysis" } },
          { comparison: { classification: "pending-native-analysis" } },
        ],
      },
    ],
  };
  const requests = [{ baseline: [1], candidate: [2] }, { baseline: [2], candidate: [1] }];
  const batchCount = await applyNativeAnalysis(comparison, requests, {
    compareBatches: async () => ({
      batchCount: 2,
      comparisons: [
        { classification: "regression", pairCount: 1 },
        { classification: "improvement", pairCount: 1 },
      ],
    }),
  });
  assert.equal(batchCount, 2);
  assert.deepEqual(comparison.cases[0].classifications, {
    regression: 1,
    improvement: 1,
  });
  assert.equal((comparison.cases[0].metrics[0].comparison as any).pairCount, 1);
  await assert.rejects(
    applyNativeAnalysis(comparison, requests, {
      compareBatches: async () => ({ batchCount: 1, comparisons: [] }),
    }),
    /returned 0 comparisons for 2 requests/,
  );
});

test("arguments reject missing baseline and combined profiler captures", () => {
  assert.throws(
    () => parseArguments([], { repositoryRoot, cwd }),
    /--baseline-root is required/,
  );
  assert.throws(
    () =>
      parseArguments(
        ["--baseline-root", "baseline", "--profile-kind", "cpu,trace"],
        { repositoryRoot, cwd },
      ),
    /combined captures are intentionally unsupported/,
  );
  assert.throws(
    () =>
      parseArguments(
        ["--baseline-root", "baseline", "--warmups", "1"],
        { repositoryRoot, cwd },
      ),
    /--warmups must be zero or even/,
  );
  assert.throws(
    () =>
      parseArguments(
        ["--baseline-root", "baseline", "--repetitions", "5"],
        { repositoryRoot, cwd },
      ),
    /--repetitions must be even/,
  );
});

test("stderr identity proof is parsed and verified exactly", () => {
  const proof = "a".repeat(64);
  const sourceHash = "b".repeat(64);
  const observed = parseObservedLibraryIdentity(
    `Vite output\n[library] baseline ${proof} (${sourceHash})\nWrote result\n`,
  );
  const expected = {
    label: "baseline",
    proof,
    source: { hash: sourceHash },
  };

  assert.deepEqual(observed, { label: "baseline", proof, sourceHash });
  assert.equal(assertObservedLibraryIdentity(expected, observed), true);
  assert.throws(
    () =>
      assertObservedLibraryIdentity(expected, {
        ...observed,
        sourceHash: "c".repeat(64),
      }),
    /identity mismatch/,
  );
});

test("durable result identity is normalized for paired verification", () => {
  const proof = "d".repeat(64);
  const sourceHash = "e".repeat(64);
  assert.deepEqual(
    observedLibraryIdentityFromResult({
      library: {
        verified: true,
        observed: {
          label: "candidate",
          proof,
          source: { hash: sourceHash },
        },
      },
    }),
    { label: "candidate", proof, sourceHash },
  );
  assert.equal(observedLibraryIdentityFromResult({ library: {} }), null);
});

test("paired acceptance requires explicit zero-error browser provenance", () => {
  const browserErrors = {
    policy: "fail-on-any",
    eventCount: 0,
    pageErrorCount: 0,
    consoleErrorCount: 0,
    events: [],
  };
  assert.equal(
    assertBrowserErrorFree({ execution: { browserErrors } }),
    true,
  );
  assert.throws(
    () => assertBrowserErrorFree({ execution: {} }),
    /missing fail-closed/,
  );
  assert.throws(
    () =>
      assertBrowserErrorFree({
        execution: {
          browserErrors: {
            ...browserErrors,
            eventCount: 1,
            consoleErrorCount: 1,
            events: [
              {
                sequence: 1,
                type: "console.error",
                message: "fixture failed",
              },
            ],
          },
        },
      }),
    /Browser emitted 1 unhandled error event.*fixture failed/,
  );
});

test("paired output directory is exclusively claimed", async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "canvas-runtime-paired-"),
  );
  try {
    const empty = path.join(temporary, "empty");
    await mkdir(empty);
    await prepareOutputDirectory(empty);
    assert.deepEqual(await readdir(empty), [".canvas-runtime-capture"]);
    await assert.rejects(prepareOutputDirectory(empty), /not empty/);

    const stale = path.join(temporary, "stale");
    await mkdir(stale);
    await writeFile(path.join(stale, "result.json"), "{}\n", "utf8");
    await assert.rejects(prepareOutputDirectory(stale), /not empty/);

    const raced = path.join(temporary, "raced");
    const outcomes = await Promise.allSettled([
      prepareOutputDirectory(raced),
      prepareOutputDirectory(raced),
    ]);
    assert.equal(
      outcomes.filter((outcome) => outcome.status === "fulfilled").length,
      1,
    );
    assert.equal(
      outcomes.filter((outcome) => outcome.status === "rejected").length,
      1,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("paired ports use distinct OS assignments by default", async () => {
  const assigned = [41_000, 41_000, 41_001];
  const allocate = createPortAllocator(null, {
    allocateEphemeral: async () => assigned.shift(),
  });
  const first = await allocate();
  const second = await allocate();
  assert.equal(first, 41_000);
  assert.equal(second, 41_001);
});
