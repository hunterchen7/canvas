#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { compareScenario } from "./compare.mjs";
import { installBrowserInstrumentation } from "./instrumentation.mjs";
import {
  deepProfileScenarioNames,
  runProfileScenario,
} from "./scenarios.mjs";
import { startDeepProfile } from "../runtime/scripts/deep-profile.mjs";
import { resolveLibraryTarget } from "../runtime/scripts/library-target.mjs";

const e2eRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(e2eRoot, "../..");
const viteBin = path.join(repositoryRoot, "node_modules/vite/bin/vite.js");
const viteConfig = path.join(e2eRoot, "vite.config.mjs");
const profileKinds = Object.freeze(["cpu", "trace", "allocations"]);
let signalCleanup = null;
let signalCleanupPromise = null;
let receivedSignal = null;

function printHelp() {
  console.log([
    "Canvas paired deep-profile runner",
    "",
    "Usage:",
    "  node benchmarks/e2e/profile.mjs [options]",
    "",
    "Options:",
    "  --baseline-root PATH       Reference library worktree (required)",
    "  --candidate-root PATH      Candidate library worktree (default: current repository)",
    "  --output PATH              Artifact root (contains profiles/ and report.json)",
    "  --scenarios LIST           Comma-separated amplified scenarios",
    "  --kinds LIST               cpu,trace,allocations (each captured separately)",
    "  --warmups NUMBER           Unprofiled paired warmups per scenario/kind (default: 2)",
    "  --repetitions NUMBER       Even number of profiled pairs (default: 6)",
    "  --sections NUMBER          Extra CanvasComponents, 0-250 (default: 100)",
    "  --workload-scale NUMBER    Amplified inner-loop multiplier (default: 1)",
    "  --trace-workload-scale NUMBER  Smaller trace multiplier (default: 0.1)",
    "  --cpu-sampling-interval-us NUMBER       V8 sample interval (default: 1000)",
    "  --allocation-sampling-interval-bytes NUMBER (default: 32768)",
    "  --browser chromium|chrome  Bundled Chromium or system Chrome (default: chromium)",
    "  --headed                   Show the browser",
    "  --help                     Show this help",
    "",
    "This suite is diagnostic-only. It never applies a performance regression gate.",
    "Strict screenshot, DOM, interaction, and animation parity is still reported.",
  ].join("\n"));
}

function argumentValue(argv, index, argument) {
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) {
    throw new Error("Missing value for " + argument);
  }
  return next;
}

function positiveInteger(value, name, { allowZero = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(name + " must be " + (allowZero ? "a non-negative" : "a positive") + " integer");
  }
  return value;
}

