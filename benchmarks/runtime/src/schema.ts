export const BENCHMARK_SCHEMA_VERSION = "1.0.0" as const;
export const BENCHMARK_SCENARIO_VERSION = "1.0.0" as const;

export type RequestedPerformanceMode = "auto" | "high" | "medium" | "low";
export type DetectedPerformanceMode = "high" | "medium" | "low" | "unknown";
export type BenchmarkRunner = "interactive" | "in-page" | "playwright";
export type BenchmarkStatus = "booting" | "running" | "complete" | "error";

export type BenchmarkPhaseName =
  | "intro"
  | "navbar"
  | "visibility"
  | "drag"
  | "pan"
  | "zoom"
  | "settle";

export interface BenchmarkConfig {
  schemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
  scenarioVersion: typeof BENCHMARK_SCENARIO_VERSION;
  runId: string;
  sectionCount: number;
  navItemCount: number;
  sectionComplexity: number;
  requestedMode: RequestedPerformanceMode;
  introEnabled: boolean;
  autorun: boolean;
  seed: number;
}

export interface CanvasRuntimeState {
  animationStage: number;
  x: number;
  y: number;
  scale: number;
  detectedMode: DetectedPerformanceMode;
}

export interface MotionSample {
  atMs: number;
  benchmarkPhase: BenchmarkPhaseName | null;
  animationStage: number;
  x: number;
  y: number;
  scale: number;
}

export interface AnimationStageEvent {
  atMs: number;
  previousStage: number | null;
  stage: number;
}

export interface BehaviorSnapshot {
  label: string;
  atMs: number;
  benchmarkPhase: BenchmarkPhaseName | null;
  canvas: CanvasRuntimeState;
  mountedSectionIds: string[];
  draggableTransforms: Record<string, string>;
  toolbarText: string | null;
  navbarButtons: Array<{
    label: string;
    className: string;
  }>;
}

export interface MotionSummary {
  sampleCount: number;
  start: CanvasRuntimeState | null;
  end: CanvasRuntimeState | null;
  panPathDistancePx: number;
  scalePathDistance: number;
  maxPanStepPx: number;
  maxScaleStep: number;
  trajectoryHash: string;
}

export interface ProfilerSample {
  id: string;
  phase: "mount" | "update" | "nested-update";
  benchmarkPhase: BenchmarkPhaseName | null;
  actualDurationMs: number;
  baseDurationMs: number;
  startTimeMs: number;
  commitTimeMs: number;
}

export interface DurationSummary {
  sampleCount: number;
  totalMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

export interface ProfilerSummary {
  commitCount: number;
  mountCommitCount: number;
  updateCommitCount: number;
  nestedUpdateCommitCount: number;
  actualDuration: DurationSummary;
  totalBaseDurationMs: number;
  maxBaseDurationMs: number;
}

export interface FrameSummary extends DurationSummary {
  estimatedDroppedFrames: number;
  targetFrameIntervalMs: number;
}

export interface LongTaskSummary extends DurationSummary {
  supported: boolean;
}

export interface LongAnimationFrameSummary extends DurationSummary {
  supported: boolean;
  totalBlockingDurationMs: number;
  maxBlockingDurationMs: number;
}

export interface ListenerTypeSummary {
  added: number;
  removed: number;
  active: number;
}

export interface ListenerSummary {
  approximate: boolean;
  byType: Record<string, ListenerTypeSummary>;
  totals: ListenerTypeSummary;
}

export interface PhaseSummary {
  name: BenchmarkPhaseName;
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  profiler: ProfilerSummary;
  renderCount: number;
  rendersById: Record<string, number>;
  frames: FrameSummary;
  longTasks: LongTaskSummary;
  longAnimationFrames: LongAnimationFrameSummary;
  motion: MotionSummary;
}

export interface NavigationTimingSummary {
  domContentLoadedMs: number | null;
  loadEventMs: number | null;
  responseEndMs: number | null;
  transferSizeBytes: number | null;
}

export interface RuntimeEnvironment {
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  crossOriginIsolated: boolean;
  navigation: NavigationTimingSummary;
  usedJsHeapSizeBytes: number | null;
}

export interface BenchmarkResult {
  schemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
  scenarioVersion: typeof BENCHMARK_SCENARIO_VERSION;
  status: "complete" | "error";
  runId: string;
  runner: BenchmarkRunner;
  startedAtIso: string;
  finishedAtIso: string;
  elapsedMs: number;
  config: BenchmarkConfig;
  environment: RuntimeEnvironment;
  canvas: CanvasRuntimeState;
  profiler: ProfilerSummary;
  renderCount: number;
  rendersById: Record<string, number>;
  listeners: ListenerSummary;
  frames: FrameSummary;
  longTasks: LongTaskSummary;
  longAnimationFrames: LongAnimationFrameSummary;
  phases: PhaseSummary[];
  motion: MotionSummary;
  motionSamples: MotionSample[];
  animationStageEvents: AnimationStageEvent[];
  behaviorSnapshots: BehaviorSnapshot[];
  warnings: string[];
  errors: string[];
  profilerSamples: ProfilerSample[];
}

export interface BenchmarkPublicApi {
  readonly schemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
  status: BenchmarkStatus;
  config: BenchmarkConfig;
  state: CanvasRuntimeState;
  result: BenchmarkResult | null;
  setRunner(runner: BenchmarkRunner): void;
  beginPhase(name: BenchmarkPhaseName): void;
  endPhase(name?: BenchmarkPhaseName): void;
  getSnapshot(): {
    status: BenchmarkStatus;
    state: CanvasRuntimeState;
    renderCount: number;
    commitCount: number;
  };
  waitForCanvasReady(timeoutMs?: number): Promise<void>;
  waitForMotionSettled(timeoutMs?: number): Promise<void>;
  runInPage(): Promise<BenchmarkResult>;
  finalize(): BenchmarkResult;
  fail(error: unknown): BenchmarkResult;
}
