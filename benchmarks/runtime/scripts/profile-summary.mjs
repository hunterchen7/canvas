const DEFAULT_LIMIT = 25;

const MAIN_THREAD_EVENT_NAMES = {
  javascript: new Set([
    "FunctionCall",
    "EvaluateScript",
    "EventDispatch",
    "FireAnimationFrame",
    "TimerFire",
    "RunMicrotasks",
  ]),
  style: new Set(["UpdateLayoutTree", "RecalculateStyles"]),
  layout: new Set(["Layout"]),
  prepaint: new Set(["PrePaint"]),
  paint: new Set(["Paint"]),
  gc: new Set(["MinorGC", "MajorGC"]),
};

const RASTER_EVENT_NAMES = new Set(["RasterTask"]);
const COMPOSITOR_EVENT_NAMES = new Set([
  "Commit",
  "CompositeLayers",
  "ActivateLayerTree",
  "DrawFrame",
]);

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value, precision = 4) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function percentile(sorted, quantile) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * quantile) - 1),
  );
  return sorted[index] ?? 0;
}

function summarizeValues(values, divisor = 1) {
  if (values.length === 0) {
    return {
      count: 0,
      total: 0,
      mean: 0,
      min: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      max: 0,
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    total: round(total / divisor),
    mean: round(total / values.length / divisor),
    min: round((sorted[0] ?? 0) / divisor),
    p50: round(percentile(sorted, 0.5) / divisor),
    p95: round(percentile(sorted, 0.95) / divisor),
    p99: round(percentile(sorted, 0.99) / divisor),
    max: round((sorted.at(-1) ?? 0) / divisor),
  };
}

function positiveInteger(value, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizedLimit(options) {
  return positiveInteger(options?.limit, DEFAULT_LIMIT);
}

function normalizeUrl(value) {
  if (typeof value !== "string" || value.length === 0) return "<anonymous>";
  return value.replace(/[?#].*$/u, "") || "<anonymous>";
}

function normalizeCallFrame(callFrame) {
  const lineNumber = finiteNumber(callFrame?.lineNumber);
  const columnNumber = finiteNumber(callFrame?.columnNumber);
  return {
    functionName:
      typeof callFrame?.functionName === "string" && callFrame.functionName
        ? callFrame.functionName
        : "(anonymous)",
    url: normalizeUrl(callFrame?.url),
    lineNumber: lineNumber != null && lineNumber >= 0 ? lineNumber + 1 : null,
    columnNumber:
      columnNumber != null && columnNumber >= 0 ? columnNumber + 1 : null,
  };
}

function frameKey(frame) {
  return [
    frame.functionName,
    frame.url,
    frame.lineNumber ?? "",
    frame.columnNumber ?? "",
  ].join("\u0000");
}

function cpuCategory(node) {
  if (!node) return "unattributed";
  const name = String(node.callFrame?.functionName ?? "").toLowerCase();
  if (name.includes("garbage collector")) return "gc";
  if (name === "(idle)" || name === "idle") return "idle";
  if (name === "(program)" || name === "program") return "program";
  if (name === "(root)" || name === "root") return "unattributed";
  return "javascript";
}

function isJavaScriptFrame(frame) {
  const name = String(frame?.functionName ?? "").toLowerCase();
  return !(
    name === "(root)" ||
    name === "root" ||
    name === "(idle)" ||
    name === "idle" ||
    name === "(program)" ||
    name === "program" ||
    name.includes("garbage collector")
  );
}

function cpuFunctionEntry(aggregate, sampledTimeUs) {
  return {
    functionName: aggregate.frame.functionName,
    url: aggregate.frame.url,
    lineNumber: aggregate.frame.lineNumber,
    columnNumber: aggregate.frame.columnNumber,
    selfTimeMs: round(aggregate.selfTimeUs / 1000),
    inclusiveTimeMs: round(aggregate.inclusiveTimeUs / 1000),
    selfSamples: aggregate.selfSamples,
    inclusiveSamples: aggregate.inclusiveSamples,
    selfPercent: round(
      sampledTimeUs > 0 ? (aggregate.selfTimeUs / sampledTimeUs) * 100 : 0,
    ),
    inclusivePercent: round(
      sampledTimeUs > 0 ? (aggregate.inclusiveTimeUs / sampledTimeUs) * 100 : 0,
    ),
  };
}

/**
 * Summarize a V8 `Profiler.stop` response profile. Time deltas are in
 * microseconds and are attributed to the sampled leaf for self time and each
 * unique grouped frame in its ancestry for inclusive time.
 */
export function summarizeCpuProfile(profile, options = {}) {
  const warnings = [];
  const warningSet = new Set();
  const warn = (message) => {
    if (!warningSet.has(message)) {
      warningSet.add(message);
      warnings.push(message);
    }
  };
  const nodes = Array.isArray(profile?.nodes) ? profile.nodes : [];
  const samples = Array.isArray(profile?.samples) ? profile.samples : [];
  const timeDeltas = Array.isArray(profile?.timeDeltas)
    ? profile.timeDeltas
    : [];
  const nodeById = new Map();
  const parentById = new Map();

  if (!Array.isArray(profile?.nodes)) warn("CPU profile has no nodes array.");
  if (!Array.isArray(profile?.samples)) warn("CPU profile has no samples array.");
  if (!Array.isArray(profile?.timeDeltas)) {
    warn("CPU profile has no timeDeltas array.");
  }
  if (samples.length !== timeDeltas.length) {
    warn(
      `CPU profile sample/timeDelta length mismatch (${samples.length}/${timeDeltas.length}).`,
    );
  }

  for (const node of nodes) {
    if (!node || node.id == null) {
      warn("CPU profile contains a node without an id.");
      continue;
    }
    if (nodeById.has(node.id)) warn(`CPU profile repeats node id ${node.id}.`);
    nodeById.set(node.id, node);
    if (node.parent != null) parentById.set(node.id, node.parent);
  }

  for (const node of nodes) {
    if (!node || node.id == null || !Array.isArray(node.children)) continue;
    for (const childId of node.children) {
      if (!parentById.has(childId)) parentById.set(childId, node.id);
    }
  }

  const aggregates = new Map();
  const aggregateFor = (node) => {
    const frame = normalizeCallFrame(node?.callFrame);
    const key = frameKey(frame);
    let aggregate = aggregates.get(key);
    if (!aggregate) {
      aggregate = {
        key,
        frame,
        selfTimeUs: 0,
        inclusiveTimeUs: 0,
        selfSamples: 0,
        inclusiveSamples: 0,
      };
      aggregates.set(key, aggregate);
    }
    return aggregate;
  };
  const breakdownUs = {
    javascript: 0,
    gc: 0,
    idle: 0,
    program: 0,
    unattributed: 0,
  };
  const positiveDeltas = [];
  let sampledTimeUs = 0;
  let ignoredNegativeDeltaCount = 0;
  let unknownNodeSampleCount = 0;
  const processedLength = Math.min(samples.length, timeDeltas.length);

  for (let index = 0; index < processedLength; index += 1) {
    const delta = finiteNumber(timeDeltas[index]);
    if (delta == null) {
      warn("CPU profile contains a non-finite time delta.");
      continue;
    }
    if (delta < 0) {
      ignoredNegativeDeltaCount += 1;
      continue;
    }
    if (delta === 0) continue;

    positiveDeltas.push(delta);
    sampledTimeUs += delta;
    const node = nodeById.get(samples[index]);
    const category = cpuCategory(node);
    breakdownUs[category] += delta;
    if (!node) {
      unknownNodeSampleCount += 1;
      continue;
    }

    const leafAggregate = aggregateFor(node);
    leafAggregate.selfTimeUs += delta;
    leafAggregate.selfSamples += 1;

    const visitedNodeIds = new Set();
    const visitedFrameKeys = new Set();
    let current = node;
    while (current) {
      if (visitedNodeIds.has(current.id)) {
        warn(`CPU profile contains an ancestry cycle at node ${current.id}.`);
        break;
      }
      visitedNodeIds.add(current.id);
      const aggregate = aggregateFor(current);
      if (!visitedFrameKeys.has(aggregate.key)) {
        visitedFrameKeys.add(aggregate.key);
        aggregate.inclusiveTimeUs += delta;
        aggregate.inclusiveSamples += 1;
      }
      const parentId = parentById.get(current.id);
      current = parentId == null ? null : nodeById.get(parentId);
      if (parentId != null && !current) {
        warn(`CPU profile references missing parent node ${parentId}.`);
      }
    }
  }

  if (ignoredNegativeDeltaCount > 0) {
    warn(
      `Ignored ${ignoredNegativeDeltaCount} negative CPU profile time delta${ignoredNegativeDeltaCount === 1 ? "" : "s"}.`,
    );
  }
  if (unknownNodeSampleCount > 0) {
    warn(
      `${unknownNodeSampleCount} CPU sample${unknownNodeSampleCount === 1 ? "" : "s"} referenced unknown nodes.`,
    );
  }

  const profileStartUs = finiteNumber(profile?.startTime);
  const profileEndUs = finiteNumber(profile?.endTime);
  const durationUs =
    profileStartUs != null &&
    profileEndUs != null &&
    profileEndUs >= profileStartUs
      ? profileEndUs - profileStartUs
      : sampledTimeUs;
  const limit = normalizedLimit(options);
  const functionEntries = [...aggregates.values()]
    .filter((aggregate) => isJavaScriptFrame(aggregate.frame))
    .map((aggregate) => cpuFunctionEntry(aggregate, sampledTimeUs));
  const bySelf = [...functionEntries]
    .sort(
      (left, right) =>
        right.selfTimeMs - left.selfTimeMs ||
        right.inclusiveTimeMs - left.inclusiveTimeMs ||
        left.functionName.localeCompare(right.functionName),
    )
    .slice(0, limit);
  const byInclusive = [...functionEntries]
    .sort(
      (left, right) =>
        right.inclusiveTimeMs - left.inclusiveTimeMs ||
        right.selfTimeMs - left.selfTimeMs ||
        left.functionName.localeCompare(right.functionName),
    )
    .slice(0, limit);

  return {
    schemaVersion: 1,
    durationMs: round(durationUs / 1000),
    sampledTimeMs: round(sampledTimeUs / 1000),
    sampleCount: positiveDeltas.length,
    nodeCount: nodeById.size,
    sampleIntervalUs: summarizeValues(positiveDeltas),
    timeBreakdownMs: Object.fromEntries(
      Object.entries(breakdownUs).map(([key, value]) => [
        key,
        round(value / 1000),
      ]),
    ),
    topSelfTime: bySelf,
    topInclusiveTime: byInclusive,
    warnings,
  };
}

function heapSiteEntry(aggregate, totalSampledBytes) {
  return {
    functionName: aggregate.frame.functionName,
    url: aggregate.frame.url,
    lineNumber: aggregate.frame.lineNumber,
    columnNumber: aggregate.frame.columnNumber,
    sampledBytes: round(aggregate.sampledBytes, 0),
    sampledPercent: round(
      totalSampledBytes > 0
        ? (aggregate.sampledBytes / totalSampledBytes) * 100
        : 0,
    ),
    sampleCount: aggregate.sampleCount,
  };
}

/** Summarize a CDP sampling heap profile without retaining its allocation tree. */
export function summarizeHeapProfile(profile, options = {}) {
  const warnings = [];
  const warningSet = new Set();
  const warn = (message) => {
    if (!warningSet.has(message)) {
      warningSet.add(message);
      warnings.push(message);
    }
  };
  const head = profile?.head;
  const samples = Array.isArray(profile?.samples) ? profile.samples : [];
  const nodesById = new Map();
  const aggregates = new Map();
  let nodeCount = 0;
  let treeSampledBytes = 0;

  const aggregateForFrame = (callFrame) => {
    const frame = normalizeCallFrame(callFrame);
    const key = frameKey(frame);
    let aggregate = aggregates.get(key);
    if (!aggregate) {
      aggregate = { frame, sampledBytes: 0, sampleCount: 0 };
      aggregates.set(key, aggregate);
    }
    return aggregate;
  };

  if (!head || typeof head !== "object") {
    warn("Heap profile has no allocation tree head.");
  } else {
    const stack = [head];
    const visitedIds = new Set();
    const visitedObjects = new Set();
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (visitedObjects.has(node)) {
        warn("Heap profile contains an allocation-tree object cycle.");
        continue;
      }
      visitedObjects.add(node);
      if (node.id != null) {
        if (visitedIds.has(node.id)) {
          warn(`Heap profile repeats node id ${node.id}.`);
          continue;
        }
        visitedIds.add(node.id);
        nodesById.set(node.id, node);
      }
      nodeCount += 1;
      const selfSize = finiteNumber(node.selfSize);
      if (selfSize != null && selfSize > 0) {
        treeSampledBytes += selfSize;
        aggregateForFrame(node.callFrame).sampledBytes += selfSize;
      } else if (selfSize != null && selfSize < 0) {
        warn("Heap profile contains a negative sampled size.");
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) stack.push(child);
      }
    }
  }

  let sampleEntryBytes = 0;
  let unknownNodeSampleCount = 0;
  const sampleBytesByFrame = new Map();
  const sampleCountByFrame = new Map();
  const callFrameByKey = new Map();
  for (const sample of samples) {
    const size = finiteNumber(sample?.size);
    if (size != null && size > 0) sampleEntryBytes += size;
    const node = nodesById.get(sample?.nodeId);
    if (!node) {
      unknownNodeSampleCount += 1;
      continue;
    }
    const frame = normalizeCallFrame(node.callFrame);
    const key = frameKey(frame);
    callFrameByKey.set(key, node.callFrame);
    sampleCountByFrame.set(key, (sampleCountByFrame.get(key) ?? 0) + 1);
    if (size != null && size > 0) {
      sampleBytesByFrame.set(key, (sampleBytesByFrame.get(key) ?? 0) + size);
    }
  }
  if (unknownNodeSampleCount > 0) {
    warn(
      `${unknownNodeSampleCount} heap sample${unknownNodeSampleCount === 1 ? "" : "s"} referenced unknown nodes.`,
    );
  }

  const useSampleEntries = treeSampledBytes === 0 && sampleEntryBytes > 0;
  if (useSampleEntries) {
    for (const [key, sampledBytes] of sampleBytesByFrame) {
      const callFrame = callFrameByKey.get(key);
      if (callFrame) aggregateForFrame(callFrame).sampledBytes += sampledBytes;
    }
  }
  for (const [key, sampleCount] of sampleCountByFrame) {
    const aggregate = aggregates.get(key);
    if (aggregate) aggregate.sampleCount = sampleCount;
  }

  const totalSampledBytes = useSampleEntries
    ? sampleEntryBytes
    : treeSampledBytes;
  const limit = normalizedLimit(options);
  const topAllocationSites = [...aggregates.values()]
    .filter((aggregate) => aggregate.frame.functionName !== "(root)")
    .map((aggregate) => heapSiteEntry(aggregate, totalSampledBytes))
    .sort(
      (left, right) =>
        right.sampledBytes - left.sampledBytes ||
        left.functionName.localeCompare(right.functionName),
    )
    .slice(0, limit);

  return {
    schemaVersion: 1,
    nodeCount,
    sampleEntryCount: samples.length,
    totalSampledBytes: round(totalSampledBytes, 0),
    sampleEntryBytes: round(sampleEntryBytes, 0),
    byteSource: useSampleEntries ? "samples" : "allocation-tree",
    topAllocationSites,
    warnings,
  };
}

function threadKey(pid, tid) {
  return `${String(pid)}:${String(tid)}`;
}

function asyncId(event) {
  if (event?.id2 && typeof event.id2 === "object") {
    if (event.id2.global != null) return `global:${String(event.id2.global)}`;
    if (event.id2.local != null) {
      return `local:${String(event.pid)}:${String(event.id2.local)}`;
    }
  }
  if (event?.id != null) {
    return `id:${String(event.pid)}:${String(event.scope ?? event.s ?? "")}:${String(event.id)}`;
  }
  return `implicit:${threadKey(event?.pid, event?.tid)}`;
}

function materializeTraceIntervals(events, warn) {
  const intervals = [];
  const synchronousStacks = new Map();
  const asyncBegins = new Map();
  let invalidIntervalCount = 0;
  let unmatchedEndCount = 0;

  const addInterval = (startEvent, endUs, phase) => {
    const startUs = finiteNumber(startEvent?.ts);
    if (startUs == null || endUs < startUs) {
      invalidIntervalCount += 1;
      return;
    }
    intervals.push({
      name:
        typeof startEvent.name === "string" && startEvent.name
          ? startEvent.name
          : "(unnamed)",
      category: String(startEvent.cat ?? ""),
      pid: startEvent.pid,
      tid: startEvent.tid,
      startUs,
      endUs,
      durationUs: endUs - startUs,
      phase,
    });
  };

  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const timestamp = finiteNumber(event.ts);
    if (event.ph === "X") {
      const duration = finiteNumber(event.dur);
      if (timestamp == null || duration == null || duration < 0) {
        invalidIntervalCount += 1;
        continue;
      }
      addInterval(event, timestamp + duration, "X");
      continue;
    }

    if (event.ph === "B") {
      if (timestamp == null) {
        invalidIntervalCount += 1;
        continue;
      }
      const key = threadKey(event.pid, event.tid);
      const stack = synchronousStacks.get(key) ?? [];
      stack.push(event);
      synchronousStacks.set(key, stack);
      continue;
    }

    if (event.ph === "E") {
      const key = threadKey(event.pid, event.tid);
      const stack = synchronousStacks.get(key);
      if (timestamp == null || !stack || stack.length === 0) {
        unmatchedEndCount += 1;
        continue;
      }
      let beginIndex = stack.length - 1;
      if (typeof event.name === "string" && event.name) {
        const matchingIndex = stack.findLastIndex(
          (candidate) => candidate.name === event.name,
        );
        if (matchingIndex >= 0) beginIndex = matchingIndex;
      }
      const [begin] = stack.splice(beginIndex, 1);
      addInterval(begin, timestamp, "B/E");
      continue;
    }

    if (event.ph === "b") {
      if (timestamp == null) {
        invalidIntervalCount += 1;
        continue;
      }
      const key = `${String(event.cat ?? "")}\u0000${String(event.name ?? "")}\u0000${asyncId(event)}`;
      const begins = asyncBegins.get(key) ?? [];
      begins.push(event);
      asyncBegins.set(key, begins);
      continue;
    }

    if (event.ph === "e") {
      const key = `${String(event.cat ?? "")}\u0000${String(event.name ?? "")}\u0000${asyncId(event)}`;
      const begins = asyncBegins.get(key);
      if (timestamp == null || !begins || begins.length === 0) {
        unmatchedEndCount += 1;
        continue;
      }
      const begin = begins.pop();
      addInterval(begin, timestamp, "b/e");
    }
  }

  const unmatchedBeginCount =
    [...synchronousStacks.values()].reduce(
      (sum, stack) => sum + stack.length,
      0,
    ) +
    [...asyncBegins.values()].reduce(
      (sum, begins) => sum + begins.length,
      0,
    );
  if (invalidIntervalCount > 0) {
    warn(`Ignored ${invalidIntervalCount} invalid trace intervals.`);
  }
  if (unmatchedBeginCount > 0 || unmatchedEndCount > 0) {
    warn(
      `Trace contains ${unmatchedBeginCount} unmatched begin and ${unmatchedEndCount} unmatched end events.`,
    );
  }
  return intervals;
}

function mergeIntervals(intervals) {
  const sorted = intervals
    .filter(
      (interval) =>
        Number.isFinite(interval.startUs) &&
        Number.isFinite(interval.endUs) &&
        interval.endUs > interval.startUs,
    )
    .sort(
      (left, right) => left.startUs - right.startUs || left.endUs - right.endUs,
    );
  const merged = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.startUs > previous.endUs) {
      merged.push({ startUs: interval.startUs, endUs: interval.endUs });
    } else {
      previous.endUs = Math.max(previous.endUs, interval.endUs);
    }
  }
  return merged;
}