function parseList(value) {
  return [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
}

function parseArguments(argv) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const options = {
    candidateRoot: repositoryRoot,
    baselineRoot: null,
    output: path.join(e2eRoot, "artifacts", "deep-profile-" + timestamp),
    scenarios: [...deepProfileScenarioNames],
    kinds: [...profileKinds],
    warmups: 2,
    repetitions: 6,
    sections: 100,
    workloadScale: 1,
    traceWorkloadScale: 0.1,
    cpuSamplingIntervalUs: 1_000,
    allocationSamplingIntervalBytes: 32_768,
    browser: "chromium",
    headed: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      printHelp();
      process.exit(0);
    }
    if (argument === "--headed") {
      options.headed = true;
      continue;
    }
    const value = argumentValue(argv, index, argument);
    index += 1;
    if (argument === "--baseline-root") options.baselineRoot = path.resolve(value);
    else if (argument === "--candidate-root") options.candidateRoot = path.resolve(value);
    else if (argument === "--output") options.output = path.resolve(value);
    else if (argument === "--scenarios") options.scenarios = parseList(value);
    else if (argument === "--kinds" || argument === "--profile-kinds") {
      options.kinds = parseList(value);
    } else if (argument === "--warmups") options.warmups = Number(value);
    else if (argument === "--repetitions") options.repetitions = Number(value);
    else if (argument === "--sections") options.sections = Number(value);
    else if (argument === "--workload-scale") options.workloadScale = Number(value);
    else if (argument === "--trace-workload-scale") {
      options.traceWorkloadScale = Number(value);
    } else if (argument === "--cpu-sampling-interval-us") {
      options.cpuSamplingIntervalUs = Number(value);
    } else if (argument === "--allocation-sampling-interval-bytes") {
      options.allocationSamplingIntervalBytes = Number(value);
    } else if (argument === "--browser") options.browser = value;
    else throw new Error("Unknown argument: " + argument);
  }

  if (!options.baselineRoot) {
    throw new Error("--baseline-root is required for a paired profile");
  }
  positiveInteger(options.warmups, "--warmups", { allowZero: true });
  positiveInteger(options.repetitions, "--repetitions");
  if (options.warmups % 2 !== 0) {
    throw new Error("--warmups must be zero or even so target order is balanced");
  }
  if (options.repetitions % 2 !== 0) {
    throw new Error("--repetitions must be even so target order is balanced");
  }
  positiveInteger(options.sections, "--sections", { allowZero: true });
  positiveInteger(options.cpuSamplingIntervalUs, "--cpu-sampling-interval-us");
  positiveInteger(
    options.allocationSamplingIntervalBytes,
    "--allocation-sampling-interval-bytes",
  );
  if (options.sections > 250) throw new Error("--sections must be between 0 and 250");
  if (!Number.isFinite(options.workloadScale) || options.workloadScale <= 0) {
    throw new Error("--workload-scale must be a positive number");
  }
  if (options.workloadScale > 100) {
    throw new Error("--workload-scale must not exceed 100");
  }
  if (
    !Number.isFinite(options.traceWorkloadScale) ||
    options.traceWorkloadScale <= 0 ||
    options.traceWorkloadScale > 10
  ) {
    throw new Error(
      "--trace-workload-scale must be greater than zero and at most 10",
    );
  }
  const unknownScenarios = options.scenarios.filter(
    (name) => !deepProfileScenarioNames.includes(name),
  );
  if (unknownScenarios.length > 0) {
    throw new Error("Unknown scenarios: " + unknownScenarios.join(", "));
  }
  const unknownKinds = options.kinds.filter((kind) => !profileKinds.includes(kind));
  if (unknownKinds.length > 0) {
    throw new Error("Unknown profile kinds: " + unknownKinds.join(", "));
  }
  if (options.scenarios.length === 0) throw new Error("At least one scenario is required");
  if (options.kinds.length === 0) throw new Error("At least one profile kind is required");
  if (!new Set(["chromium", "chrome"]).has(options.browser)) {
    throw new Error("Unknown browser: " + options.browser);
  }
  return options;
}

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
  };
}

async function writeJson(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, JSON.stringify(value, null, 2) + "\n");
}

async function waitForServer(url, child, logs) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("Vite exited with " + child.exitCode + "\n" + logs.join(""));
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Timed out waiting for " + url + "\n" + logs.join(""));
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const waitForExit = (timeoutMs) =>
    new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve(true);
        return;
      }
      let timer = null;
      const onExit = () => {
        clearTimeout(timer);
        resolve(true);
      };
      child.once("exit", onExit);
      timer = setTimeout(() => {
        child.off("exit", onExit);
        resolve(false);
      }, timeoutMs);
    });
  child.kill("SIGTERM");
  if (await waitForExit(2_000)) return;
  child.kill("SIGKILL");
  if (!(await waitForExit(2_000))) {
    throw new Error("Could not stop Vite child process " + child.pid);
  }
}

