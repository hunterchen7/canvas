import type {
  AnimationStageEvent,
  BehaviorSnapshot,
  BenchmarkConfig,
  BenchmarkPhaseName,
  BenchmarkPublicApi,
  BenchmarkResult,
  BenchmarkRunner,
  CanvasRuntimeState,
  DurationSummary,
  FrameSummary,
  ListenerSummary,
  ListenerTypeSummary,
  LongAnimationFrameSummary,
  LongTaskSummary,
  MotionSample,
  MotionSummary,
  PhaseSummary,
  ProfilerSample,
  ProfilerSummary,
  RuntimeEnvironment,
} from "./schema";
import { BENCHMARK_SCHEMA_VERSION } from "./schema";

const EMPTY_DURATION: DurationSummary = {
  sampleCount: 0,
  totalMs: 0,
  meanMs: 0,
  p50Ms: 0,
  p95Ms: 0,
  p99Ms: 0,
  maxMs: 0,
};

function round(value: number, precision = 4): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function percentile(sorted: number[], quantile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * quantile) - 1),
  );
  return sorted[index] ?? 0;
}

function summarizeDurations(values: number[]): DurationSummary {
  if (values.length === 0) return { ...EMPTY_DURATION };
  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    sampleCount: values.length,
    totalMs: round(total),
    meanMs: round(total / values.length),
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    p99Ms: round(percentile(sorted, 0.99)),
    maxMs: round(sorted[sorted.length - 1] ?? 0),
  };
}

function summarizeFrames(values: number[]): FrameSummary {
  const summary = summarizeDurations(values);
  const plausibleIntervals = values
    .filter((value) => value > 1 && value < 50)
    .sort((a, b) => a - b);
  const targetFrameIntervalMs =
    percentile(plausibleIntervals, 0.5) || 1000 / 60;
  return {
    ...summary,
    estimatedDroppedFrames: values.reduce(
      (total, interval) =>
        total + Math.max(0, Math.round(interval / targetFrameIntervalMs) - 1),
      0,
    ),
    targetFrameIntervalMs: round(targetFrameIntervalMs),
  };
}

function summarizeProfiler(samples: ProfilerSample[]): ProfilerSummary {
  const baseDurations = samples.map((sample) => sample.baseDurationMs);
  return {
    commitCount: samples.length,
    mountCommitCount: samples.filter((sample) => sample.phase === "mount").length,
    updateCommitCount: samples.filter((sample) => sample.phase === "update").length,
    nestedUpdateCommitCount: samples.filter(
      (sample) => sample.phase === "nested-update",
    ).length,
    actualDuration: summarizeDurations(
      samples.map((sample) => sample.actualDurationMs),
    ),
    totalBaseDurationMs: round(
      baseDurations.reduce((sum, duration) => sum + duration, 0),
    ),
    maxBaseDurationMs: round(Math.max(0, ...baseDurations)),
  };
}

function hashMotion(samples: MotionSample[]): string {
  let hash = 0x811c9dc5;
  for (const sample of samples) {
    const token = `${sample.animationStage}:${sample.x.toFixed(3)}:${sample.y.toFixed(3)}:${sample.scale.toFixed(5)}|`;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function summarizeMotion(
  samples: MotionSample[],
  detectedMode: CanvasRuntimeState["detectedMode"],
): MotionSummary {
  let panPathDistancePx = 0;
  let scalePathDistance = 0;
  let maxPanStepPx = 0;
  let maxScaleStep = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    const panStep = Math.hypot(current.x - previous.x, current.y - previous.y);
    const scaleStep = Math.abs(current.scale - previous.scale);
    panPathDistancePx += panStep;
    scalePathDistance += scaleStep;
    maxPanStepPx = Math.max(maxPanStepPx, panStep);
    maxScaleStep = Math.max(maxScaleStep, scaleStep);
  }

  const stateFromSample = (sample: MotionSample): CanvasRuntimeState => ({
    animationStage: sample.animationStage,
    x: round(sample.x),
    y: round(sample.y),
    scale: round(sample.scale, 6),
    detectedMode,
  });

  return {
    sampleCount: samples.length,
    start: samples[0] ? stateFromSample(samples[0]) : null,
    end: samples.at(-1) ? stateFromSample(samples.at(-1)!) : null,
    panPathDistancePx: round(panPathDistancePx),
    scalePathDistance: round(scalePathDistance, 6),
    maxPanStepPx: round(maxPanStepPx),
    maxScaleStep: round(maxScaleStep, 6),
    trajectoryHash: hashMotion(samples),
  };
}

function copyRenderCounts(source: Map<string, number>): Map<string, number> {
  return new Map(source);
}

function renderDelta(
  current: Map<string, number>,
  start: Map<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [id, count] of current) {
    const delta = count - (start.get(id) ?? 0);
    if (delta > 0) result[id] = delta;
  }
  return result;
}