function unionDurationUs(intervals) {
  return mergeIntervals(intervals).reduce(
    (sum, interval) => sum + interval.endUs - interval.startUs,
    0,
  );
}

function summarizeIntervals(intervals) {
  const durations = intervals.map((interval) => Math.max(0, interval.durationUs));
  const distribution = summarizeValues(durations, 1000);
  return {
    eventCount: intervals.length,
    totalEventTimeMs: distribution.total,
    activeTimeMs: round(unionDurationUs(intervals) / 1000),
    meanEventMs: distribution.mean,
    p50EventMs: distribution.p50,
    p95EventMs: distribution.p95,
    p99EventMs: distribution.p99,
    maxEventMs: distribution.max,
  };
}

function summarizeTasks(intervals) {
  const summary = summarizeIntervals(intervals);
  const longTasks = intervals.filter((interval) => interval.durationUs > 50_000);
  return {
    ...summary,
    countOver50Ms: longTasks.length,
    blockingTimeOver50Ms: round(
      longTasks.reduce(
        (sum, interval) => sum + interval.durationUs - 50_000,
        0,
      ) / 1000,
    ),
  };
}

function clipIntervalsToWindows(intervals, windows) {
  const mergedWindows = mergeIntervals(windows);
  const clipped = [];
  for (const interval of intervals) {
    for (const window of mergedWindows) {
      if (window.endUs <= interval.startUs) continue;
      if (window.startUs >= interval.endUs) break;
      const startUs = Math.max(interval.startUs, window.startUs);
      const endUs = Math.min(interval.endUs, window.endUs);
      if (endUs <= startUs) continue;
      clipped.push({
        ...interval,
        startUs,
        endUs,
        durationUs: endUs - startUs,
      });
    }
  }
  return clipped;
}

