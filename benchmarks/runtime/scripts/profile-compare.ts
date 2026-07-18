import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import sourceMapJs from "source-map-js";

const { SourceMapConsumer } = sourceMapJs;
const DEFAULT_BOOTSTRAP_ITERATIONS = 10_000;
const DEFAULT_BOOTSTRAP_SEED = 0x5eedc0de;
const DEFAULT_MINIMUM_PAIRS = 5;
const MULTIPLE_COMPARISONS_WARNING =
  "Per-metric bootstrap intervals and improvement/regression classifications are exploratory and unadjusted for multiple comparisons; do not interpret them as family-wise significance or performance gates.";

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function valuesFrom(input) {
  if (input == null) return [];
  if (Array.isArray(input)) return input;
  if (typeof input !== "string" && input[Symbol.iterator]) return [...input];
  return [input];
}

function quantile(sorted, probability) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, probability));
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  return lower + (upper - lower) * (position - lowerIndex);
}

/**
 * Descriptive statistics for finite numeric inputs. Missing, NaN, and infinite
 * values are counted but never coerced to zero. MAD is the unscaled median
 * absolute deviation and stddev is the sample standard deviation.
 */
export function summarizeDistribution(input) {
  const supplied = valuesFrom(input);
  const values = supplied.filter((value) => finiteNumber(value) != null);
  if (values.length === 0) {
    return {
      count: 0,
      missingCount: supplied.length,
      min: null,
      p25: null,
      median: null,
      p75: null,
      max: null,
      iqr: null,
      mad: null,
      mean: null,
      stddev: null,
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const p25 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const p75 = quantile(sorted, 0.75);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squaredError = values.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  );
  const deviations = values
    .map((value) => Math.abs(value - median))
    .sort((left, right) => left - right);

  return {
    count: values.length,
    missingCount: supplied.length - values.length,
    min: sorted[0],
    p25,
    median,
    p75,
    max: sorted.at(-1),
    iqr: p75 - p25,
    mad: quantile(deviations, 0.5),
    mean,
    stddev: values.length > 1 ? Math.sqrt(squaredError / (values.length - 1)) : 0,
  };
}

function hashSeed(value) {
  if (Number.isSafeInteger(value)) return value >>> 0;
  const text = String(value ?? DEFAULT_BOOTSTRAP_SEED);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function bootstrapMedianConfidenceInterval(values, options) {
  if (values.length === 0) {
    return {
      confidenceLevel: 0.95,
      statistic: "median",
      iterations: 0,
      seed: hashSeed(options.seed),
      lower: null,
      upper: null,
    };
  }
  const iterations = Math.max(
    1,
    Number.isSafeInteger(options.iterations)
      ? options.iterations
      : DEFAULT_BOOTSTRAP_ITERATIONS,
  );
  const seed = hashSeed(options.seed);
  const random = mulberry32(seed);
  const estimates = new Array(iterations);
  const sample = new Array(values.length);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let index = 0; index < values.length; index += 1) {
      sample[index] = values[Math.floor(random() * values.length)];
    }
    sample.sort((left, right) => left - right);
    estimates[iteration] = quantile(sample, 0.5);
  }
  estimates.sort((left, right) => left - right);
  return {
    confidenceLevel: 0.95,
    statistic: "median",
    iterations,
    seed,
    lower: quantile(estimates, 0.025),
    upper: quantile(estimates, 0.975),
  };
}

function classifyInterval(
  interval,
  lowerIsBetter,
  zeroTolerance,
  pairCount,
  minimumPairs,
) {
  if (interval.lower == null || interval.upper == null) return "no-data";
  if (lowerIsBetter == null) return "not-classified";
  if (pairCount < minimumPairs) return "insufficient-data";
  if (
    Math.abs(interval.lower) <= zeroTolerance &&
    Math.abs(interval.upper) <= zeroTolerance
  ) {
    return "unchanged";
  }
  if (
    interval.lower <= zeroTolerance &&
    interval.upper >= -zeroTolerance
  ) {
    return "inconclusive";
  }
  const isNegative = interval.upper < -zeroTolerance;
  const improvement = lowerIsBetter ? isNegative : !isNegative;
  return improvement ? "improvement" : "regression";
}

/**
 * Compare positionally paired samples. The confidence interval is a seeded,
 * paired bootstrap over the median delta, so repeated report generation is
 * byte-stable. Percent deltas use |baseline| as the denominator. A 0 -> 0 pair
 * is 0%; other zero-baseline pairs have an unavailable percentage.
 */
