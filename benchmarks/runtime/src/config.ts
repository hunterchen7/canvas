import {
  BENCHMARK_SCENARIO_VERSION,
  BENCHMARK_SCHEMA_VERSION,
  type BenchmarkConfig,
  type RequestedPerformanceMode,
} from "./schema";

const MODES = new Set<RequestedPerformanceMode>([
  "auto",
  "high",
  "medium",
  "low",
]);

function boundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function booleanParam(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  return value !== "0" && value !== "false";
}

export function parseBenchmarkConfig(search: string): BenchmarkConfig {
  const params = new URLSearchParams(search);
  const sectionCount = boundedInteger(params.get("sections"), 24, 1, 200);
  const requestedModeValue = params.get("mode") as RequestedPerformanceMode | null;
  const requestedMode =
    requestedModeValue && MODES.has(requestedModeValue)
      ? requestedModeValue
      : "auto";

  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    scenarioVersion: BENCHMARK_SCENARIO_VERSION,
    runId:
      params.get("runId") ??
      `canvas-runtime-${Date.now().toString(36)}-${sectionCount}`,
    sectionCount,
    navItemCount: boundedInteger(
      params.get("navItems"),
      Math.min(sectionCount, 8),
      1,
      sectionCount,
    ),
    sectionComplexity: boundedInteger(params.get("complexity"), 24, 1, 200),
    requestedMode,
    introEnabled: booleanParam(params.get("intro"), true),
    autorun: booleanParam(params.get("autorun"), false),
    seed: boundedInteger(params.get("seed"), 42, 0, 2_147_483_647),
  };
}