function summarizeCrossThreadIntervals(intervals) {
  const byThread = new Map();
  for (const interval of intervals) {
    const key = threadKey(interval.pid, interval.tid);
    const values = byThread.get(key) ?? [];
    values.push(interval);
    byThread.set(key, values);
  }
  const base = summarizeIntervals(intervals);
  return {
    ...base,
    threadCount: byThread.size,
    threadActiveTimeMs: round(
      [...byThread.values()].reduce(
        (sum, threadIntervals) => sum + unionDurationUs(threadIntervals),
        0,
      ) / 1000,
    ),
    wallTimeMs: round(unionDurationUs(intervals) / 1000),
  };
}

function selectMainThread(events, intervals, threadNames, warn) {
  const intervalByThread = new Map();
  for (const interval of intervals) {
    const key = threadKey(interval.pid, interval.tid);
    const values = intervalByThread.get(key) ?? [];
    values.push(interval);
    intervalByThread.set(key, values);
  }

  const rendererCandidates = [...threadNames.entries()].filter(
    ([, name]) => name === "CrRendererMain",
  );
  let selection = "metadata";
  let candidateKeys = rendererCandidates.map(([key]) => key);
  if (candidateKeys.length === 0) {
    selection = "timeline-duration";
    candidateKeys = [...intervalByThread.keys()];
  }
  if (candidateKeys.length === 0) {
    warn("Could not identify a renderer main thread in the trace.");
    return null;
  }

  const score = (key, timelineOnly) => {
    const values = intervalByThread.get(key) ?? [];
    const selected = timelineOnly
      ? values.filter((interval) =>
          interval.category
            .split(",")
            .some((category) => category.includes("devtools.timeline")),
        )
      : values;
    return unionDurationUs(selected);
  };
  let ranked = candidateKeys
    .map((key) => ({ key, score: score(key, true) }))
    .sort((left, right) => right.score - left.score);
  if ((ranked[0]?.score ?? 0) === 0) {
    if (selection !== "metadata") selection = "event-duration";
    ranked = candidateKeys
      .map((key) => ({ key, score: score(key, false) }))
      .sort((left, right) => right.score - left.score);
  }
  const selectedKey = ranked[0]?.key;
  if (!selectedKey) {
    warn("Could not identify a renderer main thread in the trace.");
    return null;
  }
  const representative =
    intervals.find(
      (interval) => threadKey(interval.pid, interval.tid) === selectedKey,
    ) ??
    events.find((event) => threadKey(event?.pid, event?.tid) === selectedKey);
  return {
    key: selectedKey,
    pid: representative?.pid ?? null,
    tid: representative?.tid ?? null,
    name: threadNames.get(selectedKey) ?? null,
    selection,
  };
}