async function startFixtureServer({
  libraryRoot,
  libraryIdentity,
  port,
  id,
  register,
}) {
  const logs = [];
  const serverId = id + "-" + process.pid;
  const cacheDirectory = path.join(os.tmpdir(), "canvas-e2e-vite-" + serverId);
  const child = spawn(
    process.execPath,
    [
      viteBin,
      "--config",
      viteConfig,
      "--configLoader",
      "native",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        CANVAS_LIBRARY_ROOT: libraryRoot,
        CANVAS_LIBRARY_IDENTITY_JSON: JSON.stringify(libraryIdentity),
        CANVAS_E2E_SERVER_ID: serverId,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const collect = (chunk) => {
    logs.push(chunk.toString());
    if (logs.length > 100) logs.shift();
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const url = "http://127.0.0.1:" + port + "/";
  let stopPromise = null;
  const server = {
    url,
    stop() {
      stopPromise ??= (async () => {
        await stopChild(child);
        await fs.rm(cacheDirectory, { recursive: true, force: true });
      })();
      return stopPromise;
    },
  };
  register?.(server);
  try {
    await waitForServer(url, child, logs);
  } catch (error) {
    await server.stop();
    throw error;
  }
  return server;
}

async function launchBrowser(browserName, headed) {
  const launchOptions = { headless: !headed };
  if (browserName === "chrome") {
    return {
      browser: await chromium.launch({ ...launchOptions, channel: "chrome" }),
      requested: browserName,
      actual: "chrome",
      fallback: null,
    };
  }
  try {
    return {
      browser: await chromium.launch(launchOptions),
      requested: browserName,
      actual: "chromium",
      fallback: null,
    };
  } catch (error) {
    console.warn(
      "Bundled Chromium unavailable; falling back to system Chrome: " + error.message,
    );
    return {
      browser: await chromium.launch({ ...launchOptions, channel: "chrome" }),
      requested: browserName,
      actual: "chrome",
      fallback: serializeError(error),
    };
  }
}

async function createIsolatedContext(
  browser,
  baseUrl,
  { browserInstrumentation = true } = {},
) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    screen: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "no-preference",
    forcedColors: "none",
    locale: "en-CA",
    timezoneId: "America/Toronto",
    serviceWorkers: "block",
  });
  const errors = [];
  context.on("page", (page) => {
    page.on("pageerror", (error) => {
      errors.push({ type: "pageerror", message: error.message });
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push({ type: "console", message: message.text() });
      }
    });
  });
  if (browserInstrumentation) {
    await context.addInitScript({
      content: "(" + installBrowserInstrumentation.toString() + ")();",
    });
  }
  const allowedOrigin = new URL(baseUrl).origin;
  await context.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === allowedOrigin || requestUrl.protocol === "data:") {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });
  return { context, errors };
}

function targetOrder(pairNumber) {
  return pairNumber % 2 === 1
    ? ["baseline", "candidate"]
    : ["candidate", "baseline"];
}

function numericProfileMetrics(summary, kind, actionDurationMs) {
  const metrics = { actionDurationMs };
  if (kind === "cpu" && summary?.cpu) {
    metrics.cpuDurationMs = summary.cpu.durationMs;
    metrics.cpuSampledTimeMs = summary.cpu.sampledTimeMs;
    metrics.cpuSampleCount = summary.cpu.sampleCount;
    for (const [name, value] of Object.entries(summary.cpu.timeBreakdownMs ?? {})) {
      metrics["cpu." + name + "Ms"] = value;
    }
  }
  if (kind === "trace" && summary?.trace) {
    const action = summary.trace.phases?.action ?? null;
    const source = action ?? summary.trace;
    metrics.traceDurationMs = summary.trace.durationMs;
    metrics.traceActionDurationMs = action?.totalMs ?? null;
    metrics["trace.tasks.activeTimeMs"] = source.tasks?.activeTimeMs ?? null;
    metrics["trace.tasks.blockingTimeOver50Ms"] =
      source.tasks?.blockingTimeOver50Ms ?? null;
    for (const [name, values] of Object.entries(source.mainThreadActivity ?? {})) {
      metrics["trace." + name + ".activeTimeMs"] = values.activeTimeMs;
      metrics["trace." + name + ".eventCount"] = values.eventCount;
    }
    for (const [name, values] of Object.entries(source.crossThreadActivity ?? {})) {
      metrics["trace." + name + ".threadActiveTimeMs"] = values.threadActiveTimeMs;
      metrics["trace." + name + ".wallTimeMs"] = values.wallTimeMs;
    }
  }
  if (kind === "allocations" && summary?.allocations) {
    metrics.sampledAllocationBytes = summary.allocations.totalSampledBytes;
    metrics.allocationSampleCount = summary.allocations.sampleEntryCount;
  }
  return Object.fromEntries(
    Object.entries(metrics).filter(([, value]) => Number.isFinite(value)),
  );
}

function summarizeNumbers(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const quantile = (fraction) => {
    const position = (sorted.length - 1) * fraction;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const weight = position - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };
  return {
    count: sorted.length,
    min: sorted[0],
    p25: quantile(0.25),
    median: quantile(0.5),
    p75: quantile(0.75),
    max: sorted.at(-1),
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
  };
}