export function comparePairedSamples(
  baselineInput,
  candidateInput,
  options: any = {},
) {
  const baselineSupplied = valuesFrom(baselineInput);
  const candidateSupplied = valuesFrom(candidateInput);
  const inputPairCount = Math.max(
    baselineSupplied.length,
    candidateSupplied.length,
  );
  const pairs = [];
  for (let index = 0; index < inputPairCount; index += 1) {
    const baseline = finiteNumber(baselineSupplied[index]);
    const candidate = finiteNumber(candidateSupplied[index]);
    if (baseline == null || candidate == null) continue;
    const absoluteDelta = candidate - baseline;
    const percentDelta =
      baseline === 0
        ? candidate === 0
          ? 0
          : null
        : (absoluteDelta / Math.abs(baseline)) * 100;
    pairs.push({ index, baseline, candidate, absoluteDelta, percentDelta });
  }

  const lowerIsBetter = Object.hasOwn(options, "lowerIsBetter")
    ? options.lowerIsBetter == null
      ? null
      : Boolean(options.lowerIsBetter)
    : true;
  const zeroTolerance = Math.max(0, finiteNumber(options.zeroTolerance) ?? 0);
  const minimumPairs = Number.isSafeInteger(options.minimumPairs)
    ? Math.max(1, options.minimumPairs)
    : DEFAULT_MINIMUM_PAIRS;
  let improvementCount = 0;
  let regressionCount = 0;
  let unchangedCount = 0;
  let decreaseCount = 0;
  let increaseCount = 0;
  for (const pair of pairs) {
    if (Math.abs(pair.absoluteDelta) <= zeroTolerance) {
      unchangedCount += 1;
    } else {
      const negative = pair.absoluteDelta < 0;
      if (negative) decreaseCount += 1;
      else increaseCount += 1;
      if (lowerIsBetter != null) {
        const improved = lowerIsBetter ? negative : !negative;
        if (improved) improvementCount += 1;
        else regressionCount += 1;
      }
    }
  }

  const absoluteValues = pairs.map((pair) => pair.absoluteDelta);
  const percentValues = pairs
    .map((pair) => pair.percentDelta)
    .filter((value) => value != null);
  const bootstrapIterations = Number.isSafeInteger(options.bootstrapIterations)
    ? options.bootstrapIterations
    : DEFAULT_BOOTSTRAP_ITERATIONS;
  const seed = hashSeed(options.seed ?? DEFAULT_BOOTSTRAP_SEED);
  const absoluteInterval = bootstrapMedianConfidenceInterval(absoluteValues, {
    iterations: bootstrapIterations,
    seed,
  });
  const percentInterval = bootstrapMedianConfidenceInterval(percentValues, {
    iterations: bootstrapIterations,
    seed: seed ^ 0x9e3779b9,
  });
  const directionalCounts =
    lowerIsBetter == null
      ? [decreaseCount, increaseCount, unchangedCount]
      : [improvementCount, regressionCount, unchangedCount];
  const directionalLabels =
    lowerIsBetter == null
      ? ["decrease", "increase", "unchanged"]
      : ["improvement", "regression", "unchanged"];
  const dominantCount = Math.max(...directionalCounts);
  const dominantIndexes = directionalCounts
    .map((count, index) => (count === dominantCount ? index : -1))
    .filter((index) => index >= 0);
  const dominantDirection =
    pairs.length === 0
      ? "no-data"
      : dominantIndexes.length > 1
        ? "mixed"
        : directionalLabels[dominantIndexes[0]];

  return {
    inputPairCount,
    pairCount: pairs.length,
    missingPairCount: inputPairCount - pairs.length,
    lowerIsBetter,
    minimumPairsForClassification: minimumPairs,
    baseline: summarizeDistribution(pairs.map((pair) => pair.baseline)),
    candidate: summarizeDistribution(pairs.map((pair) => pair.candidate)),
    absoluteDelta: summarizeDistribution(absoluteValues),
    percentDelta: summarizeDistribution(percentValues),
    percentDeltaUnavailableCount: pairs.length - percentValues.length,
    bootstrap95: {
      absoluteDelta: absoluteInterval,
      percentDelta: percentInterval,
    },
    signConsistency: {
      improvementCount,
      regressionCount,
      unchangedCount,
      decreaseCount,
      increaseCount,
      improvementFraction:
        pairs.length > 0 && lowerIsBetter != null
          ? improvementCount / pairs.length
          : null,
      regressionFraction:
        pairs.length > 0 && lowerIsBetter != null
          ? regressionCount / pairs.length
          : null,
      unchangedFraction:
        pairs.length > 0 ? unchangedCount / pairs.length : null,
      decreaseFraction:
        pairs.length > 0 ? decreaseCount / pairs.length : null,
      increaseFraction:
        pairs.length > 0 ? increaseCount / pairs.length : null,
      dominantDirection,
      dominantFraction: pairs.length > 0 ? dominantCount / pairs.length : null,
    },
    classification: classifyInterval(
      absoluteInterval,
      lowerIsBetter,
      zeroTolerance,
      pairs.length,
      minimumPairs,
    ),
    pairs,
  };
}