function extractPhaseIntervals(events, intervals, mainThreadKey) {
  const byPhase = new Map();
  const measuresByPhase = new Map();
  for (const interval of intervals) {
    if (
      mainThreadKey &&
      threadKey(interval.pid, interval.tid) !== mainThreadKey
    ) {
      continue;
    }
    const match = /^canvas:phase:([^:]+)$/u.exec(interval.name);
    if (!match) continue;
    const phaseName = match[1];
    const values = measuresByPhase.get(phaseName) ?? [];
    values.push(interval);
    measuresByPhase.set(phaseName, values);
  }

  const marksByPhase = new Map();
  for (const event of events) {
    if (
      !["I", "i", "R"].includes(event?.ph) ||
      finiteNumber(event.ts) == null ||
      (mainThreadKey && threadKey(event.pid, event.tid) !== mainThreadKey)
    ) {
      continue;
    }
    const match = /^canvas:phase:([^:]+):(start|end)$/u.exec(
      String(event.name ?? ""),
    );
    if (!match) continue;
    const [, phaseName, boundary] = match;
    const boundaries = marksByPhase.get(phaseName) ?? { starts: [], ends: [] };
    boundaries[boundary === "start" ? "starts" : "ends"].push(event.ts);
    marksByPhase.set(phaseName, boundaries);
  }

  for (const [phaseName, measuredIntervals] of measuresByPhase) {
    byPhase.set(phaseName, measuredIntervals);
  }
  for (const [phaseName, boundaries] of marksByPhase) {
    if (byPhase.has(phaseName)) continue;
    const starts = boundaries.starts.sort((left, right) => left - right);
    const ends = boundaries.ends.sort((left, right) => left - right);
    const phaseIntervals = [];
    let endIndex = 0;
    for (const startUs of starts) {
      while (endIndex < ends.length && ends[endIndex] < startUs) endIndex += 1;
      if (endIndex >= ends.length) break;
      const endUs = ends[endIndex];
      endIndex += 1;
      phaseIntervals.push({
        name: `canvas:phase:${phaseName}`,
        category: "blink.user_timing",
        startUs,
        endUs,
        durationUs: endUs - startUs,
      });
    }
    if (phaseIntervals.length > 0) byPhase.set(phaseName, phaseIntervals);
  }

  const summaries = {};
  const sortedEntries = [...byPhase.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  for (const [phaseName, phaseIntervals] of sortedEntries) {
    const durations = phaseIntervals.map((interval) => interval.durationUs);
    const distribution = summarizeValues(durations, 1000);
    let firstStartUs = null;
    let lastEndUs = null;
    for (const interval of phaseIntervals) {
      firstStartUs =
        firstStartUs == null
          ? interval.startUs
          : Math.min(firstStartUs, interval.startUs);
      lastEndUs =
        lastEndUs == null
          ? interval.endUs
          : Math.max(lastEndUs, interval.endUs);
    }
    summaries[phaseName] = {
      count: phaseIntervals.length,
      totalMs: distribution.total,
      meanMs: distribution.mean,
      p50Ms: distribution.p50,
      p95Ms: distribution.p95,
      maxMs: distribution.max,
      firstStartUs,
      lastEndUs,
    };
  }
  return { intervalsByPhase: new Map(sortedEntries), summaries };
}

function correlatePhaseActivity(
  phaseData,
  mainThreadIntervals,
  rasterIntervals,
  compositorIntervals,
) {
  const phases = {};
  for (const [phaseName, phaseWindows] of phaseData.intervalsByPhase) {
    const clipped = clipIntervalsToWindows(mainThreadIntervals, phaseWindows);
    phases[phaseName] = {
      ...phaseData.summaries[phaseName],
      tasks: summarizeTasks(
        clipped.filter((interval) => interval.name === "RunTask"),
      ),
      mainThreadActivity: Object.fromEntries(
        Object.entries(MAIN_THREAD_EVENT_NAMES).map(([name, eventNames]) => [
          name,
          summarizeIntervals(
            clipped.filter((interval) => eventNames.has(interval.name)),
          ),
        ]),
      ),
      crossThreadActivity: {
        raster: summarizeCrossThreadIntervals(
          clipIntervalsToWindows(rasterIntervals, phaseWindows),
        ),
        compositor: summarizeCrossThreadIntervals(
          clipIntervalsToWindows(compositorIntervals, phaseWindows),
        ),
      },
    };
  }
  return phases;
}

function isReactEventName(name) {
  return (
    /react/iu.test(name) ||
    /^--(?:render|commit|layout-effects|passive-effects)-/u.test(name)
  );
}

function summarizeReactTraceEvents(events, intervals, limit) {
  const matchingRawEvents = events.filter((event) =>
    isReactEventName(String(event?.name ?? "")),
  );
  const matchingIntervals = intervals.filter((interval) =>
    isReactEventName(interval.name),
  );
  const names = new Map();
  for (const event of matchingRawEvents) {
    const name = String(event.name);
    const aggregate = names.get(name) ?? { name, eventCount: 0, totalTimeUs: 0 };
    aggregate.eventCount += 1;
    names.set(name, aggregate);
  }
  for (const interval of matchingIntervals) {
    const aggregate = names.get(interval.name) ?? {
      name: interval.name,
      eventCount: 0,
      totalTimeUs: 0,
    };
    aggregate.totalTimeUs += interval.durationUs;
    names.set(interval.name, aggregate);
  }
  return {
    detected: matchingRawEvents.length > 0,
    rawEventCount: matchingRawEvents.length,
    intervalCount: matchingIntervals.length,
    names: [...names.values()]
      .sort(
        (left, right) =>
          right.totalTimeUs - left.totalTimeUs ||
          right.eventCount - left.eventCount ||
          left.name.localeCompare(right.name),
      )
      .slice(0, limit)
      .map((aggregate) => ({
        name: aggregate.name,
        eventCount: aggregate.eventCount,
        totalTimeMs: round(aggregate.totalTimeUs / 1000),
      })),
  };
}

function summarizeTopTraceEvents(intervals, limit) {
  const groups = new Map();
  for (const interval of intervals) {
    const key = `${interval.category}\u0000${interval.name}`;
    let group = groups.get(key);
    if (!group) {
      group = { name: interval.name, category: interval.category, intervals: [] };
      groups.set(key, group);
    }
    group.intervals.push(interval);
  }
  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      category: group.category,
      ...summarizeCrossThreadIntervals(group.intervals),
    }))
    .sort(
      (left, right) =>
        right.threadActiveTimeMs - left.threadActiveTimeMs ||
        right.totalEventTimeMs - left.totalEventTimeMs ||
        left.name.localeCompare(right.name),
    )
    .slice(0, limit);
}