function aggregatePairs(pairs) {
  const names = new Set();
  for (const pair of pairs) {
    for (const target of ["baseline", "candidate"]) {
      for (const name of Object.keys(pair.targets?.[target]?.metrics ?? {})) names.add(name);
    }
  }
  return Object.fromEntries(
    [...names].sort().map((name) => {
      const baseline = pairs
        .map((pair) => pair.targets?.baseline?.metrics?.[name])
        .filter(Number.isFinite);
      const candidate = pairs
        .map((pair) => pair.targets?.candidate?.metrics?.[name])
        .filter(Number.isFinite);
      const pairedAbsoluteChanges = [];
      const pairedPercentChanges = [];
      for (const pair of pairs) {
        const left = pair.targets?.baseline?.metrics?.[name];
        const right = pair.targets?.candidate?.metrics?.[name];
        if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
        pairedAbsoluteChanges.push(right - left);
        if (left !== 0) pairedPercentChanges.push(((right - left) / left) * 100);
      }
      return [
        name,
        {
          baseline: summarizeNumbers(baseline),
          candidate: summarizeNumbers(candidate),
          pairedAbsoluteChange: summarizeNumbers(pairedAbsoluteChanges),
          pairedPercentChange: summarizeNumbers(pairedPercentChanges),
        },
      ];
    }),
  );
}

function workloadScaleForKind(options, kind) {
  return kind === "trace" ? options.traceWorkloadScale : options.workloadScale;
}

function validateCapture(capture, kind) {
  if (!capture?.manifest || !capture?.summary) {
    throw new Error("Profile capture did not return a manifest and summary");
  }
  if (capture.manifest.captureStatus !== "complete") {
    throw new Error(
      "Profile capture is " + capture.manifest.captureStatus + ", expected complete",
    );
  }
  const requestedKinds = capture.manifest.settings?.kinds ?? [];
  if (requestedKinds.length !== 1 || requestedKinds[0] !== kind) {
    throw new Error(
      "Profile captured " + JSON.stringify(requestedKinds) +
        ", expected only " + JSON.stringify(kind),
    );
  }
  const summaryKey = kind === "allocations" ? "allocations" : kind;
  if (!capture.summary[summaryKey]) {
    throw new Error("Profile summary is missing requested " + kind + " data");
  }
  if (kind === "trace") {
    const action = capture.summary.trace?.phases?.action;
    if (!action || action.count < 1 || !Number.isFinite(action.totalMs)) {
      throw new Error(
        "Trace summary is missing the measured canvas:phase:action interval",
      );
    }
  }
}

async function runTarget({
  browser,
  label,
  baseUrl,
  scenario,
  kind,
  pairNumber,
  order,
  outputDirectory,
  options,
  provenance,
  warmup,
}) {
  const profileContextState = await createIsolatedContext(browser, baseUrl, {
    browserInstrumentation: false,
  });
  const parityContextState = warmup
    ? null
    : await createIsolatedContext(browser, baseUrl, {
        browserInstrumentation: true,
      });
  const actualWorkloadScale = workloadScaleForKind(options, kind);
  const startedAtIso = new Date().toISOString();
  try {
    const execution = await runProfileScenario({
      context: profileContextState.context,
      parityContext: parityContextState?.context ?? null,
      baseUrl,
      outputDirectory,
      name: scenario,
      sections: options.sections,
      workloadScale: actualWorkloadScale,
      expectedSourceIdentity: provenance,
      captureArtifacts: !warmup,
      createCapture: warmup
        ? null
        : async ({ page, url, loadedSourceIdentity }) =>
            startDeepProfile({
              page,
              outputDirectory,
              kinds: [kind],
              cpuSamplingIntervalUs: options.cpuSamplingIntervalUs,
              allocationSamplingIntervalBytes:
                options.allocationSamplingIntervalBytes,
              manifestKind: "canvas-e2e-deep-profile",
              runMetadata: {
                schemaVersion: 1,
                suite: "canvas-e2e-deep-profile",
                diagnosticOnly: true,
                target: label,
                targetProvenance: provenance,
                loadedSourceIdentity,
                scenario,
                profileKind: kind,
                pairNumber,
                order,
                url: new URL(url).pathname + new URL(url).search,
                settings: {
                  sections: options.sections,
                  requestedWorkloadScale: options.workloadScale,
                  requestedTraceWorkloadScale: options.traceWorkloadScale,
                  actualWorkloadScale,
                  cpuSamplingIntervalUs: options.cpuSamplingIntervalUs,
                  allocationSamplingIntervalBytes:
                    options.allocationSamplingIntervalBytes,
                },
                captureBoundary: {
                  startsAfterProfilePrepare: true,
                  containsOnlyProfileAct: true,
                  parityActRunsInSeparateInstrumentedContext: true,
                },
              },
            }),
    });
    if (!warmup) validateCapture(execution.capture, kind);
    const errors = [
      ...profileContextState.errors,
      ...(parityContextState?.errors ?? []),
    ];
    return {
      label,
      status: errors.length === 0 ? "complete" : "page-errors",
      startedAtIso,
      stoppedAtIso: new Date().toISOString(),
      pageErrors: [...errors],
      result: execution.result,
      loadedSourceIdentity: execution.loadedSourceIdentity,
      parityLabel: scenario + ":parity",
      captureDirectory: warmup ? null : outputDirectory,
      captureStatus: execution.capture?.manifest?.captureStatus ?? null,
      metrics: warmup
        ? { actionDurationMs: execution.result.actionDurationMs }
        : numericProfileMetrics(
            execution.capture?.summary,
            kind,
            execution.result.actionDurationMs,
          ),
    };
  } catch (error) {
    const errors = [
      ...profileContextState.errors,
      ...(parityContextState?.errors ?? []),
    ];
    return {
      label,
      status: "error",
      startedAtIso,
      stoppedAtIso: new Date().toISOString(),
      pageErrors: [...errors],
      error: serializeError(error),
      captureDirectory: warmup ? null : outputDirectory,
      metrics: {},
    };
  } finally {
    await Promise.all([
      profileContextState.context.close(),
      parityContextState?.context.close(),
    ]);
  }
}

