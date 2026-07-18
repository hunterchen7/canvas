import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDistinctSourceTargets,
  assertStableSourceTargets,
  evaluateRunOutcome,
  validateSourceSelection,
} from "./runner-helpers.ts";

function target(hash, proof = hash, sourceTree = hash) {
  return {
    identity: {
      proof,
      source: { hash },
      git: { sourceTree },
    },
  };
}

test("local parity requires an explicit baseline root", () => {
  assert.throws(
    () =>
      validateSourceSelection({
        baselineRoot: null,
        candidateRoot: "/candidate",
        baselineRootProvided: false,
        candidateRootProvided: false,
        baselineUrl: null,
        candidateUrl: null,
      }),
    /--baseline-root is required/,
  );
  assert.equal(
    validateSourceSelection({
      baselineRoot: "/baseline",
      candidateRoot: "/candidate",
      baselineRootProvided: true,
      candidateRootProvided: false,
      baselineUrl: null,
      candidateUrl: null,
    }).mode,
    "local",
  );
});

test("URL parity requires two distinct explicit URLs and no root flags", () => {
  const selection = validateSourceSelection({
    baselineRoot: null,
    candidateRoot: "/candidate-default",
    baselineRootProvided: false,
    candidateRootProvided: false,
    baselineUrl: "http://127.0.0.1:4100",
    candidateUrl: "http://127.0.0.1:4200",
  });
  assert.deepEqual(selection, {
    mode: "urls",
    baselineUrl: "http://127.0.0.1:4100/",
    candidateUrl: "http://127.0.0.1:4200/",
  });
  assert.throws(
    () =>
      validateSourceSelection({
        baselineRootProvided: false,
        candidateRootProvided: false,
        baselineUrl: "http://127.0.0.1:4100",
        candidateUrl: null,
      }),
    /must be supplied together/,
  );
  assert.throws(
    () =>
      validateSourceSelection({
        baselineRootProvided: false,
        candidateRootProvided: false,
        baselineUrl: "http://127.0.0.1:4100",
        candidateUrl: "http://127.0.0.1:4100/",
      }),
    /must be distinct/,
  );
  assert.throws(
    () =>
      validateSourceSelection({
        baselineRootProvided: true,
        candidateRootProvided: false,
        baselineUrl: "http://127.0.0.1:4100",
        candidateUrl: "http://127.0.0.1:4200",
      }),
    /cannot be combined/,
  );
  assert.throws(
    () =>
      validateSourceSelection({
        baselineRootProvided: false,
        candidateRootProvided: false,
        baselineUrl: "http://127.0.0.1:4100",
        candidateUrl: "http://127.0.0.1:4200",
        allowIdenticalSources: true,
      }),
    /only valid for local source roots/,
  );
});

test("local targets must be distinct and remain stable", () => {
  assert.throws(
    () => assertDistinctSourceTargets(target("same"), target("same")),
    /source hashes are identical/,
  );
  assert.doesNotThrow(() =>
    assertDistinctSourceTargets(target("baseline"), target("candidate")),
  );
  assert.throws(
    () =>
      assertDistinctSourceTargets(target("baseline"), target("candidate"), {
        allowIdenticalSources: true,
      }),
    /requires matching local source hashes/,
  );
  assert.doesNotThrow(() =>
    assertDistinctSourceTargets(target("same"), target("same"), {
      allowIdenticalSources: true,
    }),
  );

  const startup = {
    baseline: target("baseline", "proof-b", "tree-b"),
    candidate: target("candidate", "proof-c", "tree-c"),
  };
  assert.doesNotThrow(() =>
    assertStableSourceTargets(startup, startup, "after-baseline"),
  );
  assert.throws(
    () =>
      assertStableSourceTargets(
        startup,
        {
          ...startup,
          candidate: target("changed", "proof-new", "tree-new"),
        },
        "after-candidate",
      ),
    /source identity changed at after-candidate/,
  );
});

test("browser errors fail parity even when every comparison passes", () => {
  const clean = evaluateRunOutcome({
    comparisons: [{ pass: true, performancePass: true }],
    baselineErrors: [],
    candidateErrors: [],
  });
  assert.equal(clean.parityPass, true);
  assert.equal(clean.pageErrorCount, 0);

  const errored = evaluateRunOutcome({
    comparisons: [{ pass: true, performancePass: true }],
    baselineErrors: [],
    candidateErrors: [{ type: "pageerror", message: "boom" }],
  });
  assert.equal(errored.comparisonParityPass, true);
  assert.equal(errored.parityPass, false);
  assert.equal(errored.pageErrorCount, 1);
  assert.deepEqual(errored.errors.candidate, [
    { type: "pageerror", message: "boom" },
  ]);
});