function sumRecord(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, count) => sum + count, 0);
}

interface TimedEntry {
  startTimeMs: number;
  durationMs: number;
}

interface LoafEntry extends TimedEntry {
  blockingDurationMs: number;
}

interface OpenPhase {
  name: BenchmarkPhaseName;
  startedAtMs: number;
  profilerIndex: number;
  frameIndex: number;
  longTaskIndex: number;
  loafIndex: number;
  motionIndex: number;
  renderCounts: Map<string, number>;
}

type ListenerCallback = EventListenerOrEventListenerObject;

class ListenerTracker {
  private installed = false;
  private readonly registry = new WeakMap<
    EventTarget,
    Map<string, Set<ListenerCallback>>
  >();
  private readonly byType = new Map<string, ListenerTypeSummary>();
  private originalAdd: typeof EventTarget.prototype.addEventListener | null = null;
  private originalRemove: typeof EventTarget.prototype.removeEventListener | null = null;

  install(): void {
    if (this.installed) return;
    this.installed = true;
    this.originalAdd = EventTarget.prototype.addEventListener;
    this.originalRemove = EventTarget.prototype.removeEventListener;
    const tracker = this;

    EventTarget.prototype.addEventListener = function patchedAdd(
      type: string,
      callback: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ): void {
      if (callback) tracker.onAdd(this, type, callback, options);
      tracker.originalAdd!.call(this, type, callback, options);
    };

    EventTarget.prototype.removeEventListener = function patchedRemove(
      type: string,
      callback: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ): void {
      if (callback) tracker.onRemove(this, type, callback, options);
      tracker.originalRemove!.call(this, type, callback, options);
    };
  }

  private capture(options?: boolean | EventListenerOptions): boolean {
    return typeof options === "boolean" ? options : Boolean(options?.capture);
  }

  private stats(type: string): ListenerTypeSummary {
    const existing = this.byType.get(type);
    if (existing) return existing;
    const created = { added: 0, removed: 0, active: 0 };
    this.byType.set(type, created);
    return created;
  }

  private onAdd(
    target: EventTarget,
    type: string,
    callback: ListenerCallback,
    options?: boolean | AddEventListenerOptions,
  ): void {
    let targetMap = this.registry.get(target);
    if (!targetMap) {
      targetMap = new Map();
      this.registry.set(target, targetMap);
    }
    const key = `${type}:${this.capture(options) ? "capture" : "bubble"}`;
    let callbacks = targetMap.get(key);
    if (!callbacks) {
      callbacks = new Set();
      targetMap.set(key, callbacks);
    }
    if (callbacks.has(callback)) return;
    callbacks.add(callback);
    const stats = this.stats(type);
    stats.added += 1;
    stats.active += 1;
  }

  private onRemove(
    target: EventTarget,
    type: string,
    callback: ListenerCallback,
    options?: boolean | EventListenerOptions,
  ): void {
    const key = `${type}:${this.capture(options) ? "capture" : "bubble"}`;
    const callbacks = this.registry.get(target)?.get(key);
    if (!callbacks?.delete(callback)) return;
    const stats = this.stats(type);
    stats.removed += 1;
    stats.active = Math.max(0, stats.active - 1);
  }

  snapshot(): ListenerSummary {
    const byType: Record<string, ListenerTypeSummary> = {};
    const totals = { added: 0, removed: 0, active: 0 };
    for (const [type, values] of [...this.byType].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      byType[type] = { ...values };
      totals.added += values.added;
      totals.removed += values.removed;
      totals.active += values.active;
    }
    return {
      approximate: true,
      byType,
      totals,
    };
  }
}