async function comparePair({ scenario, pairDirectory, targets }) {
  if (!targets.baseline?.result || !targets.candidate?.result) return null;
  const diffDirectory = path.join(pairDirectory, "diffs");
  await fs.mkdir(diffDirectory, { recursive: true });
  const comparison = await compareScenario({
    name: scenario,
    baseline: targets.baseline.result,
    candidate: targets.candidate.result,
    diffDirectory,
    anchorTypes: targets.baseline.result.anchorTypes,
    trajectoryMode: targets.baseline.result.trajectoryMode,
  });
  comparison.performanceGate = false;
  comparison.performanceDiagnosticOnly = true;
  comparison.performanceGateReason =
    "Deep profiling perturbs timing; only strict visual and behavior parity is gated.";
  comparison.parityLabel = scenario + ":parity";
  comparison.parityIsolation =
    "Scenario-local parity reruns in an instrumented context outside profiling.";
  return comparison;
}

function sourceIdentitySummary(identity) {
  return {
    proof: identity.proof,
    root: identity.root,
    source: identity.source,
    git: {
      head: identity.git?.head ?? null,
      sourceTree: identity.git?.sourceTree ?? null,
      sourceDirty: identity.git?.sourceDirty ?? null,
      sourceStatus: identity.git?.sourceStatus ?? [],
    },
  };
}

