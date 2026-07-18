function normalizedUrl(value, optionName) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error(`${optionName} must be an absolute URL`, { cause: error });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${optionName} must use http or https`);
  }
  return parsed.href;
}

export function validateSourceSelection(options) {
  const hasBaselineUrl = Boolean(options.baselineUrl);
  const hasCandidateUrl = Boolean(options.candidateUrl);
  const hasAnyUrl = hasBaselineUrl || hasCandidateUrl;

  if (hasAnyUrl) {
    if (!hasBaselineUrl || !hasCandidateUrl) {
      throw new Error(
        "--baseline-url and --candidate-url must be supplied together",
      );
    }
    if (options.baselineRootProvided || options.candidateRootProvided) {
      throw new Error(
        "URL inputs cannot be combined with --baseline-root or --candidate-root",
      );
    }
    const baselineUrl = normalizedUrl(options.baselineUrl, "--baseline-url");
    const candidateUrl = normalizedUrl(options.candidateUrl, "--candidate-url");
    if (baselineUrl === candidateUrl) {
      throw new Error("Baseline and candidate URLs must be distinct");
    }
    return { mode: "urls", baselineUrl, candidateUrl };
  }

  if (!options.baselineRootProvided || !options.baselineRoot) {
    throw new Error(
      "--baseline-root is required unless both explicit fixture URLs are supplied",
    );
  }
  return { mode: "local", baselineUrl: null, candidateUrl: null };
}

export function assertDistinctSourceTargets(baseline, candidate) {
  const baselineHash = baseline?.identity?.source?.hash;
  const candidateHash = candidate?.identity?.source?.hash;
  if (!baselineHash || !candidateHash) {
    throw new Error("Both local source targets must have a source SHA-256");
  }
  if (baselineHash === candidateHash) {
    throw new Error(
      `Baseline and candidate source hashes are identical (${baselineHash}); select a distinct historical baseline`,
    );
  }
}

export function assertStableSourceTargets(startup, current, checkpoint) {
  for (const label of ["baseline", "candidate"]) {
    const initialIdentity = startup?.[label]?.identity;
    const currentIdentity = current?.[label]?.identity;
    if (
      !initialIdentity ||
      !currentIdentity ||
      initialIdentity.proof !== currentIdentity.proof ||
      initialIdentity.source?.hash !== currentIdentity.source?.hash ||
      initialIdentity.git?.sourceTree !== currentIdentity.git?.sourceTree
    ) {
      throw new Error(
        `${label} source identity changed at ${checkpoint}; refusing to compare mixed source revisions`,
      );
    }
  }
}

export function sourceIdentitySummary(target) {
  const identity = target?.identity;
  if (!identity) return null;
  return {
    proof: identity.proof,
    root: identity.root,
    package: identity.package,
    source: identity.source,
    git: {
      head: identity.git?.head ?? null,
      sourceTree: identity.git?.sourceTree ?? null,
      sourceDirty: identity.git?.sourceDirty ?? null,
      sourceStatus: identity.git?.sourceStatus ?? [],
    },
  };
}

export function evaluateRunOutcome({ comparisons, baselineErrors, candidateErrors }) {
  const errors = {
    baseline: Array.isArray(baselineErrors) ? baselineErrors : [],
    candidate: Array.isArray(candidateErrors) ? candidateErrors : [],
  };
  const pageErrorCount = errors.baseline.length + errors.candidate.length;
  const comparisonParityPass = comparisons.every(
    (comparison) => comparison.pass,
  );
  return {
    comparisonParityPass,
    parityPass: comparisonParityPass && pageErrorCount === 0,
    performancePass: comparisons.every(
      (comparison) => comparison.performancePass,
    ),
    pageErrorCount,
    errors,
  };
}
