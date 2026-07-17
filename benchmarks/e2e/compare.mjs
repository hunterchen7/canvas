import fs from "node:fs/promises";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { STRICT_PARITY_THRESHOLDS } from "./thresholds.mjs";

const sortValue = (value) => {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sortValue(child)]),
    );
  }
  return value;
};

const stableStringify = (value) => JSON.stringify(sortValue(value));

async function compareScreenshots(baselinePath, candidatePath, diffPath, thresholds) {
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fs.readFile(baselinePath),
    fs.readFile(candidatePath),
  ]);
  const baseline = PNG.sync.read(baselineBuffer);
  const candidate = PNG.sync.read(candidateBuffer);

  if (baseline.width !== candidate.width || baseline.height !== candidate.height) {
    return {
      pass: false,
      differentPixels: null,
      totalPixels: baseline.width * baseline.height,
      baselineSize: { width: baseline.width, height: baseline.height },
      candidateSize: { width: candidate.width, height: candidate.height },
      diffPath: null,
      reason: "Screenshot dimensions differ",
    };
  }

  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const differentPixels = pixelmatch(
    baseline.data,
    candidate.data,
    diff.data,
    baseline.width,
    baseline.height,
    {
      threshold: thresholds.pixelmatchThreshold,
      includeAA: true,
      alpha: 1,
      diffColor: [255, 0, 255],
      aaColor: [255, 0, 255],
    },
  );
  await fs.writeFile(diffPath, PNG.sync.write(diff));
  return {
    pass: differentPixels <= thresholds.maxDifferentPixels,
    differentPixels,
    totalPixels: baseline.width * baseline.height,
    ratio: differentPixels / (baseline.width * baseline.height),
    baselineSize: { width: baseline.width, height: baseline.height },
    candidateSize: { width: candidate.width, height: candidate.height },
    diffPath,
  };
}

function compareContracts(baseline, candidate, geometryTolerance) {
  const failures = [];
  const geometryDifferences = [];
  const baselineByName = new Map(baseline.elements.map((entry) => [entry.name, entry]));
  const candidateByName = new Map(candidate.elements.map((entry) => [entry.name, entry]));
  const names = new Set([...baselineByName.keys(), ...candidateByName.keys()]);

  if (stableStringify(baseline.viewport) !== stableStringify(candidate.viewport)) {
    failures.push({ category: "viewport", message: "Viewport contract differs" });
  }

  for (const name of names) {
    const left = baselineByName.get(name);
    const right = candidateByName.get(name);
    if (!left || !right || left.present !== right.present) {
      failures.push({ category: "dom-presence", element: name, message: "Element presence differs" });
      continue;
    }
    if (!left.present) continue;

    if (stableStringify(left.structure) !== stableStringify(right.structure)) {
      failures.push({ category: "dom-identity", element: name, message: "DOM identity differs" });
    }
    if (stableStringify(left.styles) !== stableStringify(right.styles)) {
      failures.push({ category: "computed-style", element: name, message: "Computed styles differ" });
    }

    for (const key of Object.keys(left.geometry)) {
      const difference = Math.abs(left.geometry[key] - right.geometry[key]);
      geometryDifferences.push({ element: name, property: key, difference });
      if (difference > geometryTolerance) {
        failures.push({
          category: "geometry",
          element: name,
          property: key,
          baseline: left.geometry[key],
          candidate: right.geometry[key],
          difference,
          message: `Geometry differs by ${difference}px`,
        });
      }
    }
  }

  if (baseline.svgs.length !== candidate.svgs.length) {
    failures.push({
      category: "svg-count",
      baseline: baseline.svgs.length,
      candidate: candidate.svgs.length,
      message: "SVG count differs",
    });
  }
  const svgCount = Math.min(baseline.svgs.length, candidate.svgs.length);
  for (let index = 0; index < svgCount; index += 1) {
    const left = baseline.svgs[index];
    const right = candidate.svgs[index];
    if (left.key !== right.key || left.outerHTML !== right.outerHTML) {
      failures.push({
        category: "svg-identity",
        element: left.key,
        message: "Serialized SVG differs",
      });
    }
    for (const key of Object.keys(left.geometry)) {
      const difference = Math.abs(left.geometry[key] - right.geometry[key]);
      if (difference > geometryTolerance) {
        failures.push({
          category: "svg-geometry",
          element: left.key,
          property: key,
          baseline: left.geometry[key],
          candidate: right.geometry[key],
          difference,
          message: `SVG geometry differs by ${difference}px`,
        });
      }
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    maxGeometryDifferencePx: Math.max(
      0,
      ...geometryDifferences.map((entry) => entry.difference),
    ),
  };
}

const firstEventTime = (events, types) => {
  const event = events.find((entry) => types.includes(entry.type));
  return event?.time ?? null;
};

function normalizedSamples(performance, anchorTypes) {
  const samples = performance.trajectory.filter(
    (sample) =>
      Number.isFinite(sample.t) &&
      Number.isFinite(sample.x) &&
      Number.isFinite(sample.y) &&
      Number.isFinite(sample.scale),
  );
  if (samples.length === 0) return [];
  const eventAnchor = firstEventTime(performance.events, anchorTypes);
  const anchor = eventAnchor ?? samples[0].t;
  return samples.map((sample) => ({ ...sample, t: sample.t - anchor }));
}

function interpolate(samples, time) {
  if (samples.length === 0 || time < samples[0].t || time > samples.at(-1).t) return null;
  let low = 0;
  let high = samples.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].t <= time) low = middle;
    else high = middle;
  }
  const left = samples[low];
  const right = samples[high];
  if (right.t === left.t) return left;
  const progress = (time - left.t) / (right.t - left.t);
  return {
    t: time,
    x: left.x + (right.x - left.x) * progress,
    y: left.y + (right.y - left.y) * progress,
    scale: left.scale + (right.scale - left.scale) * progress,
    animationStage: progress < 0.5 ? left.animationStage : right.animationStage,
  };
}

