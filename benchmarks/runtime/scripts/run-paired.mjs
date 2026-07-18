#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveLibraryTarget } from "./library-target.mjs";
import { buildPairedProfileReport } from "./profile-compare.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(scriptDirectory, "..");
const defaultRepositoryRoot = path.resolve(runtimeRoot, "../..");
const runtimeRunner = path.join(scriptDirectory, "run.mjs");

export const PAIRED_CAPTURE_SCHEMA_VERSION = "1.0.0";
export const PROFILE_KINDS = Object.freeze([
  "none",
  "cpu",
  "trace",
  "allocations",
]);

function printHelp() {
  process.stdout.write(`Canvas paired runtime capture runner

Usage:
  node benchmarks/runtime/scripts/run-paired.mjs [options]

Source and output:
  --baseline-root PATH       Reference library worktree (required)
  --candidate-root PATH      Candidate library worktree (default: current repository)
  --output PATH              New or empty artifact directory

Sampling:
  --warmups NUMBER           Even count of unprofiled warmup pairs (default: 2)
  --repetitions NUMBER       Even count of measured pairs (default: 6)
  --profile-kind KIND        none, cpu, trace, or allocations (default: none)
  --port-base NUMBER         First port to probe (default: process-specific)
  --child-timeout-ms NUMBER  Per-invocation process timeout (default: 300000)

Runtime fixture:
  --mode high|medium|low|auto
  --sections NUMBER          1..200 (default: 24)
  --nav-items NUMBER         1..sections (default: min(sections, 8))
  --complexity NUMBER        1..200 (default: 24)
  --intro 0|1                Enable the intro sequence (default: 1)
  --seed NUMBER              Deterministic fixture seed (default: 42)
  --width NUMBER             Override viewport width
  --height NUMBER            Override viewport height
  --timeout NUMBER           Runtime fixture timeout in ms (default: 45000)
  --cpu-sampling-interval-us NUMBER             Default: 1000
  --allocation-sampling-interval-bytes NUMBER   Default: 32768
  --production               Build and serve each target in production mode
  --headed                   Show Chromium
  --help                     Show this help

Each measured target is a separate process and profile capture. The order
alternates BC/CB by pair. Performance differences are diagnostic-only and
never change the exit status; only setup or capture failures do.
`);
}

function parseInteger(value, name, minimum, maximum) {
  if (value == null || value === "") throw new Error(`Missing value for ${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return parsed;
}

function argumentEntries(argv) {
  const entries = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${argument}`);
    }
    const equals = argument.indexOf("=");
    if (equals !== -1) {
      entries.push([argument.slice(2, equals), argument.slice(equals + 1)]);
      continue;
    }
    const key = argument.slice(2);
    if (key === "headed" || key === "production" || key === "help") {
      entries.push([key, "true"]);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    entries.push([key, value]);
    index += 1;
  }
  return entries;
}