class BenchmarkRecorder {
  readonly listenerTracker = new ListenerTracker();
  readonly canvasState: CanvasRuntimeState = {
    animationStage: 0,
    x: 0,
    y: 0,
    scale: 1,
    detectedMode: "unknown",
  };

  private config: BenchmarkConfig | null = null;
  private runner: BenchmarkRunner = "interactive";
  private startedAtIso = "";
  private startedAtMs = 0;
  private finishedResult: BenchmarkResult | null = null;
  private currentPhase: OpenPhase | null = null;
  private readonly phases: PhaseSummary[] = [];
  private readonly profilerSamples: ProfilerSample[] = [];
  private readonly renderCounts = new Map<string, number>();
  private readonly frameIntervals: number[] = [];
  private readonly longTasks: TimedEntry[] = [];
  private readonly longAnimationFrames: LoafEntry[] = [];
  private readonly motionSamples: MotionSample[] = [];
  private readonly animationStageEvents: AnimationStageEvent[] = [];
  private readonly behaviorSnapshots: BehaviorSnapshot[] = [];
  private readonly warnings: string[] = [
    "Instrumentation has non-zero overhead; compare identical fixture/configuration runs.",
    "Listener active counts are approximate because once/signal-driven removals are not observable.",
    "Phase-boundary behavior snapshots add a small, consistent amount of DOM inspection overhead.",
  ];
  private readonly errors: string[] = [];
  private lastFrameAt: number | null = null;
  private frameRequest = 0;
  private longTaskObserver: PerformanceObserver | null = null;
  private loafObserver: PerformanceObserver | null = null;
  private stageInitialized = false;

  start(config: BenchmarkConfig): void {
    this.config = config;
    this.startedAtIso = new Date().toISOString();
    this.startedAtMs = performance.now();
    this.listenerTracker.install();
    this.installPerformanceObservers();
    this.frameRequest = requestAnimationFrame(this.onFrame);
    this.beginPhase("intro");
  }

  private readonly onFrame = (timestamp: number): void => {
    if (this.lastFrameAt != null) {
      this.frameIntervals.push(timestamp - this.lastFrameAt);
    }
    this.lastFrameAt = timestamp;
    this.motionSamples.push({
      atMs: round(timestamp),
      benchmarkPhase: this.currentPhase?.name ?? null,
      animationStage: this.canvasState.animationStage,
      x: this.canvasState.x,
      y: this.canvasState.y,
      scale: this.canvasState.scale,
    });
    this.frameRequest = requestAnimationFrame(this.onFrame);
  };

