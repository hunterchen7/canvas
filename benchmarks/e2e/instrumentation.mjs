/**
 * This function is stringified and installed with BrowserContext.addInitScript.
 * Keep it dependency-free and self-contained.
 */
export function installBrowserInstrumentation() {
  const nativeSetInterval = globalThis.setInterval.bind(globalThis);
  const nativeClearInterval = globalThis.clearInterval.bind(globalThis);
  const trackedIntervals = new Set();
  globalThis.setInterval = (...arguments_) => {
    const id = nativeSetInterval(...arguments_);
    trackedIntervals.add(id);
    return id;
  };
  globalThis.clearInterval = (id) => {
    trackedIntervals.delete(id);
    return nativeClearInterval(id);
  };

  const state = {
    baseTime: performance.now(),
    lastFrame: null,
    draggableImageRectCalls: 0,
    frameIntervals: [],
    trajectory: [],
    longTasks: [],
    longAnimationFrames: [],
    events: [],
    workMetrics: {},
    probes: {},
  };

  const nativeGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (...arguments_) {
    if (
      this instanceof HTMLImageElement &&
      this.alt === "Benchmark draggable shape"
    ) {
      state.draggableImageRectCalls += 1;
    }
    return nativeGetBoundingClientRect.apply(this, arguments_);
  };

  const relativeTime = (absoluteTime) => absoluteTime - state.baseTime;
  const finite = (value) => (Number.isFinite(value) ? value : null);

  const serializeScript = (script) => ({
    startTime: finite(relativeTime(script.startTime)),
    duration: finite(script.duration),
    forcedStyleAndLayoutDuration: finite(script.forcedStyleAndLayoutDuration),
    invoker: script.invoker ?? "",
    invokerType: script.invokerType ?? "",
    sourceURL: script.sourceURL ?? "",
    sourceFunctionName: script.sourceFunctionName ?? "",
    sourceCharPosition: finite(script.sourceCharPosition),
  });

  const installObserver = (type, callback) => {
    try {
      const observer = new PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe({ type, buffered: true });
      return observer;
    } catch {
      return null;
    }
  };

  installObserver("longtask", (entries) => {
    for (const entry of entries) {
      if (entry.startTime < state.baseTime) continue;
      state.longTasks.push({
        startTime: relativeTime(entry.startTime),
        duration: entry.duration,
        name: entry.name,
      });
    }
  });

  installObserver("long-animation-frame", (entries) => {
    for (const entry of entries) {
      if (entry.startTime < state.baseTime) continue;
      state.longAnimationFrames.push({
        startTime: relativeTime(entry.startTime),
        duration: entry.duration,
        blockingDuration: entry.blockingDuration ?? 0,
        renderStart: finite(relativeTime(entry.renderStart)),
        styleAndLayoutStart: finite(relativeTime(entry.styleAndLayoutStart)),
        firstUIEventTimestamp: finite(relativeTime(entry.firstUIEventTimestamp)),
        scripts: Array.from(entry.scripts ?? [], serializeScript),
      });
    }
  });

  const eventTypes = [
    "pointerdown",
    "pointerup",
    "pointercancel",
    "click",
    "wheel",
  ];
  const recordEvent = (event) => {
    if (state.events.length >= 2_000) return;
    state.events.push({
      type: event.type,
      time: relativeTime(performance.now()),
      x: finite(event.clientX),
      y: finite(event.clientY),
      deltaX: finite(event.deltaX),
      deltaY: finite(event.deltaY),
      ctrlKey: Boolean(event.ctrlKey),
      target:
        event.target instanceof Element
          ? event.target.getAttribute("aria-label") ||
            event.target.getAttribute("data-testid") ||
            event.target.tagName.toLowerCase()
          : "",
    });
  };
  for (const type of eventTypes) {
    addEventListener(type, recordEvent, { capture: true, passive: true });
  }

  const frame = (now) => {
    if (state.lastFrame !== null) {
      state.frameIntervals.push(now - state.lastFrame);
    }
    state.lastFrame = now;

    const harness = window.__CANVAS_HARNESS__;
    if (harness?.ready && state.trajectory.length < 4_000) {
      try {
        state.trajectory.push({
          t: relativeTime(now),
          ...harness.read(),
        });
      } catch {
        // A transient unmount during navigation should not stop frame collection.
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const quantile = (values, q) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * q));
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };

  const summarize = () => {
    const intervals = state.frameIntervals.filter((value) => value > 0 && value < 1_000);
    const nominalFrame = 1_000 / 60;
    const droppedFrames = intervals.reduce(
      (sum, interval) => sum + Math.max(0, Math.round(interval / nominalFrame) - 1),
      0,
    );
    return {
      sampleCount: intervals.length,
      durationMs: intervals.reduce((sum, value) => sum + value, 0),
      meanFrameIntervalMs:
        intervals.length === 0
          ? 0
          : intervals.reduce((sum, value) => sum + value, 0) / intervals.length,
      p50FrameIntervalMs: quantile(intervals, 0.5),
      p95FrameIntervalMs: quantile(intervals, 0.95),
      p99FrameIntervalMs: quantile(intervals, 0.99),
      maxFrameIntervalMs: intervals.length === 0 ? 0 : Math.max(...intervals),
      framesOverBudget: intervals.filter((value) => value > nominalFrame * 1.5).length,
      droppedFrames,
      longTaskCount: state.longTasks.length,
      longTaskTotalMs: state.longTasks.reduce((sum, entry) => sum + entry.duration, 0),
      loafCount: state.longAnimationFrames.length,
      loafTotalMs: state.longAnimationFrames.reduce(
        (sum, entry) => sum + entry.duration,
        0,
      ),
      loafBlockingTotalMs: state.longAnimationFrames.reduce(
        (sum, entry) => sum + entry.blockingDuration,
        0,
      ),
    };
  };

  window.__CANVAS_PERF__ = {
    clearTrackedIntervals() {
      for (const id of trackedIntervals) nativeClearInterval(id);
      trackedIntervals.clear();
    },
    reset() {
      state.baseTime = performance.now();
      state.lastFrame = null;
      state.draggableImageRectCalls = 0;
      state.frameIntervals.length = 0;
      state.trajectory.length = 0;
      state.longTasks.length = 0;
      state.longAnimationFrames.length = 0;
      state.events.length = 0;
      state.workMetrics = {};
      state.probes = {};
      return state.baseTime;
    },
    recordWorkMetric(name, value) {
      state.workMetrics[name] = value;
    },
    incrementWorkMetric(name, amount = 1) {
      state.workMetrics[name] = (state.workMetrics[name] ?? 0) + amount;
    },
    incrementProbe(name, amount = 1) {
      state.probes[name] = (state.probes[name] ?? 0) + amount;
    },
    readProbe(name) {
      return state.probes[name] ?? 0;
    },
    snapshot() {
      return {
        support: {
          longTask: PerformanceObserver.supportedEntryTypes.includes("longtask"),
          longAnimationFrame:
            PerformanceObserver.supportedEntryTypes.includes("long-animation-frame"),
        },
        counters: {
          draggableImageRectCalls: state.draggableImageRectCalls,
        },
        workMetrics: { ...state.workMetrics },
        summary: summarize(),
        frameIntervals: [...state.frameIntervals],
        trajectory: state.trajectory.map((sample) => ({ ...sample })),
        longTasks: state.longTasks.map((entry) => ({ ...entry })),
        longAnimationFrames: state.longAnimationFrames.map((entry) => ({
          ...entry,
          scripts: entry.scripts.map((script) => ({ ...script })),
        })),
        events: state.events.map((event) => ({ ...event })),
      };
    },
  };
}