/**
 * Summarize Chrome trace-event JSON. Accepts either the root trace object or a
 * bare trace-event array. Durations are reported in milliseconds; original
 * trace timestamps retained for phase bounds remain in microseconds.
 */
export function summarizeTrace(trace, options = {}) {
  const warnings = [];
  const warningSet = new Set();
  const warn = (message) => {
    if (!warningSet.has(message)) {
      warningSet.add(message);
      warnings.push(message);
    }
  };
  const events = Array.isArray(trace)
    ? trace
    : Array.isArray(trace?.traceEvents)
      ? trace.traceEvents
      : [];
  if (!Array.isArray(trace) && !Array.isArray(trace?.traceEvents)) {
    warn("Trace has no traceEvents array.");
  }
  const malformedEventCount = events.filter(
    (event) => !event || typeof event !== "object",
  ).length;
  if (malformedEventCount > 0) {
    warn(`Trace contains ${malformedEventCount} malformed events.`);
  }

  const threadNames = new Map();
  for (const event of events) {
    if (
      event?.ph === "M" &&
      event.name === "thread_name" &&
      typeof event.args?.name === "string"
    ) {
      threadNames.set(threadKey(event.pid, event.tid), event.args.name);
    }
  }

  const intervals = materializeTraceIntervals(events, warn);
  const mainThread = selectMainThread(events, intervals, threadNames, warn);
  const mainThreadIntervals = mainThread
    ? intervals.filter(
        (interval) =>
          threadKey(interval.pid, interval.tid) === mainThread.key,
      )
    : [];
  const tasks = mainThreadIntervals.filter(
    (interval) => interval.name === "RunTask",
  );
  const tasksWithLongTaskData = summarizeTasks(tasks);

  const mainThreadActivity = Object.fromEntries(
    Object.entries(MAIN_THREAD_EVENT_NAMES).map(([name, eventNames]) => [
      name,
      summarizeIntervals(
        mainThreadIntervals.filter((interval) => eventNames.has(interval.name)),
      ),
    ]),
  );
  const rasterIntervals = intervals.filter((interval) =>
    RASTER_EVENT_NAMES.has(interval.name),
  );
  const compositorIntervals = intervals.filter((interval) =>
    COMPOSITOR_EVENT_NAMES.has(interval.name),
  );
  let traceStartUs = null;
  let traceEndUs = null;
  for (const event of events) {
    if (event?.ph === "M") continue;
    const timestamp = finiteNumber(event?.ts);
    if (timestamp == null) continue;
    traceStartUs =
      traceStartUs == null ? timestamp : Math.min(traceStartUs, timestamp);
    traceEndUs =
      traceEndUs == null ? timestamp : Math.max(traceEndUs, timestamp);
  }
  for (const interval of intervals) {
    traceStartUs =
      traceStartUs == null
        ? interval.startUs
        : Math.min(traceStartUs, interval.startUs);
    traceEndUs =
      traceEndUs == null ? interval.endUs : Math.max(traceEndUs, interval.endUs);
  }
  const limit = normalizedLimit(options);
  const phaseData = extractPhaseIntervals(
    events,
    intervals,
    mainThread?.key ?? null,
  );

  return {
    schemaVersion: 1,
    eventCount: events.length,
    intervalCount: intervals.length,
    traceStartUs,
    traceEndUs,
    durationMs:
      traceStartUs != null && traceEndUs != null
        ? round((traceEndUs - traceStartUs) / 1000)
        : 0,
    mainThread: mainThread
      ? {
          pid: mainThread.pid,
          tid: mainThread.tid,
          name: mainThread.name,
          selection: mainThread.selection,
          activeTimeMs: round(unionDurationUs(mainThreadIntervals) / 1000),
        }
      : null,
    tasks: tasksWithLongTaskData,
    mainThreadActivity,
    crossThreadActivity: {
      raster: summarizeCrossThreadIntervals(rasterIntervals),
      compositor: summarizeCrossThreadIntervals(compositorIntervals),
    },
    phases: correlatePhaseActivity(
      phaseData,
      mainThreadIntervals,
      rasterIntervals,
      compositorIntervals,
    ),
    react: summarizeReactTraceEvents(events, intervals, limit),
    topEvents: summarizeTopTraceEvents(intervals, limit),
    warnings,
  };
}