function withoutQueryOrHash(value) {
  const queryIndex = value.search(/[?#]/u);
  return queryIndex >= 0 ? value.slice(0, queryIndex) : value;
}

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizedPath(value) {
  return decodePath(value).replaceAll("\\", "/").replace(/\/{2,}/gu, "/");
}

function pathFromUrl(value, origins) {
  let result = String(value).trim();
  for (const origin of origins) {
    const normalizedOrigin = String(origin ?? "").replace(/\/$/u, "");
    if (normalizedOrigin && result.startsWith(`${normalizedOrigin}/`)) {
      result = result.slice(normalizedOrigin.length);
      break;
    }
  }
  try {
    const parsed = new URL(result);
    if (["http:", "https:", "file:"].includes(parsed.protocol)) {
      return parsed.pathname;
    }
  } catch {
    // V8 can emit relative modules and special values such as <anonymous>.
  }
  return withoutQueryOrHash(result);
}

/** Normalize origins and Vite /@fs URLs while making target roots comparable. */
export function canonicalizeProfileUrl(value, options: any = {}) {
  if (typeof value !== "string" || value.trim() === "") return "<anonymous>";
  const trimmed = value.trim();
  if (/^<[^>]+>$/u.test(trimmed)) return trimmed;
  const origins = [
    ...(Array.isArray(options.origins) ? options.origins : []),
    options.baselineOrigin,
    options.candidateOrigin,
  ].filter(Boolean);
  let result = normalizedPath(pathFromUrl(trimmed, origins));
  result = withoutQueryOrHash(result).replace(/^\/@fs(?=\/)/u, "");
  result = result.replace(/^\/@id\//u, "/@id/");

  const roots = [
    ...(Array.isArray(options.rootPrefixes) ? options.rootPrefixes : []),
    ...(Array.isArray(options.roots) ? options.roots : []),
    options.baselineRoot,
    options.candidateRoot,
  ]
    .filter(Boolean)
    .map((root) => normalizedPath(pathFromUrl(root, origins)).replace(/\/$/u, ""))
    .sort((left, right) => right.length - left.length);
  for (const root of roots) {
    if (result === root) {
      result = "/";
      break;
    }
    if (result.startsWith(`${root}/`)) {
      result = result.slice(root.length);
      break;
    }
  }
  if (!result.startsWith("/") && !result.startsWith("@")) result = `/${result}`;
  return result || "<anonymous>";
}

function sourceMapFiles(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith(".map")) files.push(absolute);
    }
  };
  visit(directory);
  return files.sort((left, right) => left.localeCompare(right));
}

function publicGeneratedPath(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const normalized = normalizedPath(pathFromUrl(value, []));
  if (!normalized || /^<[^>]+>$/u.test(normalized)) return null;
  const absolute = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return path.posix.normalize(withoutQueryOrHash(absolute));
}

function mappedSourcePath(source, generatedPath) {
  const normalized = normalizedPath(source);
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(normalized) ||
    /^[A-Za-z][A-Za-z\d+.-]*:\/\//u.test(normalized)
  ) {
    return normalized;
  }
  return path.posix.resolve(path.posix.dirname(generatedPath), normalized);
}

