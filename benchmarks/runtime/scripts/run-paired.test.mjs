import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  assertObservedLibraryIdentity,
  createPairSchedule,
  observedLibraryIdentityFromResult,
  parseArguments,
  parseObservedLibraryIdentity,
  targetOrder,
} from "./run-paired.mjs";

const repositoryRoot = "/workspace/candidate";
const cwd = "/workspace";

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
  assert.equal(options.sections, 100);
  assert.equal(options.navItems, 12);
  assert.equal(options.intro, false);
  assert.equal(options.production, true);
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