export function parseArguments(
  argv,
  {
    repositoryRoot = defaultRepositoryRoot,
    cwd = process.cwd(),
    now = new Date(),
    processId = process.pid,
  } = {},
) {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const options = {
    help: false,
    baselineRoot: null,
    candidateRoot: path.resolve(repositoryRoot),
    output: path.join(os.tmpdir(), `canvas-runtime-paired-${timestamp}`),
    warmups: 2,
    repetitions: 6,
    profileKind: "none",
    portBase: 46_000 + (Math.abs(processId) % 4_000),
    childTimeoutMs: 300_000,
    mode: "high",
    sections: 24,
    navItems: null,
    complexity: 24,
    intro: true,
    seed: 42,
    width: null,
    height: null,
    timeoutMs: 45_000,
    cpuSamplingIntervalUs: 1_000,
    allocationSamplingIntervalBytes: 32_768,
    production: false,
    headed: false,
  };

  const supported = new Set([
    "help",
    "baseline-root",
    "candidate-root",
    "output",
    "warmups",
    "repetitions",
    "profile-kind",
    "profile",
    "port-base",
    "child-timeout-ms",
    "mode",
    "sections",
    "nav-items",
    "complexity",
    "intro",
    "seed",
    "width",
    "height",
    "timeout",
    "cpu-sampling-interval-us",
    "allocation-sampling-interval-bytes",
    "production",
    "headed",
  ]);

  for (const [key, value] of argumentEntries(argv)) {
    if (!supported.has(key)) throw new Error(`Unknown argument: --${key}`);
    if (key === "help") options.help = true;
    else if (key === "baseline-root") options.baselineRoot = path.resolve(cwd, value);
    else if (key === "candidate-root") options.candidateRoot = path.resolve(cwd, value);
    else if (key === "output") options.output = path.resolve(cwd, value);
    else if (key === "warmups") {
      options.warmups = parseInteger(value, "--warmups", 0, 1_000);
    } else if (key === "repetitions") {
      options.repetitions = parseInteger(value, "--repetitions", 1, 1_000);
    } else if (key === "profile-kind" || key === "profile") {
      options.profileKind = value.trim().toLowerCase();
    } else if (key === "port-base") {
      options.portBase = parseInteger(value, "--port-base", 1_024, 65_535);
    } else if (key === "child-timeout-ms") {
      options.childTimeoutMs = parseInteger(
        value,
        "--child-timeout-ms",
        10_000,
        3_600_000,
      );
    } else if (key === "mode") options.mode = value;
    else if (key === "sections") {
      options.sections = parseInteger(value, "--sections", 1, 200);
    } else if (key === "nav-items") {
      options.navItems = parseInteger(value, "--nav-items", 1, 200);
    } else if (key === "complexity") {
      options.complexity = parseInteger(value, "--complexity", 1, 200);
    } else if (key === "intro") {
      if (value !== "0" && value !== "1") {
        throw new Error("--intro must be 0 or 1");
      }
      options.intro = value === "1";
    } else if (key === "seed") {
      options.seed = parseInteger(value, "--seed", 0, 2_147_483_647);
    } else if (key === "width") {
      options.width = parseInteger(value, "--width", 320, 3_840);
    } else if (key === "height") {
      options.height = parseInteger(value, "--height", 320, 2_160);
    } else if (key === "timeout") {
      options.timeoutMs = parseInteger(value, "--timeout", 5_000, 180_000);
    } else if (key === "cpu-sampling-interval-us") {
      options.cpuSamplingIntervalUs = parseInteger(
        value,
        "--cpu-sampling-interval-us",
        100,
        1_000_000,
      );
    } else if (key === "allocation-sampling-interval-bytes") {
      options.allocationSamplingIntervalBytes = parseInteger(
        value,
        "--allocation-sampling-interval-bytes",
        1_024,
        16_777_216,
      );
    } else if (key === "production") {
      options.production = value !== "false" && value !== "0";
    } else if (key === "headed") options.headed = true;
  }

  if (options.help) return options;
  if (!options.baselineRoot) {
    throw new Error("--baseline-root is required");
  }
  if (options.warmups % 2 !== 0) {
    throw new Error("--warmups must be zero or even so target order is balanced");
  }
  if (options.repetitions % 2 !== 0) {
    throw new Error("--repetitions must be even so target order is balanced");
  }
  if (!PROFILE_KINDS.includes(options.profileKind)) {
    throw new Error(
      `--profile-kind must be one of ${PROFILE_KINDS.join(", ")}; combined captures are intentionally unsupported`,
    );
  }
  if (!new Set(["auto", "high", "medium", "low"]).has(options.mode)) {
    throw new Error("--mode must be auto, high, medium, or low");
  }
  options.navItems ??= Math.min(options.sections, 8);
  if (options.navItems > options.sections) {
    throw new Error("--nav-items must not exceed --sections");
  }
  return options;
}

export function targetOrder(pairNumber) {
  if (!Number.isSafeInteger(pairNumber) || pairNumber < 1) {
    throw new Error("pairNumber must be a positive integer");
  }
  return pairNumber % 2 === 1
    ? ["baseline", "candidate"]
    : ["candidate", "baseline"];
}

export function createPairSchedule({ warmups, repetitions }) {
  if (!Number.isSafeInteger(warmups) || warmups < 0 || warmups % 2 !== 0) {
    throw new Error("warmups must be a non-negative even integer");
  }
  if (
    !Number.isSafeInteger(repetitions) ||
    repetitions < 2 ||
    repetitions % 2 !== 0
  ) {
    throw new Error("repetitions must be a positive even integer");
  }
  const schedule = [];
  for (let pairNumber = 1; pairNumber <= warmups; pairNumber += 1) {
    schedule.push({
      phase: "warmup",
      pairNumber,
      order: targetOrder(pairNumber),
    });
  }
  for (let pairNumber = 1; pairNumber <= repetitions; pairNumber += 1) {
    schedule.push({
      phase: "measured",
      pairNumber,
      order: targetOrder(pairNumber),
    });
  }
  return schedule;
}

export function parseObservedLibraryIdentity(stderr) {
  if (typeof stderr !== "string") return null;
  const match = stderr.match(
    /^\[library\] (.*) ([0-9a-f]{64}) \(([0-9a-f]{64})\)$/m,
  );
  if (!match) return null;
  return {
    label: match[1],
    proof: match[2],
    sourceHash: match[3],
  };
}

