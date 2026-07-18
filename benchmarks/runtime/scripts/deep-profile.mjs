import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import {
  summarizeCpuProfile,
  summarizeHeapProfile,
  summarizeTrace,
} from "./profile-summary.mjs";

const gunzipAsync = promisify(gunzip);

const PROFILE_SCHEMA_VERSION = "1.0.0";
const TRACE_STREAM_TIMEOUT_MS = 60_000;
const TRACE_STREAM_CHUNK_BYTES = 1024 * 1024;
const ALLOCATION_STACK_DEPTH = 128;
const SUPPORTED_KINDS = new Set(["cpu", "trace", "allocations"]);

export const DEFAULT_TRACE_CATEGORIES = Object.freeze([
  "devtools.timeline",
  "blink.user_timing",
  "v8",
  "v8.execute",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-v8.gc",
  "cc",
  "gpu",
]);

const DEFAULT_WARNINGS = Object.freeze([
  "Deep profiling is diagnostic-only and adds measurable overhead; do not use these timings as regression gates.",
  "CPU profiles are statistical renderer-isolate samples, not raw hardware CPU-cycle counts.",
  "Trace CPU, compositor, raster, and GPU durations are software timeline events, not raw hardware counters.",
  "Headless Chromium can use a software GPU; compare captures only under matching browser, launch, and machine conditions.",
  "Loading a trace for summary generation can temporarily require several times the compressed trace size in memory.",
]);