function sourceMapSymbolicator(run) {
  const profileSummary = run?.profileSummary ?? run?.summary ?? null;
  if (!profileSummary?.cpu && !profileSummary?.allocations) {
    return { symbolicate: null, warnings: [], mapCount: 0 };
  }
  const suppliedDirectory =
    run?.profileDirectoryAbsolute ?? run?.profileDirectory ?? null;
  if (typeof suppliedDirectory !== "string" || suppliedDirectory === "") {
    return { symbolicate: null, warnings: [], mapCount: 0 };
  }
  const profileDirectory = path.resolve(suppliedDirectory);
  const productionBuild = path.join(profileDirectory, "production-build");
  if (!existsSync(productionBuild)) {
    return { symbolicate: null, warnings: [], mapCount: 0 };
  }

  const warnings = [];
  const mapsByGeneratedPath = new Map();
  const mapsByBasename = new Map();
  let mapFiles;
  try {
    mapFiles = sourceMapFiles(productionBuild);
  } catch (error) {
    return {
      symbolicate: null,
      warnings: [
        `Could not inspect preserved production source maps: ${error instanceof Error ? error.message : error}`,
      ],
      mapCount: 0,
    };
  }
  if (mapFiles.length === 0) {
    return {
      symbolicate: null,
      warnings: ["Preserved production build contains no source maps."],
      mapCount: 0,
    };
  }

  for (const mapFile of mapFiles) {
    try {
      const raw = JSON.parse(readFileSync(mapFile, "utf8"));
      const relativeMap = normalizedPath(path.relative(productionBuild, mapFile));
      const generatedFromMapName = publicGeneratedPath(
        relativeMap.slice(0, -".map".length),
      );
      const generatedFromFile =
        typeof raw.file === "string" && raw.file
          ? publicGeneratedPath(
              path.posix.join(path.posix.dirname(relativeMap), raw.file),
            )
          : null;
      const generatedPaths = [generatedFromMapName, generatedFromFile].filter(
        Boolean,
      );
      if (generatedPaths.length === 0) {
        warnings.push(`Could not determine generated asset for ${relativeMap}.`);
        continue;
      }
      const sourceMap = {
        consumer: new SourceMapConsumer(raw),
        generatedPath: generatedPaths[0],
        mapFile: relativeMap,
      };
      for (const generatedPath of new Set(generatedPaths)) {
        mapsByGeneratedPath.set(generatedPath, sourceMap);
        const basename = path.posix.basename(generatedPath);
        const existing = mapsByBasename.get(basename);
        mapsByBasename.set(
          basename,
          existing == null || existing === sourceMap ? sourceMap : false,
        );
      }
    } catch (error) {
      warnings.push(
        `Could not load ${normalizedPath(path.relative(productionBuild, mapFile))}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  const symbolicate = (entry) => {
    const generatedPath = publicGeneratedPath(entry?.url);
    const lineNumber = finiteNumber(entry?.lineNumber);
    const columnNumber = finiteNumber(entry?.columnNumber);
    if (!generatedPath || lineNumber == null || columnNumber == null) return entry;
    const sourceMap =
      mapsByGeneratedPath.get(generatedPath) ??
      mapsByBasename.get(path.posix.basename(generatedPath));
    if (!sourceMap) return entry;
    try {
      const original = sourceMap.consumer.originalPositionFor({
        line: Math.max(1, Math.trunc(lineNumber)),
        column: Math.max(0, Math.trunc(columnNumber) - 1),
      });
      if (
        typeof original.source !== "string" ||
        !Number.isFinite(original.line) ||
        !Number.isFinite(original.column)
      ) {
        return entry;
      }
      return {
        ...entry,
        functionName:
          typeof original.name === "string" && original.name
            ? original.name
            : entry.functionName,
        url: mappedSourcePath(original.source, sourceMap.generatedPath),
        lineNumber: original.line,
        columnNumber: original.column + 1,
        generated: {
          functionName: entry.functionName ?? "(anonymous)",
          url: entry.url ?? "<anonymous>",
          lineNumber: entry.lineNumber ?? null,
          columnNumber: entry.columnNumber ?? null,
          sourceMap: sourceMap.mapFile,
        },
      };
    } catch {
      return entry;
    }
  };

  return {
    symbolicate,
    warnings,
    mapCount: mapsByGeneratedPath.size,
  };
}

function metricUnit(key) {
  if (/Bytes$/u.test(key)) return "bytes";
  if (/Percent$/u.test(key)) return "percent";
  if (/Us$/u.test(key)) return "microseconds";
  if (/Ms$/u.test(key)) return "milliseconds";
  if (/Px$/u.test(key)) return "pixels";
  if (/(?:Count|Samples|added|removed|active)$/u.test(key)) return "count";
  return "number";
}

function metricDirection(key) {
  if (/\.idle$/u.test(key)) return false;
  if (
    /(?:sampleInterval|nodeCount|sampleCount|threadCount|targetFrameIntervalMs|motion\.)/u.test(
      key,
    )
  ) {
    return null;
  }
  return true;
}

function addMetric(metrics, key, value, metadata: any = {}) {
  const number = finiteNumber(value);
  if (number == null) return;
  metrics.set(key, {
    key,
    label: metadata.label ?? key,
    source: metadata.source ?? key.split(".")[0],
    scope: metadata.scope ?? "overall",
    phase: metadata.phase ?? null,
    unit: metadata.unit ?? metricUnit(key),
    lowerIsBetter:
      metadata.lowerIsBetter === undefined
        ? metricDirection(key)
        : metadata.lowerIsBetter,
    value: number,
    ...(metadata.function ? { function: metadata.function } : {}),
    ...(metadata.displayFrames
      ? { displayFrames: metadata.displayFrames }
      : {}),
  });
}

function addTree(metrics, prefix, value, metadata, skip = new Set()) {
  if (!value || typeof value !== "object") return;
  for (const [name, child] of Object.entries(value)) {
    if (skip.has(name)) continue;
    const key = `${prefix}.${name}`;
    if (finiteNumber(child) != null) addMetric(metrics, key, child, metadata);
    else if (child && typeof child === "object" && !Array.isArray(child)) {
      addTree(metrics, key, child, metadata, skip);
    }
  }
}

function uniqueFrames(frames) {
  const seen = new Set();
  return frames.filter((frame) => {
    const key = JSON.stringify(frame);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupedFrames(entries, canonicalOptions, symbolicateFrame = null) {
  const exact = new Map();
  for (const generatedEntry of entries) {
    if (!generatedEntry || typeof generatedEntry !== "object") continue;
    const entry = symbolicateFrame?.(generatedEntry) ?? generatedEntry;
    const rawKey = [
      generatedEntry.functionName,
      generatedEntry.url,
      generatedEntry.lineNumber,
      generatedEntry.columnNumber,
    ].join("\u0000");
    const current = exact.get(rawKey) ?? {};
    exact.set(rawKey, {
      ...current,
      ...entry,
      selfTimeMs: Math.max(current.selfTimeMs ?? 0, entry.selfTimeMs ?? 0),
      inclusiveTimeMs: Math.max(
        current.inclusiveTimeMs ?? 0,
        entry.inclusiveTimeMs ?? 0,
      ),
      selfSamples: Math.max(current.selfSamples ?? 0, entry.selfSamples ?? 0),
      inclusiveSamples: Math.max(
        current.inclusiveSamples ?? 0,
        entry.inclusiveSamples ?? 0,
      ),
      sampledBytes: Math.max(current.sampledBytes ?? 0, entry.sampledBytes ?? 0),
      sampleCount: Math.max(current.sampleCount ?? 0, entry.sampleCount ?? 0),
      selfPercent: Math.max(current.selfPercent ?? 0, entry.selfPercent ?? 0),
      inclusivePercent: Math.max(
        current.inclusivePercent ?? 0,
        entry.inclusivePercent ?? 0,
      ),
      sampledPercent: Math.max(
        current.sampledPercent ?? 0,
        entry.sampledPercent ?? 0,
      ),
    });
  }
  const groups = new Map();
  for (const entry of exact.values()) {
    const functionName = entry.functionName || "(anonymous)";
    const module = canonicalizeProfileUrl(entry.url, canonicalOptions);
    const key = `${module}\u0000${functionName}`;
    const group = groups.get(key) ?? {
      key,
      functionName,
      module,
      frames: [],
      selfTimeMs: 0,
      inclusiveTimeMs: 0,
      selfSamples: 0,
      inclusiveSamples: 0,
      sampledBytes: 0,
      sampleCount: 0,
      selfPercent: 0,
      inclusivePercent: 0,
      sampledPercent: 0,
    };
    group.frames.push({
      functionName,
      url: entry.url ?? "<anonymous>",
      canonicalUrl: module,
      lineNumber: entry.lineNumber ?? null,
      columnNumber: entry.columnNumber ?? null,
      ...(entry.generated ? { generated: entry.generated } : {}),
    });
    for (const field of [
      "selfTimeMs",
      "inclusiveTimeMs",
      "selfSamples",
      "inclusiveSamples",
      "sampledBytes",
      "sampleCount",
      "selfPercent",
      "inclusivePercent",
      "sampledPercent",
    ]) {
      group[field] += finiteNumber(entry[field]) ?? 0;
    }
    groups.set(key, group);
  }
  for (const group of groups.values()) group.frames = uniqueFrames(group.frames);
  return groups;
}

/** Flatten one deep-profile capture into joinable scalar metric records. */
export function flattenProfileRun(run, options: any = {}) {
  const summary = run?.profileSummary ?? run?.summary ?? {};
  const metrics = new Map();
  const runtimeResult = run?.runtimeResult ?? null;
  const reactSummary = summary.react ?? null;
  const sourceMaps =
    options.sourceMaps ??
    (options.symbolicateFrame ? null : sourceMapSymbolicator(run));
  const symbolicateFrame =
    options.symbolicateFrame ?? sourceMaps?.symbolicate ?? null;
  if (reactSummary || runtimeResult) {
    addTree(
      metrics,
      "runtime.overall.profiler",
      runtimeResult?.profiler ?? reactSummary?.profiler,
      {
        source: "runtime",
        scope: "overall",
      },
    );
    addMetric(
      metrics,
      "runtime.overall.renderCount",
      runtimeResult?.renderCount ?? reactSummary?.renderCount,
      {
        source: "runtime",
        scope: "overall",
      },
    );
    addTree(
      metrics,
      "runtime.overall.rendersById",
      runtimeResult?.rendersById ?? reactSummary?.rendersById,
      {
        source: "runtime",
        scope: "overall",
      },
    );
    const phases = new Map();
    for (const phase of Array.isArray(reactSummary?.phases)
      ? reactSummary.phases
      : []) {
      phases.set(String(phase?.name ?? "unknown"), { ...phase });
    }
    for (const phase of Array.isArray(runtimeResult?.phases)
      ? runtimeResult.phases
      : []) {
      const name = String(phase?.name ?? "unknown");
      phases.set(name, { ...(phases.get(name) ?? {}), ...phase });
    }
    for (const [name, phase] of phases) {
      const prefix = `runtime.phase.${name}`;
      addMetric(metrics, `${prefix}.durationMs`, phase?.durationMs, {
        source: "runtime",
        scope: "phase",
        phase: name,
      });
      addTree(metrics, `${prefix}.profiler`, phase?.profiler, {
        source: "runtime",
        scope: "phase",
        phase: name,
      });
      addMetric(metrics, `${prefix}.renderCount`, phase?.renderCount, {
        source: "runtime",
        scope: "phase",
        phase: name,
      });
      addTree(metrics, `${prefix}.rendersById`, phase?.rendersById, {
        source: "runtime",
        scope: "phase",
        phase: name,
      });
      for (const branch of ["frames", "longTasks", "longAnimationFrames"]) {
        addTree(metrics, `${prefix}.${branch}`, phase?.[branch], {
          source: "runtime",
          scope: "phase",
          phase: name,
        }, new Set(["supported"]));
      }
    }
  }

  if (runtimeResult) {
    for (const branch of [
      "frames",
      "longTasks",
      "longAnimationFrames",
      "listeners",
    ]) {
      addTree(metrics, `runtime.overall.${branch}`, runtimeResult[branch], {
        source: "runtime",
        scope: "overall",
      }, new Set(["supported", "approximate"]));
    }
    addMetric(
      metrics,
      "runtime.overall.environment.usedJsHeapSizeBytes",
      runtimeResult.environment?.usedJsHeapSizeBytes,
      { source: "runtime", scope: "overall" },
    );
  }

  const trace = summary.trace;
  if (trace) {
    for (const name of ["durationMs", "eventCount", "intervalCount"]) {
      addMetric(metrics, `trace.overall.${name}`, trace[name], {
        source: "trace",
        scope: "overall",
      });
    }
    addMetric(metrics, "trace.overall.mainThread.activeTimeMs", trace.mainThread?.activeTimeMs, {
      source: "trace",
      scope: "overall",
    });
    for (const branch of ["tasks", "mainThreadActivity", "crossThreadActivity"]) {
      addTree(metrics, `trace.overall.${branch}`, trace[branch], {
        source: "trace",
        scope: "overall",
      });
    }
    for (const [phaseName, phase] of Object.entries(trace.phases ?? {})) {
      addTree(metrics, `trace.phase.${phaseName}`, phase, {
        source: "trace",
        scope: "phase",
        phase: phaseName,
      }, new Set(["firstStartUs", "lastEndUs"]));
    }
  }

  const cpu = summary.cpu;
  if (cpu) {
    for (const name of ["durationMs", "sampledTimeMs", "sampleCount", "nodeCount"]) {
      addMetric(metrics, `cpu.overall.${name}`, cpu[name], {
        source: "cpu",
        scope: "overall",
      });
    }
    addTree(metrics, "cpu.overall.sampleIntervalUs", cpu.sampleIntervalUs, {
      source: "cpu",
      scope: "overall",
      lowerIsBetter: null,
    });
    addTree(metrics, "cpu.breakdown", cpu.timeBreakdownMs, {
      source: "cpu",
      scope: "breakdown",
    });
    const functions = groupedFrames(
      [...(cpu.topSelfTime ?? []), ...(cpu.topInclusiveTime ?? [])],
      options,
      symbolicateFrame,
    );
    for (const group of functions.values()) {
      const encoded = `${encodeURIComponent(group.module)}#${encodeURIComponent(group.functionName)}`;
      const functionMetadata = {
        key: group.key,
        functionName: group.functionName,
        module: group.module,
      };
      for (const field of [
        "selfTimeMs",
        "inclusiveTimeMs",
        "selfSamples",
        "inclusiveSamples",
        "selfPercent",
        "inclusivePercent",
      ]) {
        addMetric(metrics, `cpu.function.${encoded}.${field}`, group[field], {
          source: "cpu",
          scope: "function",
          function: functionMetadata,
          displayFrames: group.frames,
        });
      }
    }
  }

  const allocations = summary.allocations;
  if (allocations) {
    for (const name of [
      "nodeCount",
      "sampleEntryCount",
      "totalSampledBytes",
      "sampleEntryBytes",
    ]) {
      addMetric(metrics, `allocations.overall.${name}`, allocations[name], {
        source: "allocations",
        scope: "overall",
      });
    }
    const sites = groupedFrames(
      allocations.topAllocationSites ?? [],
      options,
      symbolicateFrame,
    );
    for (const group of sites.values()) {
      const encoded = `${encodeURIComponent(group.module)}#${encodeURIComponent(group.functionName)}`;
      const functionMetadata = {
        key: group.key,
        functionName: group.functionName,
        module: group.module,
      };
      for (const field of ["sampledBytes", "sampleCount", "sampledPercent"]) {
        addMetric(metrics, `allocations.function.${encoded}.${field}`, group[field], {
          source: "allocations",
          scope: "function",
          function: functionMetadata,
          displayFrames: group.frames,
        });
      }
    }
  }

  return [...metrics.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function targetEntries(targets, runs) {
  if (Array.isArray(targets)) {
    return targets.map((target, index) => {
      if (typeof target === "string") return { key: target, label: target };
      const key = String(target?.key ?? target?.name ?? target?.id ?? index);
      return { ...target, key, label: target?.label ?? key };
    });
  }
  if (targets && typeof targets === "object") {
    return Object.entries(targets).map(([key, target]) =>
      target && typeof target === "object"
        ? { ...target, key, label: (target as any).label ?? key }
        : { key, label: String(target ?? key) },
    );
  }
  return [...new Set(runs.map((run) => String(run.target)))].map((key) => ({
    key,
    label: key,
  }));
}

function caseEntries(cases, runs) {
  const values = Array.isArray(cases) ? cases : [];
  const entries = values.map((value) =>
    typeof value === "string"
      ? { name: value }
      : { ...value, name: String(value?.name ?? value?.caseName ?? "default") },
  );
  const seen = new Set(entries.map((entry) => entry.name));
  for (const run of runs) {
    const name = String(run.caseName ?? "default");
    if (!seen.has(name)) {
      entries.push({ name });
      seen.add(name);
    }
  }
  return entries;
}

function rootOptions(targets) {
  const rootPrefixes = [];
  const origins = [];
  for (const target of targets) {
    for (const key of ["root", "rootPath", "repositoryRoot", "libraryRoot"]) {
      if (target[key]) rootPrefixes.push(target[key]);
    }
    for (const key of ["origin", "url", "baseUrl"]) {
      if (target[key]) origins.push(target[key]);
    }
  }
  return { rootPrefixes, origins };
}

function serializableMetadata(value) {
  if (value == null) return value ?? null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { description: String(value) };
  }
}

/** Build a multi-case, positionally paired deep-profile comparison report. */
export function buildPairedProfileReport({
  targets,
  cases,
  runs = [],
  settings = {},
  environment = null,
  compareSamples = comparePairedSamples,
}: any = {}) {
  const warnings = [MULTIPLE_COMPARISONS_WARNING];
  const normalizedTargets = targetEntries(targets, runs);
  const baselineKey = String(settings.baselineTarget ?? normalizedTargets[0]?.key ?? "baseline");
  const candidateKey = String(settings.candidateTarget ?? normalizedTargets[1]?.key ?? "candidate");
  const canonicalOptions = rootOptions(normalizedTargets);
  const normalizedCases = caseEntries(cases, runs);
  const caseReports = [];
  let completePairCount = 0;

  for (const caseDefinition of normalizedCases) {
    const caseName = caseDefinition.name;
    const caseRuns = runs.filter(
      (run) => String(run.caseName ?? "default") === caseName,
    );
    const byPair = new Map();
    for (const run of caseRuns) {
      const pairIndex = run.pairIndex ?? 0;
      const pair = byPair.get(pairIndex) ?? { pairIndex };
      const target = String(run.target);
      if (pair[target]) {
        warnings.push(`Case ${caseName} pair ${pairIndex} repeats target ${target}; the first run was retained.`);
      } else {
        pair[target] = run;
      }
      byPair.set(pairIndex, pair);
    }
    const orderedPairs = [...byPair.values()].sort((left, right) =>
      String(left.pairIndex).localeCompare(String(right.pairIndex), undefined, {
        numeric: true,
      }),
    );
    const completePairs = orderedPairs.filter((pair) => {
      const complete = Boolean(pair[baselineKey] && pair[candidateKey]);
      if (!complete) {
        warnings.push(`Case ${caseName} pair ${pair.pairIndex} is incomplete.`);
      }
      return complete;
    });
    completePairCount += completePairs.length;

    const flattened = completePairs.map((pair) => {
      const flattenTarget = (run, targetKey) => {
        const sourceMaps = sourceMapSymbolicator(run);
        for (const warning of sourceMaps.warnings) {
          warnings.push(
            `Case ${caseName} pair ${pair.pairIndex} target ${targetKey}: ${warning}`,
          );
        }
        return new Map(
          flattenProfileRun(run, { ...canonicalOptions, sourceMaps }).map(
            (metric) => [metric.key, metric],
          ),
        );
      };
      return {
        pair,
        baseline: flattenTarget(pair[baselineKey], baselineKey),
        candidate: flattenTarget(pair[candidateKey], candidateKey),
      };
    });
    const metricKeys = new Set<string>();
    for (const pair of flattened) {
      for (const key of pair.baseline.keys()) metricKeys.add(key);
      for (const key of pair.candidate.keys()) metricKeys.add(key);
    }

    const metrics = [...metricKeys]
      .sort((left, right) => left.localeCompare(right))
      .map((key) => {
        const descriptor =
          flattened.map((pair) => pair.baseline.get(key)).find(Boolean) ??
          flattened.map((pair) => pair.candidate.get(key)).find(Boolean);
        const baselineValues = flattened.map(
          (pair) => pair.baseline.get(key)?.value,
        );
        const candidateValues = flattened.map(
          (pair) => pair.candidate.get(key)?.value,
        );
        const comparison = compareSamples(baselineValues, candidateValues, {
          lowerIsBetter: descriptor?.lowerIsBetter,
          bootstrapIterations: settings.bootstrapIterations,
          seed: hashSeed(`${settings.bootstrapSeed ?? DEFAULT_BOOTSTRAP_SEED}:${caseName}:${key}`),
          zeroTolerance: settings.zeroTolerance,
          minimumPairs: settings.minimumPairs,
        });
        const displayFrames = {};
        for (const [targetKey, side] of [
          [baselineKey, "baseline"],
          [candidateKey, "candidate"],
        ]) {
          const frames = flattened.flatMap(
            (pair) => pair[side].get(key)?.displayFrames ?? [],
          );
          if (frames.length > 0) displayFrames[targetKey] = uniqueFrames(frames);
        }
        return {
          key,
          label: descriptor?.label ?? key,
          source: descriptor?.source ?? null,
          scope: descriptor?.scope ?? null,
          phase: descriptor?.phase ?? null,
          unit: descriptor?.unit ?? "number",
          lowerIsBetter: descriptor?.lowerIsBetter ?? null,
          ...(descriptor?.function ? { function: descriptor.function } : {}),
          ...(Object.keys(displayFrames).length > 0 ? { displayFrames } : {}),
          comparison,
          samples: flattened.map((entry, index) => ({
            pairIndex: entry.pair.pairIndex,
            baseline: finiteNumber(baselineValues[index]),
            candidate: finiteNumber(candidateValues[index]),
            baselineOrderIndex: entry.pair[baselineKey]?.orderIndex ?? null,
            candidateOrderIndex: entry.pair[candidateKey]?.orderIndex ?? null,
          })),
        };
      });
    const classifications = metrics.reduce((counts, metric) => {
      const classification = metric.comparison.classification;
      counts[classification] = (counts[classification] ?? 0) + 1;
      return counts;
    }, {});

    caseReports.push({
      name: caseName,
      configuration: serializableMetadata(caseDefinition),
      runCount: caseRuns.length,
      pairCount: completePairs.length,
      incompletePairCount: orderedPairs.length - completePairs.length,
      pairs: orderedPairs.map((pair) => ({
        pairIndex: pair.pairIndex,
        complete: Boolean(pair[baselineKey] && pair[candidateKey]),
        targets: Object.fromEntries(
          [baselineKey, candidateKey]
            .filter((targetKey) => pair[targetKey])
            .map((targetKey) => {
              const run = pair[targetKey];
              return [
                targetKey,
                {
                  orderIndex: run.orderIndex ?? null,
                  profileDirectory: run.profileDirectory ?? null,
                  runId:
                    run.runtimeResult?.runId ??
                    run.profileSummary?.settings?.runMetadata?.runId ??
                    null,
                  captureStatus: run.profileSummary?.captureStatus ?? null,
                },
              ];
            }),
        ),
      })),
      classifications,
      metrics,
    });
  }

  return {
    schemaVersion: "1.0.0",
    diagnosticOnly: true,
    targets: serializableMetadata(normalizedTargets),
    settings: {
      ...serializableMetadata(settings),
      baselineTarget: baselineKey,
      candidateTarget: candidateKey,
      bootstrapIterations:
        settings.bootstrapIterations ?? DEFAULT_BOOTSTRAP_ITERATIONS,
      bootstrapSeed: settings.bootstrapSeed ?? DEFAULT_BOOTSTRAP_SEED,
      minimumPairs: settings.minimumPairs ?? DEFAULT_MINIMUM_PAIRS,
      statistic: "paired median delta",
      confidenceLevel: 0.95,
      multipleComparisons: {
        exploratory: true,
        adjusted: false,
        method: "none",
        family: "all reported metrics within each case",
      },
    },
    environment: serializableMetadata(environment),
    summary: {
      runCount: runs.length,
      caseCount: caseReports.length,
      completePairCount,
      warningCount: warnings.length,
    },
    cases: caseReports,
    warnings,
  };
}