export function observedLibraryIdentityFromResult(result) {
  const observed = result?.library?.observed;
  const sourceHash = observed?.source?.hash;
  if (
    !observed ||
    typeof observed.label !== "string" ||
    typeof observed.proof !== "string" ||
    typeof sourceHash !== "string"
  ) {
    return null;
  }
  return {
    label: observed.label,
    proof: observed.proof,
    sourceHash,
  };
}

export function assertObservedLibraryIdentity(expected, observed) {
  if (!observed) {
    throw new Error("Runtime runner did not report the loaded library identity");
  }
  if (
    observed.label !== expected.label ||
    observed.proof !== expected.proof ||
    observed.sourceHash !== expected.source.hash
  ) {
    throw new Error(
      `Loaded library identity mismatch: expected ${expected.label} ${expected.proof} (${expected.source.hash}), received ${observed.label} ${observed.proof} (${observed.sourceHash})`,
    );
  }
  return true;
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

async function revalidateSourceTargets({ options, startupTargets, checkpoint }) {
  const [baseline, candidate] = await Promise.all([
    resolveLibraryTarget({
      repositoryRoot: defaultRepositoryRoot,
      libraryRoot: options.baselineRoot,
      libraryLabel: "baseline",
    }),
    resolveLibraryTarget({
      repositoryRoot: defaultRepositoryRoot,
      libraryRoot: options.candidateRoot,
      libraryLabel: "candidate",
    }),
  ]);
  const currentTargets = { baseline, candidate };
  for (const label of ["baseline", "candidate"]) {
    const startup = startupTargets[label].identity;
    const current = currentTargets[label].identity;
    if (
      current.proof !== startup.proof ||
      current.source.hash !== startup.source.hash ||
      current.git?.sourceTree !== startup.git?.sourceTree
    ) {
      throw new Error(
        `${label} source identity changed at ${checkpoint}: ${JSON.stringify({
          startupProof: startup.proof,
          currentProof: current.proof,
          startupSourceHash: startup.source.hash,
          currentSourceHash: current.source.hash,
          startupGitSourceTree: startup.git?.sourceTree ?? null,
          currentGitSourceTree: current.git?.sourceTree ?? null,
        })}`,
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
  return { name: "Error", message: String(error), stack: null, cause: null };
}

function relativeArtifact(output, artifact) {
  return path.relative(output, artifact).split(path.sep).join("/");
}

async function writeJsonAtomic(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filename);
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

async function readJsonIfPresent(filename) {
  try {
    return await readJson(filename);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function prepareOutputDirectory(output) {
  await mkdir(path.dirname(output), { recursive: true });
  try {
    await mkdir(output);
    return;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const details = await stat(output);
  if (!details.isDirectory()) {
    throw new Error(`Output path is not a directory: ${output}`);
  }
  const entries = await readdir(output);
  if (entries.length > 0) {
    throw new Error(
      `Output directory is not empty; refusing to overwrite captures: ${output}`,
    );
  }
}

async function portIsAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        resolve(false);
      } else {
        reject(error);
      }
    });
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

export function createPortAllocator(portBase) {
  const used = new Set();
  let next = portBase;
  return async function allocatePort() {
    for (let attempts = 0; attempts < 64_512; attempts += 1) {
      const candidate = next;
      next = candidate === 65_535 ? 1_024 : candidate + 1;
      if (used.has(candidate)) continue;
      if (!(await portIsAvailable(candidate))) continue;
      used.add(candidate);
      return candidate;
    }
    throw new Error("Unable to find an unused local port for a runtime capture");
  };
}

function signalProcessTree(child, signal) {
  if (!child?.pid) return false;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
    return true;
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
    return false;
  }
}

async function taskkillProcessTree(child, { force = false } = {}) {
  if (!child?.pid) return false;
  return new Promise((resolve) => {
    const arguments_ = ["/PID", String(child.pid), "/T"];
    if (force) arguments_.push("/F");
    const killer = spawn("taskkill", arguments_, {
      stdio: "ignore",
      windowsHide: true,
    });
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    killer.once("error", () => {
      try {
        child.kill(force ? "SIGKILL" : "SIGTERM");
      } catch {
        // The direct child may already have exited.
      }
      settle(false);
    });
    killer.once("close", (code) => settle(code === 0));
  });
}

function processTreeIsRunning(child) {
  if (!child?.pid) return false;
  if (process.platform === "win32") {
    return child.exitCode == null && child.signalCode == null;
  }
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

async function waitForProcessTreeExit(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (processTreeIsRunning(child)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

class ChildSupervisor {
  constructor() {
    this.children = new Set();
    this.terminations = new Map();
  }

  add(child) {
    this.children.add(child);
  }

  delete(child) {
    this.children.delete(child);
  }

  async terminate(child, graceMs = 3_000) {
    if (!child?.pid) return;
    const existing = this.terminations.get(child);
    if (existing) return existing;
    const termination = (async () => {
      if (process.platform === "win32") {
        await taskkillProcessTree(child);
        if (await waitForProcessTreeExit(child, graceMs)) return;
        await taskkillProcessTree(child, { force: true });
        if (!(await waitForProcessTreeExit(child, 1_000))) {
          throw new Error(`Could not terminate runtime process tree ${child.pid}`);
        }
        return;
      }
      if (!processTreeIsRunning(child)) return;
      signalProcessTree(child, "SIGTERM");
      if (await waitForProcessTreeExit(child, graceMs)) return;
      signalProcessTree(child, "SIGKILL");
      if (!(await waitForProcessTreeExit(child, 1_000))) {
        throw new Error(`Could not terminate runtime process group ${child.pid}`);
      }
    })().finally(() => this.terminations.delete(child));
    this.terminations.set(child, termination);
    return termination;
  }

  async terminateAll() {
    await Promise.all([...this.children].map((child) => this.terminate(child)));
  }
}

function runtimeArguments(options) {
  const arguments_ = [
    "--mode",
    options.mode,
    "--sections",
    String(options.sections),
    "--nav-items",
    String(options.navItems),
    "--complexity",
    String(options.complexity),
    "--intro",
    options.intro ? "1" : "0",
    "--seed",
    String(options.seed),
    "--timeout",
    String(options.timeoutMs),
    "--cpu-sampling-interval-us",
    String(options.cpuSamplingIntervalUs),
    "--allocation-sampling-interval-bytes",
    String(options.allocationSamplingIntervalBytes),
  ];
  if (options.width != null) arguments_.push("--width", String(options.width));
  if (options.height != null) arguments_.push("--height", String(options.height));
  if (options.production) arguments_.push("--production");
  if (options.headed) arguments_.push("--headed");
  return arguments_;
}

function invocationDirectory(options, invocation) {
  const phaseDirectory = invocation.phase === "warmup" ? "warmups" : "pairs";
  const pair = `pair-${String(invocation.pairNumber).padStart(3, "0")}`;
  const target = `${String(invocation.position).padStart(2, "0")}-${invocation.label}`;
  return path.join(options.output, phaseDirectory, pair, target);
}

async function runInvocation({
  options,
  invocation,
  target,
  port,
  supervisor,
  abortSignal,
}) {
  const directory = invocationDirectory(options, invocation);
  const resultPath = path.join(directory, "result.json");
  const stdoutPath = path.join(directory, "stdout.log");
  const stderrPath = path.join(directory, "stderr.log");
  const profileDirectory = path.join(directory, "profile");
  const invocationPath = path.join(directory, "invocation.json");
  const selectedProfileKind =
    invocation.phase === "measured" ? options.profileKind : "none";
  const runId = [
    "paired-runtime",
    invocation.phase,
    String(invocation.pairNumber).padStart(3, "0"),
    String(invocation.position).padStart(2, "0"),
    invocation.label,
  ].join("-");
  const arguments_ = [
    runtimeRunner,
    "--library-root",
    target.root,
    "--library-label",
    invocation.label,
    "--port",
    String(port),
    "--run-id",
    runId,
    "--output",
    resultPath,
    ...runtimeArguments(options),
  ];
  if (selectedProfileKind !== "none") {
    arguments_.push(
      "--profile",
      selectedProfileKind,
      "--profile-dir",
      profileDirectory,
    );
  }

  await mkdir(directory, { recursive: true });
  const startedAtIso = new Date().toISOString();
  const startedAt = Date.now();
  const initialRecord = {
    schemaVersion: PAIRED_CAPTURE_SCHEMA_VERSION,
    kind: "canvas-runtime-paired-invocation",
    diagnosticOnly: true,
    performanceGate: false,
    status: "running",
    phase: invocation.phase,
    pairNumber: invocation.pairNumber,
    position: invocation.position,
    order: invocation.order,
    label: invocation.label,
    port,
    runId,
    profileKind: selectedProfileKind,
    startedAtIso,
    expectedLibrary: target.identity,
    command: {
      executable: process.execPath,
      workingDirectory: defaultRepositoryRoot,
      arguments: [...arguments_],
    },
  };
  await writeJsonAtomic(invocationPath, initialRecord);

  let child = null;
  let stdoutHandle = null;
  let stderrHandle = null;
  let processOutcome = null;
  let timedOut = false;
  let timer = null;
  let failure = null;

  try {
    if (abortSignal?.aborted) throw abortSignal.reason ?? new Error("Interrupted");
    [stdoutHandle, stderrHandle] = await Promise.all([
      open(stdoutPath, "w"),
      open(stderrPath, "w"),
    ]);
    child = spawn(process.execPath, arguments_, {
      cwd: defaultRepositoryRoot,
      detached: process.platform !== "win32",
      stdio: ["ignore", stdoutHandle.fd, stderrHandle.fd],
    });
    supervisor.add(child);
    timer = setTimeout(() => {
      timedOut = true;
      void supervisor.terminate(child).catch((error) => {
        failure ??= error;
      });
    }, options.childTimeoutMs);
    processOutcome = await new Promise((resolve) => {
      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      child.once("error", (error) => settle({ error, code: null, signal: null }));
      child.once("close", (code, signal) => settle({ error: null, code, signal }));
    });
  } catch (error) {
    failure = error;
  } finally {
    if (timer) clearTimeout(timer);
    if (child) {
      await supervisor.terminate(child).catch((error) => {
        failure ??= error;
      });
      supervisor.delete(child);
    }
    await Promise.all([
      stdoutHandle?.close().catch(() => {}),
      stderrHandle?.close().catch(() => {}),
    ]);
  }

  let result = null;
  let stderr = "";
  let observedLibrary = null;
  let libraryIdentityEvidence = null;
  let profileManifest = null;
  let profileSummary = null;
  let libraryIdentityVerified = false;
  try {
    [result, stderr] = await Promise.all([
      readJsonIfPresent(resultPath),
      readFile(stderrPath, "utf8").catch((error) =>
        error?.code === "ENOENT" ? "" : Promise.reject(error),
      ),
    ]);
    observedLibrary = observedLibraryIdentityFromResult(result);
    if (observedLibrary) {
      libraryIdentityEvidence = "result.json";
      if (result.library.verified !== true) {
        throw new Error("Runtime result did not mark its library identity verified");
      }
    } else {
      observedLibrary = parseObservedLibraryIdentity(stderr);
      if (observedLibrary) libraryIdentityEvidence = "stderr.log";
    }
    assertObservedLibraryIdentity(target.identity, observedLibrary);
    libraryIdentityVerified = true;
    if (!result) throw new Error("Runtime invocation did not write result.json");
    if (result.status !== "complete") {
      throw new Error(`Runtime result status was ${result.status ?? "missing"}`);
    }
    const expectedConfig = {
      runId,
      sectionCount: options.sections,
      navItemCount: options.navItems,
      sectionComplexity: options.complexity,
      requestedMode: options.mode,
      introEnabled: options.intro,
      autorun: false,
      seed: options.seed,
    };
    if (result.runId !== runId) {
      throw new Error(
        `Runtime result.runId was ${JSON.stringify(result.runId)}, expected ${JSON.stringify(runId)}`,
      );
    }
    for (const [key, expected] of Object.entries(expectedConfig)) {
      if (!Object.is(result.config?.[key], expected)) {
        throw new Error(
          `Runtime result.config.${key} was ${JSON.stringify(result.config?.[key])}, expected ${JSON.stringify(expected)}`,
        );
      }
    }
    const expectedExecution = options.production
      ? {
          serverMode: "production-bundle",
          reactRuntime: "production-profiling",
          sourceMaps: true,
        }
      : {
          serverMode: "development-server",
          reactRuntime: "development",
          sourceMaps: false,
        };
    for (const [key, expected] of Object.entries(expectedExecution)) {
      if (result.execution?.[key] !== expected) {
        throw new Error(
          `Runtime execution.${key} was ${JSON.stringify(result.execution?.[key])}, expected ${JSON.stringify(expected)}`,
        );
      }
    }
    if (selectedProfileKind !== "none") {
      [profileManifest, profileSummary] = await Promise.all([
        readJsonIfPresent(path.join(profileDirectory, "manifest.json")),
        readJsonIfPresent(path.join(profileDirectory, "summary.json")),
      ]);
      if (!profileManifest) throw new Error("Profile manifest was not written");
      if (profileManifest.captureStatus !== "complete") {
        throw new Error(
          `Profile capture status was ${profileManifest.captureStatus ?? "missing"}`,
        );
      }
      const profiledLibrary = profileManifest.runMetadata?.library;
      if (profiledLibrary?.proof !== target.identity.proof) {
        throw new Error("Profile manifest library proof does not match the target");
      }
      const capturedKinds = profileManifest.settings?.kinds;
      if (
        !Array.isArray(capturedKinds) ||
        capturedKinds.length !== 1 ||
        capturedKinds[0] !== selectedProfileKind
      ) {
        throw new Error("Profile manifest does not contain the requested isolated kind");
      }
      const profileRun = profileManifest.runMetadata;
      const expectedProfileRun = {
        runId,
        mode: options.mode,
        sections: options.sections,
        navItems: options.navItems,
        complexity: options.complexity,
        seed: options.seed,
      };
      for (const [key, expected] of Object.entries(expectedProfileRun)) {
        if (!Object.is(profileRun?.[key], expected)) {
          throw new Error(
            `Profile manifest runMetadata.${key} was ${JSON.stringify(profileRun?.[key])}, expected ${JSON.stringify(expected)}`,
          );
        }
      }
      for (const key of ["serverMode", "sourceMaps"]) {
        if (!Object.is(profileRun?.execution?.[key], expectedExecution[key])) {
          throw new Error(
            `Profile manifest execution.${key} was ${JSON.stringify(profileRun?.execution?.[key])}, expected ${JSON.stringify(expectedExecution[key])}`,
          );
        }
      }
      if (!profileSummary) throw new Error("Profile summary was not written");
      if (profileSummary.captureStatus !== "complete") {
        throw new Error(
          `Profile summary capture status was ${profileSummary.captureStatus ?? "missing"}`,
        );
      }
      if (!profileSummary[selectedProfileKind]) {
        throw new Error(
          `Profile summary is missing requested ${selectedProfileKind} data`,
        );
      }
    }
  } catch (error) {
    failure ??= error;
  }

  if (timedOut) {
    failure ??= new Error(
      `Runtime invocation exceeded ${options.childTimeoutMs}ms`,
    );
  }
  if (processOutcome?.error) failure ??= processOutcome.error;
  if (processOutcome && processOutcome.code !== 0) {
    failure ??= new Error(
      `Runtime invocation exited with ${processOutcome.code ?? processOutcome.signal ?? "unknown status"}`,
    );
  }
  if (!processOutcome) {
    failure ??= new Error("Runtime invocation did not start");
  }
  if (abortSignal?.aborted) {
    failure ??= abortSignal.reason ?? new Error("Interrupted");
  }

  const record = {
    ...initialRecord,
    status: failure ? (abortSignal?.aborted ? "interrupted" : "error") : "complete",
    stoppedAtIso: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    timedOut,
    exit: {
      code: processOutcome?.code ?? null,
      signal: processOutcome?.signal ?? null,
      error: serializeError(processOutcome?.error),
    },
    error: serializeError(failure),
    observedLibrary,
    libraryIdentityVerified,
    libraryIdentityEvidence,
    benchmarkStatus: result?.status ?? null,
    execution: result?.execution ?? null,
    artifacts: {
      invocation: relativeArtifact(options.output, invocationPath),
      result: result ? relativeArtifact(options.output, resultPath) : null,
      stdout: relativeArtifact(options.output, stdoutPath),
      stderr: relativeArtifact(options.output, stderrPath),
      profile:
        selectedProfileKind === "none"
          ? null
          : relativeArtifact(options.output, profileDirectory),
      profileManifest:
        profileManifest == null
          ? null
          : relativeArtifact(options.output, path.join(profileDirectory, "manifest.json")),
      profileSummary:
        profileSummary == null
          ? null
          : relativeArtifact(options.output, path.join(profileDirectory, "summary.json")),
    },
  };
  await writeJsonAtomic(invocationPath, record);
  return record;
}

function environmentMetadata() {
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    cpuModel: os.cpus()[0]?.model ?? null,
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  };
}

function publicSettings(options) {
  return {
    warmupPairs: options.warmups,
    measuredPairs: options.repetitions,
    measuredProfileKind: options.profileKind,
    warmupProfileKind: "none",
    childTimeoutMs: options.childTimeoutMs,
    mode: options.mode,
    sections: options.sections,
    navItems: options.navItems,
    complexity: options.complexity,
    intro: options.intro,
    seed: options.seed,
    viewportOverride: {
      width: options.width,
      height: options.height,
    },
    runtimeTimeoutMs: options.timeoutMs,
    cpuSamplingIntervalUs: options.cpuSamplingIntervalUs,
    allocationSamplingIntervalBytes:
      options.allocationSamplingIntervalBytes,
    production: options.production,
    expectedExecution: options.production
      ? {
          serverMode: "production-bundle",
          reactRuntime: "production-profiling",
          sourceMaps: true,
        }
      : {
          serverMode: "development-server",
          reactRuntime: "development",
          sourceMaps: false,
        },
    profilingRuntimeNote: options.production
      ? "Uses the official react-dom/profiling production runtime so commit timings remain observable; its overhead is present in both targets."
      : null,
    headed: options.headed,
    order:
      "Odd pairs run baseline then candidate; even pairs run candidate then baseline.",
    captureIsolation:
      "Every target invocation starts a fresh run.mjs, Vite server, browser, and optional single-kind profiler.",
    sourceVerification:
      "Source-only SHA-256/Git provenance is resolved before capture and run.mjs verifies the page-exposed proof after navigation.",
    performanceGate: false,
  };
}

function reportDocument(state) {
  const completed = [...state.warmups, ...state.pairs].flatMap((pair) =>
    Object.values(pair.targets),
  );
  const completeCount = completed.filter(
    (invocation) => invocation.status === "complete",
  ).length;
  const errorCount = completed.filter(
    (invocation) => invocation.status !== "complete",
  ).length;
  return {
    schemaVersion: PAIRED_CAPTURE_SCHEMA_VERSION,
    kind: "canvas-runtime-paired-capture",
    diagnosticOnly: true,
    performanceGate: false,
    visualParityEvaluated: false,
    status: state.status,
    generatedAtIso: state.generatedAtIso,
    updatedAtIso: new Date().toISOString(),
    completedAtIso: state.completedAtIso,
    provenance: state.provenance,
    settings: state.settings,
    environment: state.environment,
    comparison: state.comparison,
    sourceChecks: state.sourceChecks,
    warnings: state.warnings,
    error: state.error,
    progress: {
      completedInvocationCount: completed.length,
      successfulInvocationCount: completeCount,
      failedInvocationCount: errorCount,
      totalInvocationCount: state.totalInvocationCount,
      current: state.current,
    },
    warmups: state.warmups,
    pairs: state.pairs,
  };
}

async function checkpoint(state) {
  await writeJsonAtomic(
    path.join(state.output, "checkpoint.json"),
    reportDocument(state),
  );
}

async function buildComparison(state) {
  const runs = [];
  const execution = state.settings.expectedExecution;
  const caseName = `${execution.reactRuntime}-${state.settings.mode}-${state.settings.measuredProfileKind}`;
  for (const pair of state.pairs) {
    for (const target of ["baseline", "candidate"]) {
      const invocation = pair.targets[target];
      if (!invocation || invocation.status !== "complete") continue;
      const resultPath = invocation.artifacts.result
        ? path.join(state.output, invocation.artifacts.result)
        : null;
      const profileDirectory = invocation.artifacts.profile
        ? path.join(state.output, invocation.artifacts.profile)
        : null;
      const [runtimeResult, profileSummary] = await Promise.all([
        resultPath ? readJson(resultPath) : null,
        profileDirectory
          ? readJsonIfPresent(path.join(profileDirectory, "summary.json"))
          : null,
      ]);
      runs.push({
        caseName,
        pairIndex: pair.pairNumber,
        target,
        orderIndex: invocation.position,
        profileDirectory: profileDirectory
          ? relativeArtifact(state.output, profileDirectory)
          : null,
        profileDirectoryAbsolute: profileDirectory,
        runtimeResult,
        profileSummary,
      });
    }
  }

  const comparison = buildPairedProfileReport({
    targets: {
      baseline: state.provenance.baseline,
      candidate: state.provenance.candidate,
    },
    cases: [
      {
        name: caseName,
        mode: state.settings.mode,
        sections: state.settings.sections,
        navItems: state.settings.navItems,
        complexity: state.settings.complexity,
        profileKind: state.settings.measuredProfileKind,
        production: state.settings.production,
        execution,
        profilingRuntimeNote: state.settings.profilingRuntimeNote,
      },
    ],
    runs,
    settings: {
      baselineTarget: "baseline",
      candidateTarget: "candidate",
      bootstrapIterations: 10_000,
      bootstrapSeed: 0x5eedc0de,
      minimumPairs: 5,
    },
    environment: state.environment,
  });
  const artifact = path.join(state.output, "comparison.json");
  await writeJsonAtomic(artifact, comparison);
  return {
    artifact: relativeArtifact(state.output, artifact),
    summary: comparison.summary,
    caseClassifications: Object.fromEntries(
      comparison.cases.map((entry) => [entry.name, entry.classifications]),
    ),
  };
}

export async function runPairedCapture(
  options,
  { supervisor = new ChildSupervisor(), abortSignal = null } = {},
) {
  await prepareOutputDirectory(options.output);
  const generatedAtIso = new Date().toISOString();
  const [baseline, candidate] = await Promise.all([
    resolveLibraryTarget({
      repositoryRoot: defaultRepositoryRoot,
      libraryRoot: options.baselineRoot,
      libraryLabel: "baseline",
    }),
    resolveLibraryTarget({
      repositoryRoot: defaultRepositoryRoot,
      libraryRoot: options.candidateRoot,
      libraryLabel: "candidate",
    }),
  ]);
  const schedule = createPairSchedule(options);
  const warnings = [
    "This suite does not apply a performance regression gate; inspect comparison.json and the raw paired distributions.",
    "Profiling perturbs the measured workload, so cpu, trace, and allocations captures must be compared only with the same isolated profile kind.",
    "Warmup results are preserved but are never included as measured repetitions.",
    "This runtime suite does not evaluate pixels or animation parity; use the paired E2E suite for strict visual and behavior checks.",
  ];
  if (options.production) {
    warnings.push(
      "Production captures use the official react-dom/profiling runtime. Its measurement overhead is symmetric across baseline and candidate but absolute timings are not equivalent to an uninstrumented production React build.",
    );
  }
  if (baseline.identity.source.hash === candidate.identity.source.hash) {
    throw new Error(
      "Baseline and candidate source hashes are identical; select a distinct historical baseline",
    );
  }
  const state = {
    output: options.output,
    status: "running",
    generatedAtIso,
    completedAtIso: null,
    provenance: {
      baseline: baseline.identity,
      candidate: candidate.identity,
    },
    settings: publicSettings(options),
    environment: environmentMetadata(),
    comparison: null,
    sourceChecks: [],
    warnings,
    error: null,
    current: null,
    totalInvocationCount: schedule.length * 2,
    warmups: [],
    pairs: [],
  };
  const targets = { baseline, candidate };
  const allocatePort = createPortAllocator(options.portBase);
  await checkpoint(state);

  try {
    for (const scheduledPair of schedule) {
      if (abortSignal?.aborted) {
        throw abortSignal.reason ?? new Error("Interrupted");
      }
      const beforeSourceCheck = await revalidateSourceTargets({
        options,
        startupTargets: targets,
        checkpoint: `${scheduledPair.phase}/pair-${scheduledPair.pairNumber}:before`,
      });
      state.sourceChecks.push(beforeSourceCheck);
      const pair = {
        pairNumber: scheduledPair.pairNumber,
        order: [...scheduledPair.order],
        targets: {},
        sourceChecks: { before: beforeSourceCheck, after: null },
      };
      const collection =
        scheduledPair.phase === "warmup" ? state.warmups : state.pairs;
      collection.push(pair);

      for (let index = 0; index < scheduledPair.order.length; index += 1) {
        const label = scheduledPair.order[index];
        const invocation = {
          ...scheduledPair,
          label,
          position: index + 1,
        };
        const port = await allocatePort();
        state.current = {
          phase: invocation.phase,
          pairNumber: invocation.pairNumber,
          order: invocation.order,
          label,
          position: invocation.position,
          port,
        };
        await checkpoint(state);
        const record = await runInvocation({
          options,
          invocation,
          target: targets[label],
          port,
          supervisor,
          abortSignal,
        });
        pair.targets[label] = record;
        state.current = null;
        await checkpoint(state);
        if (record.status !== "complete") {
          throw new Error(
            `${invocation.phase} pair ${invocation.pairNumber} ${label} capture failed: ${record.error?.message ?? "unknown error"}`,
          );
        }
      }
      const afterSourceCheck = await revalidateSourceTargets({
        options,
        startupTargets: targets,
        checkpoint: `${scheduledPair.phase}/pair-${scheduledPair.pairNumber}:after`,
      });
      state.sourceChecks.push(afterSourceCheck);
      pair.sourceChecks.after = afterSourceCheck;
      await checkpoint(state);
    }

    state.comparison = await buildComparison(state);
    state.status = "complete";
    state.completedAtIso = new Date().toISOString();
    state.current = null;
    const report = reportDocument(state);
    await writeJsonAtomic(path.join(options.output, "report.json"), report);
    await checkpoint(state);
    return report;
  } catch (error) {
    state.status = abortSignal?.aborted ? "interrupted" : "failed";
    state.completedAtIso = new Date().toISOString();
    state.current = null;
    state.error = serializeError(error);
    const report = reportDocument(state);
    await writeJsonAtomic(path.join(options.output, "report.json"), report);
    await checkpoint(state);
    throw error;
  } finally {
    await supervisor.terminateAll();
  }
}

function installSignalHandlers(supervisor, abortController) {
  let receivedSignal = null;
  const handlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => {
      if (receivedSignal) return;
      receivedSignal = signal;
      abortController.abort(new Error(`Received ${signal}`));
      void supervisor.terminateAll().catch(() => undefined);
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  return {
    receivedSignal: () => receivedSignal,
    remove() {
      for (const [signal, handler] of handlers) process.off(signal, handler);
    },
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const supervisor = new ChildSupervisor();
  const abortController = new AbortController();
  const signalHandlers = installSignalHandlers(supervisor, abortController);
  try {
    const report = await runPairedCapture(options, {
      supervisor,
      abortSignal: abortController.signal,
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          status: report.status,
          output: options.output,
          measuredPairs: report.pairs.length,
          profileKind: options.profileKind,
          performanceGate: false,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    signalHandlers.remove();
    const signal = signalHandlers.receivedSignal();
    if (signal) process.exitCode = signal === "SIGINT" ? 130 : 143;
  }
}

const invokedDirectly =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : error}\n`,
    );
    if (!process.exitCode) process.exitCode = 1;
  });
}