async function revalidateSourceTargets({
  options,
  startupTargets,
  checkpoint,
}) {
  const [baseline, candidate] = await Promise.all([
    resolveLibraryTarget({
      repositoryRoot,
      libraryRoot: options.baselineRoot,
      libraryLabel: "baseline",
    }),
    resolveLibraryTarget({
      repositoryRoot,
      libraryRoot: options.candidateRoot,
      libraryLabel: "candidate",
    }),
  ]);
  const currentTargets = { baseline, candidate };
  for (const label of ["baseline", "candidate"]) {
    const startup = startupTargets[label].identity;
    const current = currentTargets[label].identity;
    if (
      current.source.hash !== startup.source.hash ||
      current.git?.sourceTree !== startup.git?.sourceTree
    ) {
      throw new Error(
        label + " source changed after profiling started at " + checkpoint +
          ": " + JSON.stringify({
            startupSourceHash: startup.source.hash,
            currentSourceHash: current.source.hash,
            startupGitSourceTree: startup.git?.sourceTree ?? null,
            currentGitSourceTree: current.git?.sourceTree ?? null,
          }),
      );
    }
  }
  return {
    checkpoint,
    checkedAtIso: new Date().toISOString(),
    targets: {
      baseline: sourceIdentitySummary(baseline.identity),
      candidate: sourceIdentitySummary(candidate.identity),
    },
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await fs.mkdir(path.join(options.output, "profiles"), { recursive: true });

  const [baselineTarget, candidateTarget] = await Promise.all([
    resolveLibraryTarget({
      repositoryRoot,
      libraryRoot: options.baselineRoot,
      libraryLabel: "baseline",
    }),
    resolveLibraryTarget({
      repositoryRoot,
      libraryRoot: options.candidateRoot,
      libraryLabel: "candidate",
    }),
  ]);
  const baselineProvenance = baselineTarget.identity;
  const candidateProvenance = candidateTarget.identity;
  if (baselineProvenance.source.hash === candidateProvenance.source.hash) {
    throw new Error(
      "Baseline and candidate have the same source SHA-256 (" +
        baselineProvenance.source.hash +
        "); choose distinct source trees",
    );
  }
  const startupTargets = {
    baseline: baselineTarget,
    candidate: candidateTarget,
  };
  const provenance = {
    baseline: baselineProvenance,
    candidate: candidateProvenance,
  };
  const servers = [];
  let baselineUrl = null;
  let candidateUrl = null;
  const generatedAtIso = new Date().toISOString();
  const manifestPath = path.join(options.output, "manifest.json");
  const reportPath = path.join(options.output, "report.json");
  const settings = {
    scenarios: options.scenarios,
    profileKinds: options.kinds,
    warmupsPerScenarioKind: options.warmups,
    measuredPairsPerScenarioKind: options.repetitions,
    sections: options.sections,
    requestedWorkloadScale: options.workloadScale,
    requestedTraceWorkloadScale: options.traceWorkloadScale,
    actualWorkloadScaleByKind: Object.fromEntries(
      options.kinds.map((kind) => [kind, workloadScaleForKind(options, kind)]),
    ),
    cpuSamplingIntervalUs: options.cpuSamplingIntervalUs,
    allocationSamplingIntervalBytes: options.allocationSamplingIntervalBytes,
    targetOrder:
      "Even counts alternate baseline-first and candidate-first within every scenario/kind.",
    captureMode:
      "One isolated cpu, trace, or allocations capture around profileAct only; parity reruns separately.",
    sourceVerification:
      "Runner-started Vite servers use canonical roots with source-only SHA-256 and Git tree provenance.",
    performanceGate: false,
  };
  const orders = [];
  const groups = [];
  const sourceChecks = [];
  let browser = null;
  let browserLaunch = null;
  let cleanupPromise = Promise.resolve();
  const cleanup = () => {
    cleanupPromise = cleanupPromise.then(() =>
      Promise.all([
        browser?.close().catch(() => undefined),
        ...servers.map((server) => server.stop().catch(() => undefined)),
      ]),
    );
    return cleanupPromise;
  };
  signalCleanup = async (signal) => {
    console.error("Received " + signal + "; stopping browser and Vite children");
    await cleanup();
  };
  const throwIfInterrupted = () => {
    if (receivedSignal) {
      throw new Error("Profile run interrupted by " + receivedSignal);
    }
  };
  const environment = {
    host: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      cpuModel: os.cpus()[0]?.model ?? null,
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
    },
    requested: {
      browser: options.browser,
      headed: options.headed,
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      colorScheme: "light",
      reducedMotion: "no-preference",
      forcedColors: "none",
      locale: "en-CA",
      timezone: "America/Toronto",
      sections: options.sections,
      workloadScale: options.workloadScale,
      traceWorkloadScale: options.traceWorkloadScale,
      cpuSamplingIntervalUs: options.cpuSamplingIntervalUs,
      allocationSamplingIntervalBytes:
        options.allocationSamplingIntervalBytes,
    },
    actual: {
      browser: null,
      browserVersion: null,
      headed: options.headed,
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      locale: "en-CA",
      timezone: "America/Toronto",
      profileContextBrowserInstrumentation: false,
      parityContextBrowserInstrumentation: true,
      workloadScaleByKind: settings.actualWorkloadScaleByKind,
    },
  };

  await writeJson(manifestPath, {
    schemaVersion: 1,
    kind: "canvas-e2e-paired-deep-profile",
    diagnosticOnly: true,
    status: "running",
    generatedAtIso,
    provenance,
    settings,
    environment,
  });

  try {
    throwIfInterrupted();
    if (!baselineUrl) {
      const server = await startFixtureServer({
        libraryRoot: baselineTarget.root,
        libraryIdentity: baselineProvenance,
        port: 4417,
        id: "profile-baseline",
        register: (resource) => servers.push(resource),
      });
      baselineUrl = server.url;
      throwIfInterrupted();
    }
    if (!candidateUrl) {
      const server = await startFixtureServer({
        libraryRoot: candidateTarget.root,
        libraryIdentity: candidateProvenance,
        port: 4418,
        id: "profile-candidate",
        register: (resource) => servers.push(resource),
      });
      candidateUrl = server.url;
      throwIfInterrupted();
    }
    const targets = {
      baseline: {
        baseUrl: baselineUrl,
        provenance: baselineProvenance,
      },
      candidate: {
        baseUrl: candidateUrl,
        provenance: candidateProvenance,
      },
    };

    browserLaunch = await launchBrowser(options.browser, options.headed);
    browser = browserLaunch.browser;
    throwIfInterrupted();
    const browserVersion = browser.version();
    environment.actual.browser = browserLaunch.actual;
    environment.actual.browserVersion = browserVersion;
    environment.actual.browserFallback = browserLaunch.fallback;
    for (const scenario of options.scenarios) {
      for (const kind of options.kinds) {
        const group = {
          scenario,
          profileKind: kind,
          warmups: [],
          pairs: [],
          aggregate: null,
        };
        groups.push(group);
        console.log("Profiling " + scenario + " [" + kind + "]");

        for (let warmupNumber = 1; warmupNumber <= options.warmups; warmupNumber += 1) {
          const order = targetOrder(warmupNumber);
          const orderRecord = {
            scenario,
            profileKind: kind,
            phase: "warmup",
            pairNumber: warmupNumber,
            order,
          };
          orders.push(orderRecord);
          const warmup = { pairNumber: warmupNumber, order, targets: {} };
          for (const label of order) {
            console.log(
              "  warmup " + warmupNumber + "/" + options.warmups + " " + label,
            );
            warmup.targets[label] = await runTarget({
              browser,
              label,
              baseUrl: targets[label].baseUrl,
              scenario,
              kind,
              pairNumber: warmupNumber,
              order,
              outputDirectory: null,
              options,
              provenance: targets[label].provenance,
              warmup: true,
            });
          }
          group.warmups.push(warmup);
        }

        for (let pairNumber = 1; pairNumber <= options.repetitions; pairNumber += 1) {
          const beforeSourceCheck = await revalidateSourceTargets({
            options,
            startupTargets,
            checkpoint:
              scenario + "/" + kind + "/pair-" + pairNumber + ":before",
          });
          sourceChecks.push(beforeSourceCheck);
          const order = targetOrder(pairNumber);
          const pairDirectory = path.join(
            options.output,
            "profiles",
            scenario,
            kind,
            "pair-" + pairNumber,
          );
          const orderRecord = {
            scenario,
            profileKind: kind,
            phase: "measured",
            pairNumber,
            order,
          };
          orders.push(orderRecord);
          const pair = {
            pairNumber,
            order,
            directory: pairDirectory,
            targets: {},
            comparison: null,
            sourceChecks: { before: beforeSourceCheck, after: null },
          };
          for (const label of order) {
            console.log(
              "  pair " + pairNumber + "/" + options.repetitions + " " + label,
            );
            const targetDirectory = path.join(pairDirectory, label);
            pair.targets[label] = await runTarget({
              browser,
              label,
              baseUrl: targets[label].baseUrl,
              scenario,
              kind,
              pairNumber,
              order,
              outputDirectory: targetDirectory,
              options,
              provenance: targets[label].provenance,
              warmup: false,
            });
          }
          const afterSourceCheck = await revalidateSourceTargets({
            options,
            startupTargets,
            checkpoint:
              scenario + "/" + kind + "/pair-" + pairNumber + ":after",
          });
          sourceChecks.push(afterSourceCheck);
          pair.sourceChecks.after = afterSourceCheck;
          pair.comparison = await comparePair({
            scenario,
            pairDirectory,
            targets: pair.targets,
          });
          await writeJson(path.join(pairDirectory, "comparison.json"), {
            schemaVersion: 1,
            diagnosticOnly: true,
            scenario,
            profileKind: kind,
            pairNumber,
            order,
            sourceChecks: pair.sourceChecks,
            targets: pair.targets,
            comparison: pair.comparison,
          });
          group.pairs.push(pair);
          const parity = pair.comparison?.pass ? "parity-pass" : "PARITY-REVIEW";
          console.log("    " + parity);
          await writeJson(path.join(options.output, "report.partial.json"), {
            schemaVersion: 1,
            kind: "canvas-e2e-paired-deep-profile",
            diagnosticOnly: true,
            generatedAtIso,
            provenance,
            settings,
            environment,
            orders,
            sourceChecks,
            groups,
          });
        }
        group.aggregate = aggregatePairs(group.pairs);
      }
    }

    sourceChecks.push(
      await revalidateSourceTargets({
        options,
        startupTargets,
        checkpoint: "finalization",
      }),
    );

    const allPairs = groups.flatMap((group) => group.pairs);
    const parityFailures = allPairs.filter(
      (pair) => pair.comparison && !pair.comparison.pass,
    );
    const captureFailures = [
      ...groups.flatMap((group) =>
        group.warmups.flatMap((warmup) =>
          Object.values(warmup.targets).filter((target) => target.status !== "complete"),
        ),
      ),
      ...allPairs.flatMap((pair) =>
        Object.values(pair.targets).filter(
          (target) =>
            target.status !== "complete" || target.captureStatus !== "complete",
        ),
      ),
    ];
    const report = {
      schemaVersion: 1,
      kind: "canvas-e2e-paired-deep-profile",
      diagnosticOnly: true,
      generatedAtIso,
      completedAtIso: new Date().toISOString(),
      provenance,
      settings,
      environment,
      fixtureUrls: {
        baseline: baselineUrl,
        candidate: candidateUrl,
      },
      orders,
      sourceChecks,
      summary: {
        groupCount: groups.length,
        measuredPairCount: allPairs.length,
        captureCount: allPairs.length * 2,
        parityPass: parityFailures.length === 0,
        parityFailureCount: parityFailures.length,
        capturePass: captureFailures.length === 0,
        captureFailureCount: captureFailures.length,
        performanceGate: false,
      },
      groups,
    };
    await writeJson(reportPath, report);
    await writeJson(manifestPath, {
      schemaVersion: 1,
      kind: "canvas-e2e-paired-deep-profile",
      diagnosticOnly: true,
      status:
        parityFailures.length === 0 && captureFailures.length === 0
          ? "complete"
          : "review",
      generatedAtIso,
      completedAtIso: report.completedAtIso,
      provenance,
      settings,
      environment,
      report: "report.json",
      profiles: "profiles/",
      summary: report.summary,
      orders,
      sourceChecks,
    });
    await fs.unlink(path.join(options.output, "report.partial.json")).catch(() => {});
    console.log("Report: " + reportPath);
    console.log(
      "Parity: " + (report.summary.parityPass ? "PASS" : "REVIEW") +
        "; captures: " + (report.summary.capturePass ? "PASS" : "REVIEW") +
        "; performance gate: disabled",
    );
    if (!report.summary.capturePass) process.exitCode = 1;
    else if (!report.summary.parityPass) process.exitCode = 2;
  } catch (error) {
    const reportedError = receivedSignal
      ? new Error("Profile run interrupted by " + receivedSignal)
      : error;
    await writeJson(manifestPath, {
      schemaVersion: 1,
      kind: "canvas-e2e-paired-deep-profile",
      diagnosticOnly: true,
      status: receivedSignal ? "interrupted" : "failed",
      generatedAtIso,
      completedAtIso: new Date().toISOString(),
      provenance,
      settings,
      environment,
      orders,
      sourceChecks,
      groups,
      signal: receivedSignal,
      error: serializeError(reportedError),
    }).catch(() => undefined);
    throw reportedError;
  } finally {
    await cleanup();
    signalCleanup = null;
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    receivedSignal ??= signal;
    process.exitCode = signal === "SIGINT" ? 130 : 143;
    if (!signalCleanup) {
      return;
    }
    signalCleanupPromise ??= signalCleanup(signal).catch((error) => {
      console.error("Signal cleanup failed: " + (error.stack || error.message || error));
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  });
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