function normalizeKinds(kinds) {
  const values =
    typeof kinds === "string"
      ? kinds.split(",")
      : kinds instanceof Set || Array.isArray(kinds)
        ? [...kinds]
        : kinds == null
          ? ["cpu", "trace"]
          : [];
  const normalized = new Set(
    values.map((value) => String(value).trim().toLowerCase()).filter(Boolean),
  );
  const unsupported = [...normalized].filter((kind) => !SUPPORTED_KINDS.has(kind));
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported profile kind${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}`,
    );
  }
  if (normalized.size === 0) {
    throw new Error("At least one profile kind is required");
  }
  return ["cpu", "trace", "allocations"].filter((kind) => normalized.has(kind));
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function serializeError(error) {
  if (error == null) return null;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
      cause: error.cause == null ? null : String(error.cause),
    };
  }
  if (typeof error === "object") {
    try {
      return JSON.parse(JSON.stringify(error));
    } catch {
      // Fall through to a stable string representation.
    }
  }
  return { name: "Error", message: String(error), stack: null, cause: null };
}

function serializable(value) {
  if (value == null) return value ?? null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { description: String(value) };
  }
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value))];
}

async function writeJsonArtifact(outputDirectory, filename, value) {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  const artifactPath = path.join(outputDirectory, filename);
  await writeFile(artifactPath, contents, "utf8");
  return {
    path: filename,
    bytes: Buffer.byteLength(contents),
    mediaType: "application/json",
  };
}

function createEventWaiter(session, eventName, timeoutMs) {
  let settled = false;
  let timer = null;
  let resolvePromise;
  let rejectPromise;

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    session.off(eventName, onEvent);
  };
  const onEvent = (payload) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolvePromise(payload);
  };
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
    session.on(eventName, onEvent);
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new Error(`Timed out waiting for ${eventName} after ${timeoutMs}ms`),
      );
    }, timeoutMs);
  });

  return {
    promise,
    cancel() {
      if (settled) return;
      settled = true;
      cleanup();
      resolvePromise(null);
    },
    reject(error) {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(error);
    },
  };
}

async function writeBuffer(fileHandle, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesWritten } = await fileHandle.write(buffer.subarray(offset));
    if (bytesWritten <= 0) throw new Error("Trace stream write made no progress");
    offset += bytesWritten;
  }
}

async function readProtocolStreamToFile(session, handle, destination) {
  const partialDestination = `${destination}.partial`;
  const fileHandle = await open(partialDestination, "w");
  let completed = false;

  try {
    while (true) {
      const response = await session.send("IO.read", {
        handle,
        size: TRACE_STREAM_CHUNK_BYTES,
      });
      if (response.data) {
        const chunk = Buffer.from(
          response.data,
          response.base64Encoded ? "base64" : "utf8",
        );
        await writeBuffer(fileHandle, chunk);
      }
      if (response.eof) break;
    }
    await fileHandle.sync();
    completed = true;
  } finally {
    await fileHandle.close().catch(() => {});
    await session.send("IO.close", { handle }).catch(() => {});
    if (completed) {
      await rename(partialDestination, destination);
    } else {
      await unlink(partialDestination).catch(() => {});
    }
  }
}

async function parseTraceArtifact(tracePath) {
  const contents = await readFile(tracePath);
  const isGzip = contents[0] === 0x1f && contents[1] === 0x8b;
  const json = isGzip ? await gunzipAsync(contents) : contents;
  return JSON.parse(json.toString("utf8"));
}

function extractReactSummary(benchmarkResult) {
  if (!benchmarkResult || typeof benchmarkResult !== "object") return null;
  return {
    source: "result.json",
    profiler: benchmarkResult.profiler ?? null,
    renderCount: benchmarkResult.renderCount ?? null,
    rendersById: benchmarkResult.rendersById ?? null,
    phases: Array.isArray(benchmarkResult.phases)
      ? benchmarkResult.phases.map((phase) => ({
          name: phase.name ?? null,
          durationMs: phase.durationMs ?? null,
          profiler: phase.profiler ?? null,
          renderCount: phase.renderCount ?? null,
          rendersById: phase.rendersById ?? null,
        }))
      : [],
  };
}

class DeepProfileController {
  constructor({
    page,
    outputDirectory,
    kinds,
    cpuSamplingIntervalUs,
    allocationSamplingIntervalBytes,
    runMetadata,
    manifestKind,
  }) {
    if (!page || typeof page.context !== "function") {
      throw new Error("startDeepProfile requires a Playwright Page");
    }
    if (typeof outputDirectory !== "string" || outputDirectory.trim() === "") {
      throw new Error("startDeepProfile requires an outputDirectory");
    }

    this.page = page;
    this.outputDirectory = path.resolve(outputDirectory);
    this.kinds = normalizeKinds(kinds);
    this.cpuSamplingIntervalUs = positiveInteger(
      cpuSamplingIntervalUs ?? 1_000,
      "cpuSamplingIntervalUs",
    );
    this.allocationSamplingIntervalBytes = positiveInteger(
      allocationSamplingIntervalBytes ?? 32_768,
      "allocationSamplingIntervalBytes",
    );
    this.runMetadata = serializable(runMetadata ?? {});
    this.manifestKind =
      typeof manifestKind === "string" && manifestKind.trim()
        ? manifestKind.trim()
        : "canvas-runtime-deep-profile";
    this.session = null;
    this.browserMetadata = null;
    this.cpuStarted = false;
    this.traceStarted = false;
    this.allocationsStarted = false;
    this.startedAtIso = null;
    this.stoppedAtIso = null;
    this.warnings = [...DEFAULT_WARNINGS];
    this.captureErrors = [];
    this.stopPromise = null;
  }

  has(kind) {
    return this.kinds.includes(kind);
  }

  async start() {
    await mkdir(this.outputDirectory, { recursive: true });
    this.session = await this.page.context().newCDPSession(this.page);

    try {
      try {
        this.browserMetadata = await this.session.send("Browser.getVersion");
      } catch (error) {
        this.warnings.push(
          `Could not read browser version metadata: ${serializeError(error).message}`,
        );
      }

      if (this.has("cpu")) {
        await this.session.send("Profiler.enable");
        await this.session.send("Profiler.setSamplingInterval", {
          interval: this.cpuSamplingIntervalUs,
        });
        await this.session.send("Profiler.start");
        this.cpuStarted = true;
      }

      if (this.has("allocations")) {
        await this.session.send("HeapProfiler.enable");
        await this.session.send("HeapProfiler.startSampling", {
          samplingInterval: this.allocationSamplingIntervalBytes,
          stackDepth: ALLOCATION_STACK_DEPTH,
          includeObjectsCollectedByMajorGC: true,
          includeObjectsCollectedByMinorGC: true,
        });
        this.allocationsStarted = true;
      }

      if (this.has("trace")) {
        await this.session.send("Tracing.start", {
          categories: DEFAULT_TRACE_CATEGORIES.join(","),
          transferMode: "ReturnAsStream",
          streamFormat: "json",
          streamCompression: "gzip",
        });
        this.traceStarted = true;
      }

      this.startedAtIso = new Date().toISOString();
    } catch (error) {
      await this.cleanupAfterStartFailure();
      throw new Error(`Could not start deep profiling: ${serializeError(error).message}`, {
        cause: error,
      });
    }
  }

  async cleanupAfterStartFailure() {
    if (!this.session) return;
    if (this.traceStarted) {
      const waiter = createEventWaiter(
        this.session,
        "Tracing.tracingComplete",
        TRACE_STREAM_TIMEOUT_MS,
      );
      try {
        await this.session.send("Tracing.end");
        const completion = await waiter.promise;
        if (completion?.stream) {
          await this.session.send("IO.close", { handle: completion.stream });
        }
      } catch {
        waiter.cancel();
      }
    }
    if (this.allocationsStarted) {
      await this.session.send("HeapProfiler.stopSampling").catch(() => {});
    }
    if (this.cpuStarted) {
      await this.session.send("Profiler.stop").catch(() => {});
    }
    await this.disableAndDetach();
  }

  async mark(name) {
    if (typeof name !== "string" || name.trim() === "") {
      throw new Error("Profile mark name must be a non-empty string");
    }
    try {
      await this.page.evaluate((markName) => {
        performance.clearMarks(markName);
        performance.mark(markName);
      }, name);
      return true;
    } catch (error) {
      this.warnings.push(
        `Could not record profile mark ${JSON.stringify(name)}: ${serializeError(error).message}`,
      );
      return false;
    }
  }

  async markOnNextDocument(name) {
    if (typeof name !== "string" || name.trim() === "") {
      throw new Error("Profile mark name must be a non-empty string");
    }
    try {
      await this.page.addInitScript((markName) => {
        performance.mark(markName);
      }, name);
      return true;
    } catch (error) {
      this.warnings.push(
        `Could not install profile mark ${JSON.stringify(name)} for the next document: ${serializeError(error).message}`,
      );
      return false;
    }
  }

  async measure(name, startMark, endMark) {
    for (const [label, value] of [
      ["measure", name],
      ["start mark", startMark],
      ["end mark", endMark],
    ]) {
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`Profile ${label} name must be a non-empty string`);
      }
    }
    try {
      await this.page.evaluate(
        ({ measureName, start, end }) => {
          performance.clearMeasures(measureName);
          performance.measure(measureName, start, end);
        },
        { measureName: name, start: startMark, end: endMark },
      );
      return true;
    } catch (error) {
      this.warnings.push(
        `Could not record profile measure ${JSON.stringify(name)}: ${serializeError(error).message}`,
      );
      return false;
    }
  }

  async stop(options = {}) {
    if (!this.stopPromise) this.stopPromise = this.stopOnce(options);
    return this.stopPromise;
  }

  async stopOnce({ benchmarkResult = null, status, error = null } = {}) {
    const benchmarkStatus =
      status ??
      (benchmarkResult && typeof benchmarkResult === "object"
        ? benchmarkResult.status
        : null) ??
      (error ? "error" : "complete");
    const cpuPath = path.join(this.outputDirectory, "cpu.cpuprofile");
    const tracePath = path.join(this.outputDirectory, "trace.json.gz");
    const allocationsPath = path.join(
      this.outputDirectory,
      "allocations.heapprofile",
    );
    const artifacts = {};
    let cpuProfile = null;
    let heapProfile = null;

    if (error != null) {
      this.captureErrors.push({ scope: "benchmark", error: serializeError(error) });
    }

    const capture = async (scope, action) => {
      try {
        return await action();
      } catch (captureError) {
        this.captureErrors.push({
          scope,
          error: serializeError(captureError),
        });
        return null;
      }
    };

    try {
      const stopping = [];
      if (this.traceStarted) {
        stopping.push(
          capture("trace", async () => {
            const waiter = createEventWaiter(
              this.session,
              "Tracing.tracingComplete",
              TRACE_STREAM_TIMEOUT_MS,
            );
            try {
              await this.session.send("Tracing.end");
            } catch (traceEndError) {
              waiter.cancel();
              throw traceEndError;
            }
            const completion = await waiter.promise;
            if (!completion?.stream) {
              throw new Error("Tracing completed without an IO stream handle");
            }
            if (completion.dataLossOccurred) {
              this.warnings.push(
                "Chrome reported trace data loss; treat the trace summary as incomplete.",
              );
            }
            await readProtocolStreamToFile(
              this.session,
              completion.stream,
              tracePath,
            );
            const details = await stat(tracePath);
            artifacts.trace = {
              path: path.basename(tracePath),
              bytes: details.size,
              mediaType: "application/gzip",
              devToolsImportable: true,
              compressed: true,
            };
          }),
        );
      }
      if (this.cpuStarted) {
        stopping.push(
          capture("cpu", async () => {
            const response = await this.session.send("Profiler.stop");
            cpuProfile = response.profile;
            artifacts.cpu = {
              ...(await writeJsonArtifact(
                this.outputDirectory,
                path.basename(cpuPath),
                cpuProfile,
              )),
              devToolsImportable: true,
            };
          }),
        );
      }
      if (this.allocationsStarted) {
        stopping.push(
          capture("allocations", async () => {
            const response = await this.session.send(
              "HeapProfiler.stopSampling",
            );
            heapProfile = response.profile;
            artifacts.allocations = {
              ...(await writeJsonArtifact(
                this.outputDirectory,
                path.basename(allocationsPath),
                heapProfile,
              )),
              devToolsImportable: true,
            };
          }),
        );
      }
      await Promise.all(stopping);
    } finally {
      this.stoppedAtIso = new Date().toISOString();
      await this.disableAndDetach();
    }

    artifacts.result = await writeJsonArtifact(
      this.outputDirectory,
      "result.json",
      benchmarkResult,
    );

    let cpuSummary = null;
    let traceSummary = null;
    let allocationsSummary = null;
    if (cpuProfile) {
      cpuSummary = await capture("cpu-summary", async () =>
        summarizeCpuProfile(cpuProfile),
      );
    }
    if (artifacts.trace) {
      traceSummary = await capture("trace-summary", async () =>
        summarizeTrace(await parseTraceArtifact(tracePath)),
      );
    }
    if (heapProfile) {
      allocationsSummary = await capture("allocations-summary", async () =>
        summarizeHeapProfile(heapProfile),
      );
    }

    const summaryWarnings = uniqueStrings([
      ...this.warnings,
      ...(cpuSummary?.warnings ?? []),
      ...(traceSummary?.warnings ?? []),
      ...(allocationsSummary?.warnings ?? []),
    ]);
    const summary = {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      diagnosticOnly: true,
      generatedAtIso: new Date().toISOString(),
      benchmarkStatus,
      captureStatus: this.captureErrors.length === 0 ? "complete" : "partial",
      settings: this.settings(),
      react: extractReactSummary(benchmarkResult),
      cpu: cpuSummary,
      trace: traceSummary,
      allocations: allocationsSummary,
      warnings: summaryWarnings,
      errors: this.captureErrors,
    };
    artifacts.summary = await writeJsonArtifact(
      this.outputDirectory,
      "summary.json",
      summary,
    );

    const manifest = {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      kind: this.manifestKind,
      diagnosticOnly: true,
      startedAtIso: this.startedAtIso,
      stoppedAtIso: this.stoppedAtIso,
      benchmarkStatus,
      captureStatus: this.captureErrors.length === 0 ? "complete" : "partial",
      settings: this.settings(),
      runMetadata: this.runMetadata,
      browser: this.browserMetadata,
      artifacts,
      warnings: summaryWarnings,
      errors: this.captureErrors,
    };
    await writeJsonArtifact(this.outputDirectory, "manifest.json", manifest);

    return {
      outputDirectory: this.outputDirectory,
      manifest,
      summary,
    };
  }

  settings() {
    return {
      kinds: [...this.kinds],
      cpuSamplingIntervalUs: this.cpuSamplingIntervalUs,
      allocationSamplingIntervalBytes: this.allocationSamplingIntervalBytes,
      allocationStackDepth: ALLOCATION_STACK_DEPTH,
      traceCategories: this.has("trace") ? [...DEFAULT_TRACE_CATEGORIES] : [],
      traceCompression: this.has("trace") ? "gzip" : null,
    };
  }

  async disableAndDetach() {
    if (!this.session) return;
    if (this.cpuStarted) {
      await this.session.send("Profiler.disable").catch((error) => {
        this.captureErrors.push({
          scope: "cpu-cleanup",
          error: serializeError(error),
        });
      });
      this.cpuStarted = false;
    }
    if (this.allocationsStarted) {
      await this.session.send("HeapProfiler.disable").catch((error) => {
        this.captureErrors.push({
          scope: "allocations-cleanup",
          error: serializeError(error),
        });
      });
      this.allocationsStarted = false;
    }
    await this.session.detach().catch((error) => {
      this.captureErrors.push({
        scope: "cdp-detach",
        error: serializeError(error),
      });
    });
    this.session = null;
    this.traceStarted = false;
  }
}

/**
 * Starts opt-in renderer profiling for a Playwright page.
 *
 * The returned controller exposes mark(), markOnNextDocument(), measure(), and
 * idempotent stop(). Normal benchmark runs incur no CDP overhead unless this
 * function is called.
 */
export async function startDeepProfile(options) {
  const controller = new DeepProfileController(options);
  await controller.start();
  return Object.freeze({
    outputDirectory: controller.outputDirectory,
    kinds: [...controller.kinds],
    mark: controller.mark.bind(controller),
    markOnNextDocument: controller.markOnNextDocument.bind(controller),
    measure: controller.measure.bind(controller),
    stop: controller.stop.bind(controller),
  });
}