const stageTransitions = (samples) => {
  const transitions = {};
  for (const sample of samples) {
    const key = String(sample.animationStage);
    if (!(key in transitions)) transitions[key] = sample.t;
  }
  return transitions;
};

function compareTrajectories(baselinePerformance, candidatePerformance, anchorTypes, thresholds) {
  const baseline = normalizedSamples(baselinePerformance, anchorTypes);
  const candidate = normalizedSamples(candidatePerformance, anchorTypes);
  const failures = [];
  if (baseline.length < 2 || candidate.length < 2) {
    return {
      pass: false,
      failures: [{ category: "trajectory-missing", message: "Insufficient trajectory samples" }],
      comparedSamples: 0,
    };
  }

  const start = Math.max(baseline[0].t, candidate[0].t);
  const end = Math.min(baseline.at(-1).t, candidate.at(-1).t);
  let maxX = 0;
  let maxY = 0;
  let maxScale = 0;
  let comparedSamples = 0;
  for (let time = start; time <= end; time += thresholds.sampleStepMs) {
    const left = interpolate(baseline, time);
    const right = interpolate(candidate, time);
    if (!left || !right) continue;
    comparedSamples += 1;
    maxX = Math.max(maxX, Math.abs(left.x - right.x));
    maxY = Math.max(maxY, Math.abs(left.y - right.y));
    maxScale = Math.max(maxScale, Math.abs(left.scale - right.scale));
  }

  if (maxX > thresholds.maxPositionDifferencePx) {
    failures.push({ category: "trajectory-x", difference: maxX, message: "x trajectory differs" });
  }
  if (maxY > thresholds.maxPositionDifferencePx) {
    failures.push({ category: "trajectory-y", difference: maxY, message: "y trajectory differs" });
  }
  if (maxScale > thresholds.maxScaleDifference) {
    failures.push({
      category: "trajectory-scale",
      difference: maxScale,
      message: "scale trajectory differs",
    });
  }

  const baselineStages = stageTransitions(baseline);
  const candidateStages = stageTransitions(candidate);
  const stageTimingDifferences = {};
  for (const stage of new Set([...Object.keys(baselineStages), ...Object.keys(candidateStages)])) {
    if (!(stage in baselineStages) || !(stage in candidateStages)) {
      failures.push({ category: "animation-stage", stage, message: "Animation stage presence differs" });
      continue;
    }
    const difference = Math.abs(baselineStages[stage] - candidateStages[stage]);
    stageTimingDifferences[stage] = difference;
    if (difference > thresholds.maxStageTimingDifferenceMs) {
      failures.push({
        category: "animation-timing",
        stage,
        difference,
        message: "Animation stage timing differs",
      });
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    comparedSamples,
    commonDurationMs: Math.max(0, end - start),
    maxDifference: { x: maxX, y: maxY, scale: maxScale },
    stageTimingDifferences,
  };
}

function compareInteractionCheckpoints(baseline, candidate, thresholds) {
  const failures = [];
  const numericDifferences = [];
  if (baseline.length !== candidate.length) {
    failures.push({
      category: "interaction-checkpoint-count",
      baseline: baseline.length,
      candidate: candidate.length,
      message: "Scripted interaction checkpoint count differs",
    });
  }
  const count = Math.min(baseline.length, candidate.length);
  for (let index = 0; index < count; index += 1) {
    const left = baseline[index];
    const right = candidate[index];
    if (left.label !== right.label) {
      failures.push({
        category: "interaction-checkpoint-label",
        index,
        baseline: left.label,
        candidate: right.label,
        message: "Scripted input checkpoint labels differ",
      });
      continue;
    }

    for (const field of ["x", "y"]) {
      const difference = Math.abs((left[field] ?? 0) - (right[field] ?? 0));
      numericDifferences.push(difference);
      if (difference > thresholds.maxPositionDifferencePx) {
        failures.push({
          category: "interaction-state",
          checkpoint: left.label,
          property: field,
          baseline: left[field],
          candidate: right[field],
          difference,
          message: `${field} differs after the same scripted input step`,
        });
      }
    }
    const scaleDifference = Math.abs((left.scale ?? 0) - (right.scale ?? 0));
    if (scaleDifference > thresholds.maxScaleDifference) {
      failures.push({
        category: "interaction-state",
        checkpoint: left.label,
        property: "scale",
        baseline: left.scale,
        candidate: right.scale,
        difference: scaleDifference,
        message: "scale differs after the same scripted input step",
      });
    }

    for (const field of ["animationStage", "toolbarText", "toolbarOpacity", "sceneTransform"]) {
      if (left[field] !== right[field]) {
        failures.push({
          category: "interaction-semantic-state",
          checkpoint: left.label,
          property: field,
          baseline: left[field],
          candidate: right[field],
          message: `${field} differs after the same scripted input step`,
        });
      }
    }

    if (Boolean(left.dragImageRect) !== Boolean(right.dragImageRect)) {
      failures.push({
        category: "interaction-drag-image-presence",
        checkpoint: left.label,
        message: "Draggable image presence differs at a scripted input step",
      });
    } else if (
      left.dragImageRect &&
      right.dragImageRect &&
      ["before-input", "settled"].includes(left.label)
    ) {
      for (const field of ["x", "y", "width", "height"]) {
        const difference = Math.abs(left.dragImageRect[field] - right.dragImageRect[field]);
        numericDifferences.push(difference);
        if (difference > thresholds.maxPositionDifferencePx) {
          failures.push({
            category: "interaction-drag-geometry",
            checkpoint: left.label,
            property: field,
            baseline: left.dragImageRect[field],
            candidate: right.dragImageRect[field],
            difference,
            message: `Draggable image ${field} differs after the same input step`,
          });
        }
      }
    }

    if (Boolean(left.dragTranslation) !== Boolean(right.dragTranslation)) {
      failures.push({
        category: "interaction-drag-translation-presence",
        checkpoint: left.label,
        message: "Draggable translation presence differs at a scripted input step",
      });
    } else if (left.dragTranslation && right.dragTranslation) {
      for (const field of ["x", "y"]) {
        const difference = Math.abs(left.dragTranslation[field] - right.dragTranslation[field]);
        numericDifferences.push(difference);
        if (difference > thresholds.maxPositionDifferencePx) {
          failures.push({
            category: "interaction-drag-translation",
            checkpoint: left.label,
            property: field,
            baseline: left.dragTranslation[field],
            candidate: right.dragTranslation[field],
            difference,
            message: `Draggable ${field} translation differs after the same input step`,
          });
        }
      }
    }
  }
  return {
    pass: failures.length === 0,
    failures,
    comparedCheckpoints: count,
    maxNumericDifference: Math.max(0, ...numericDifferences),
  };
}

function compareAnimationSemantics(baseline, candidate, thresholds) {
  const failures = [];
  if (stableStringify(baseline.animationContract) !== stableStringify(candidate.animationContract)) {
    failures.push({
      category: "animation-config",
      baseline: baseline.animationContract,
      candidate: candidate.animationContract,
      message: "Exported transition, spring, or interaction timing configuration differs",
    });
  }

  const samplesFor = (result) =>
    result.performance.browser.trajectory.filter(
      (sample) =>
        Number.isFinite(sample.x) && Number.isFinite(sample.y) && Number.isFinite(sample.scale),
    );
  const leftSamples = samplesFor(baseline);
  const rightSamples = samplesFor(candidate);
  const sequenceFor = (samples) => {
    const sequence = [];
    for (const sample of samples) {
      if (sequence.at(-1) !== sample.animationStage) sequence.push(sample.animationStage);
    }
    return sequence;
  };
  const leftSequence = sequenceFor(leftSamples);
  const rightSequence = sequenceFor(rightSamples);
  if (stableStringify(leftSequence) !== stableStringify(rightSequence)) {
    failures.push({
      category: "animation-stage-order",
      baseline: leftSequence,
      candidate: rightSequence,
      message: "Animation stage order differs",
    });
  }

  if (leftSamples.length === 0 || rightSamples.length === 0) {
    failures.push({ category: "animation-endpoints", message: "Animation endpoint samples are missing" });
  } else {
    for (const [endpoint, left, right] of [
      ["initial", leftSamples[0], rightSamples[0]],
      ["final", leftSamples.at(-1), rightSamples.at(-1)],
    ]) {
      for (const field of ["x", "y"]) {
        const difference = Math.abs(left[field] - right[field]);
        if (difference > thresholds.maxPositionDifferencePx) {
          failures.push({
            category: "animation-endpoint",
            endpoint,
            property: field,
            baseline: left[field],
            candidate: right[field],
            difference,
            message: `Animation ${endpoint} ${field} differs`,
          });
        }
      }
      const scaleDifference = Math.abs(left.scale - right.scale);
      if (scaleDifference > thresholds.maxScaleDifference) {
        failures.push({
          category: "animation-endpoint",
          endpoint,
          property: "scale",
          baseline: left.scale,
          candidate: right.scale,
          difference: scaleDifference,
          message: `Animation ${endpoint} scale differs`,
        });
      }
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    baselineStageOrder: leftSequence,
    candidateStageOrder: rightSequence,
    baselineEndpoints:
      leftSamples.length > 0 ? { initial: leftSamples[0], final: leftSamples.at(-1) } : null,
    candidateEndpoints:
      rightSamples.length > 0 ? { initial: rightSamples[0], final: rightSamples.at(-1) } : null,
  };
}

function comparePerformance(baseline, candidate, thresholds) {
  const measurements = [
    ["p95FrameIntervalMs", baseline.browser.summary.p95FrameIntervalMs, candidate.browser.summary.p95FrameIntervalMs],
    ["p99FrameIntervalMs", baseline.browser.summary.p99FrameIntervalMs, candidate.browser.summary.p99FrameIntervalMs],
    ["longTaskTotalMs", baseline.browser.summary.longTaskTotalMs, candidate.browser.summary.longTaskTotalMs],
    ["loafBlockingTotalMs", baseline.browser.summary.loafBlockingTotalMs, candidate.browser.summary.loafBlockingTotalMs],
    ["TaskDurationMs", baseline.cdp.TaskDurationMs ?? 0, candidate.cdp.TaskDurationMs ?? 0],
    ["ScriptDurationMs", baseline.cdp.ScriptDurationMs ?? 0, candidate.cdp.ScriptDurationMs ?? 0],
    ["LayoutDurationMs", baseline.cdp.LayoutDurationMs ?? 0, candidate.cdp.LayoutDurationMs ?? 0],
    ["RecalcStyleDurationMs", baseline.cdp.RecalcStyleDurationMs ?? 0, candidate.cdp.RecalcStyleDurationMs ?? 0],
  ];
  const results = measurements.map(([metric, left, right]) => {
    const absoluteDifference = right - left;
    const ratio = left > 0 ? right / left : right > 0 ? Number.POSITIVE_INFINITY : 1;
    const regression =
      absoluteDifference > thresholds.minimumAbsoluteRegressionMs && ratio > thresholds.maxRatio;
    return { metric, baseline: left, candidate: right, absoluteDifference, ratio, regression };
  });
  return {
    pass: results.every((entry) => !entry.regression),
    measurements: results,
  };
}

export async function compareScenario({
  name,
  baseline,
  candidate,
  diffDirectory,
  anchorTypes,
  trajectoryMode,
  thresholds = STRICT_PARITY_THRESHOLDS,
}) {
  const diffPath = path.join(diffDirectory, `${name}.png`);
  const [visual, contract] = await Promise.all([
    compareScreenshots(
      baseline.screenshotPath,
      candidate.screenshotPath,
      diffPath,
      thresholds.visual,
    ),
    Promise.resolve(
      compareContracts(
        baseline.contract,
        candidate.contract,
        thresholds.geometry.maxAbsoluteDifferencePx,
      ),
    ),
  ]);
  const interaction = compareInteractionCheckpoints(
    baseline.interactionCheckpoints,
    candidate.interactionCheckpoints,
    thresholds.interaction,
  );
  const animationSemantics = compareAnimationSemantics(
    baseline,
    candidate,
    thresholds.interaction,
  );
  const rawTrajectory =
    trajectoryMode === "animation"
      ? compareTrajectories(
          baseline.performance.browser,
          candidate.performance.browser,
          anchorTypes,
          thresholds.trajectory,
        )
      : {
          pass: true,
          gated: false,
          reason: "Direct input parity is gated by index-aligned post-input checkpoints; raw rAF samples remain in scenario artifacts.",
          baselineSamples: baseline.performance.browser.trajectory.length,
          candidateSamples: candidate.performance.browser.trajectory.length,
        };
  const trajectory =
    trajectoryMode === "animation"
      ? {
          ...rawTrajectory,
          pass: true,
          gated: false,
          advisoryFailures: rawTrajectory.failures ?? [],
          reason:
            "Raw rAF timing is advisory because browser scheduling differs between identical runs; exact config, stage order, endpoints, checkpoints, and settled visuals remain gating.",
        }
      : rawTrajectory;
  const performance = comparePerformance(
    baseline.performance,
    candidate.performance,
    thresholds.performance,
  );

  const parityFailures = [
    ...(visual.pass
      ? []
      : [{ category: "pixel", message: "Full screenshot pixels differ", detail: visual }]),
    ...contract.failures,
    ...interaction.failures,
    ...animationSemantics.failures,
  ].map((failure) => ({ ...failure, deferredDecision: true }));

  return {
    name,
    pass: parityFailures.length === 0,
    performancePass: performance.pass,
    parityFailures,
    visual,
    contract,
    interaction,
    animationSemantics,
    trajectory,
    performance,
  };
}