  private installPerformanceObservers(): void {
    const supported = PerformanceObserver.supportedEntryTypes ?? [];
    if (supported.includes("longtask")) {
      this.longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTasks.push({
            startTimeMs: entry.startTime,
            durationMs: entry.duration,
          });
        }
      });
      this.longTaskObserver.observe({ type: "longtask", buffered: true });
    } else {
      this.warnings.push("PerformanceObserver longtask entries are unsupported.");
    }

    if (supported.includes("long-animation-frame")) {
      this.loafObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const loaf = entry as PerformanceEntry & { blockingDuration?: number };
          this.longAnimationFrames.push({
            startTimeMs: loaf.startTime,
            durationMs: loaf.duration,
            blockingDurationMs: loaf.blockingDuration ?? 0,
          });
        }
      });
      this.loafObserver.observe({
        type: "long-animation-frame",
        buffered: true,
      });
    } else {
      this.warnings.push(
        "PerformanceObserver long-animation-frame entries are unsupported.",
      );
    }
  }

  setRunner(runner: BenchmarkRunner): void {
    this.runner = runner;
  }

  updateCanvasState(next: Partial<CanvasRuntimeState>): void {
    const previousStage = this.canvasState.animationStage;
    Object.assign(this.canvasState, next);
    if (
      next.animationStage != null &&
      (!this.stageInitialized || next.animationStage !== previousStage)
    ) {
      this.animationStageEvents.push({
        atMs: round(performance.now()),
        previousStage: this.stageInitialized ? previousStage : null,
        stage: next.animationStage,
      });
      this.stageInitialized = true;
    }
  }

  recordRender(id: string): void {
    this.renderCounts.set(id, (this.renderCounts.get(id) ?? 0) + 1);
  }

  captureBehavior(label: string): void {
    const mountedSectionIds = Array.from(
      document.querySelectorAll<HTMLElement>("[data-benchmark-section]"),
      (element) => element.dataset.benchmarkSection ?? "",
    ).filter(Boolean);
    const draggableTransforms: Record<string, string> = {};
    for (const element of document.querySelectorAll<HTMLElement>(
      "[data-benchmark-draggable]",
    )) {
      const id = element.dataset.benchmarkDraggable;
      if (id) draggableTransforms[id] = element.style.transform;
    }
    const toolbar = document.querySelector<HTMLElement>("[data-toolbar-button]");
    const navbarButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button[aria-label^="Section "]'),
      (button) => ({
        label: button.getAttribute("aria-label") ?? "",
        className: button.className,
      }),
    );
    this.behaviorSnapshots.push({
      label,
      atMs: round(performance.now()),
      benchmarkPhase: this.currentPhase?.name ?? null,
      canvas: { ...this.canvasState },
      mountedSectionIds,
      draggableTransforms,
      toolbarText: toolbar?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      navbarButtons,
    });
  }

  recordProfiler(
    id: string,
    phase: "mount" | "update" | "nested-update",
    actualDurationMs: number,
    baseDurationMs: number,
    startTimeMs: number,
    commitTimeMs: number,
  ): void {
    this.profilerSamples.push({
      id,
      phase,
      benchmarkPhase: this.currentPhase?.name ?? null,
      actualDurationMs: round(actualDurationMs),
      baseDurationMs: round(baseDurationMs),
      startTimeMs: round(startTimeMs),
      commitTimeMs: round(commitTimeMs),
    });
  }

  beginPhase(name: BenchmarkPhaseName): void {
    if (this.finishedResult) return;
    if (this.currentPhase) this.endPhase(this.currentPhase.name);
    this.currentPhase = {
      name,
      startedAtMs: performance.now(),
      profilerIndex: this.profilerSamples.length,
      frameIndex: this.frameIntervals.length,
      longTaskIndex: this.longTasks.length,
      loafIndex: this.longAnimationFrames.length,
      motionIndex: this.motionSamples.length,
      renderCounts: copyRenderCounts(this.renderCounts),
    };
  }

  endPhase(expectedName?: BenchmarkPhaseName): void {
    const phase = this.currentPhase;
    if (!phase) return;
    if (expectedName && expectedName !== phase.name) {
      this.warnings.push(
        `Phase mismatch: attempted to end ${expectedName} while ${phase.name} was active.`,
      );
    }
    const endedAtMs = performance.now();
    const profiler = this.profilerSamples.slice(phase.profilerIndex);
    const frames = this.frameIntervals.slice(phase.frameIndex);
    const longTasks = this.longTasks.slice(phase.longTaskIndex);
    const loafs = this.longAnimationFrames.slice(phase.loafIndex);
    const motion = this.motionSamples.slice(phase.motionIndex);
    const rendersById = renderDelta(this.renderCounts, phase.renderCounts);
    this.phases.push({
      name: phase.name,
      startedAtMs: round(phase.startedAtMs),
      endedAtMs: round(endedAtMs),
      durationMs: round(endedAtMs - phase.startedAtMs),
      profiler: summarizeProfiler(profiler),
      renderCount: sumRecord(rendersById),
      rendersById,
      frames: summarizeFrames(frames),
      longTasks: {
        supported: this.longTaskObserver != null,
        ...summarizeDurations(longTasks.map((entry) => entry.durationMs)),
      },
      longAnimationFrames: {
        supported: this.loafObserver != null,
        ...summarizeDurations(loafs.map((entry) => entry.durationMs)),
        totalBlockingDurationMs: round(
          loafs.reduce((sum, entry) => sum + entry.blockingDurationMs, 0),
        ),
        maxBlockingDurationMs: round(
          Math.max(0, ...loafs.map((entry) => entry.blockingDurationMs)),
        ),
      },
      motion: summarizeMotion(motion, this.canvasState.detectedMode),
    });
    this.currentPhase = null;
  }

  getSnapshot(): BenchmarkPublicApi["getSnapshot"] extends () => infer T ? T : never {
    return {
      status: this.finishedResult
        ? this.finishedResult.status === "complete"
          ? "complete"
          : "error"
        : "running",
      state: { ...this.canvasState },
      renderCount: [...this.renderCounts.values()].reduce(
        (sum, count) => sum + count,
        0,
      ),
      commitCount: this.profilerSamples.length,
    };
  }

  async waitForCanvasReady(timeoutMs = 10_000): Promise<void> {
    await this.waitUntil(
      () => this.canvasState.animationStage >= 2,
      timeoutMs,
      "Canvas did not reach animation stage 2",
    );
  }

  async waitForMotionSettled(timeoutMs = 5_000): Promise<void> {
    const startedAt = performance.now();
    let previous = { ...this.canvasState };
    let stableSince = performance.now();
    while (performance.now() - startedAt < timeoutMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      const panDelta = Math.hypot(
        this.canvasState.x - previous.x,
        this.canvasState.y - previous.y,
      );
      const scaleDelta = Math.abs(this.canvasState.scale - previous.scale);
      if (panDelta < 0.02 && scaleDelta < 0.0001) {
        if (performance.now() - stableSince >= 250) return;
      } else {
        stableSince = performance.now();
        previous = { ...this.canvasState };
      }
    }
    throw new Error(`Motion did not settle within ${timeoutMs}ms`);
  }

  private async waitUntil(
    predicate: () => boolean,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<void> {
    const startedAt = performance.now();
    while (!predicate()) {
      if (performance.now() - startedAt >= timeoutMs) {
        throw new Error(`${timeoutMessage} (${timeoutMs}ms)`);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
  }

  private environment(): RuntimeEnvironment {
    const navigation = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;
    return {
      userAgent: navigator.userAgent,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemoryGb: navigator.deviceMemory ?? null,
      crossOriginIsolated: window.crossOriginIsolated,
      navigation: {
        domContentLoadedMs: navigation
          ? round(navigation.domContentLoadedEventEnd)
          : null,
        loadEventMs: navigation ? round(navigation.loadEventEnd) : null,
        responseEndMs: navigation ? round(navigation.responseEnd) : null,
        transferSizeBytes: navigation?.transferSize ?? null,
      },
      usedJsHeapSizeBytes: performance.memory?.usedJSHeapSize ?? null,
    };
  }

  finalize(status: "complete" | "error" = "complete"): BenchmarkResult {
    if (this.finishedResult) return this.finishedResult;
    if (!this.config) throw new Error("Benchmark recorder was not started");
    this.endPhase();
    cancelAnimationFrame(this.frameRequest);
    this.longTaskObserver?.disconnect();
    this.loafObserver?.disconnect();

    if (
      this.config.requestedMode !== "auto" &&
      this.canvasState.detectedMode !== "unknown" &&
      this.config.requestedMode !== this.canvasState.detectedMode
    ) {
      this.warnings.push(
        `Requested mode ${this.config.requestedMode} but detected ${this.canvasState.detectedMode}; use the documented viewport preset.`,
      );
    }

    const finishedAt = performance.now();
    const rendersById = Object.fromEntries(
      [...this.renderCounts].sort(([a], [b]) => a.localeCompare(b)),
    );
    const loafSummary: LongAnimationFrameSummary = {
      supported: this.loafObserver != null,
      ...summarizeDurations(
        this.longAnimationFrames.map((entry) => entry.durationMs),
      ),
      totalBlockingDurationMs: round(
        this.longAnimationFrames.reduce(
          (sum, entry) => sum + entry.blockingDurationMs,
          0,
        ),
      ),
      maxBlockingDurationMs: round(
        Math.max(
          0,
          ...this.longAnimationFrames.map((entry) => entry.blockingDurationMs),
        ),
      ),
    };
    const longTaskSummary: LongTaskSummary = {
      supported: this.longTaskObserver != null,
      ...summarizeDurations(this.longTasks.map((entry) => entry.durationMs)),
    };

    this.finishedResult = {
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      scenarioVersion: this.config.scenarioVersion,
      status,
      runId: this.config.runId,
      runner: this.runner,
      startedAtIso: this.startedAtIso,
      finishedAtIso: new Date().toISOString(),
      elapsedMs: round(finishedAt - this.startedAtMs),
      config: this.config,
      environment: this.environment(),
      canvas: { ...this.canvasState },
      profiler: summarizeProfiler(this.profilerSamples),
      renderCount: [...this.renderCounts.values()].reduce(
        (sum, count) => sum + count,
        0,
      ),
      rendersById,
      listeners: this.listenerTracker.snapshot(),
      frames: summarizeFrames(this.frameIntervals),
      longTasks: longTaskSummary,
      longAnimationFrames: loafSummary,
      phases: [...this.phases],
      motion: summarizeMotion(
        this.motionSamples,
        this.canvasState.detectedMode,
      ),
      motionSamples: [...this.motionSamples],
      animationStageEvents: [...this.animationStageEvents],
      behaviorSnapshots: [...this.behaviorSnapshots],
      warnings: [...this.warnings],
      errors: [...this.errors],
      profilerSamples: [...this.profilerSamples],
    };
    return this.finishedResult;
  }

  fail(error: unknown): BenchmarkResult {
    this.errors.push(error instanceof Error ? error.stack ?? error.message : String(error));
    return this.finalize("error");
  }
}

export const benchmarkRecorder = new BenchmarkRecorder();

let inPageRunner: (() => Promise<BenchmarkResult>) | null = null;

export function registerInPageRunner(
  runner: () => Promise<BenchmarkResult>,
): void {
  inPageRunner = runner;
}

export function installBenchmark(config: BenchmarkConfig): BenchmarkPublicApi {
  benchmarkRecorder.start(config);
  const api: BenchmarkPublicApi = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    status: "running",
    config,
    state: benchmarkRecorder.canvasState,
    result: null,
    setRunner(runner) {
      benchmarkRecorder.setRunner(runner);
    },
    beginPhase(name) {
      benchmarkRecorder.beginPhase(name);
      benchmarkRecorder.captureBehavior(`${name}:start`);
    },
    endPhase(name) {
      benchmarkRecorder.captureBehavior(`${name ?? "phase"}:end`);
      benchmarkRecorder.endPhase(name);
    },
    getSnapshot() {
      return benchmarkRecorder.getSnapshot();
    },
    waitForCanvasReady(timeoutMs) {
      return benchmarkRecorder.waitForCanvasReady(timeoutMs);
    },
    waitForMotionSettled(timeoutMs) {
      return benchmarkRecorder.waitForMotionSettled(timeoutMs);
    },
    async runInPage() {
      if (!inPageRunner) throw new Error("In-page runner has not mounted yet");
      api.setRunner("in-page");
      try {
        const result = await inPageRunner();
        api.status = result.status === "complete" ? "complete" : "error";
        api.result = result;
        return result;
      } catch (error) {
        return api.fail(error);
      }
    },
    finalize() {
      const result = benchmarkRecorder.finalize();
      api.status = "complete";
      api.result = result;
      return result;
    },
    fail(error) {
      const result = benchmarkRecorder.fail(error);
      api.status = "error";
      api.result = result;
      return result;
    },
  };
  window.__CANVAS_BENCHMARK__ = api;
  return api;
}

export function recordRender(id: string): void {
  benchmarkRecorder.recordRender(id);
}

export function updateCanvasState(next: Partial<CanvasRuntimeState>): void {
  benchmarkRecorder.updateCanvasState(next);
}

export function recordProfilerRender(
  id: string,
  phase: "mount" | "update" | "nested-update",
  actualDurationMs: number,
  baseDurationMs: number,
  startTimeMs: number,
  commitTimeMs: number,
): void {
  benchmarkRecorder.recordProfiler(
    id,
    phase,
    actualDurationMs,
    baseDurationMs,
    startTimeMs,
    commitTimeMs,
  );
}
