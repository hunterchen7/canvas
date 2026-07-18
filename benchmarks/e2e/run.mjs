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
import { allScenarioNames, runScenarios } from "./scenarios.mjs";
import { STRICT_PARITY_THRESHOLDS } from "./thresholds.mjs";
import { resolveLibraryTarget } from "../runtime/scripts/library-target.ts";
import { createPortAllocator } from "../runtime/scripts/run-paired.ts";
import {
  assertDistinctSourceTargets,
  assertStableSourceTargets,
  evaluateRunOutcome,
  sourceIdentitySummary,
  validateSourceSelection,
} from "./runner-helpers.mjs";
import { stopChildProcessTree } from "./process-tree.mjs";

const e2eRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(e2eRoot, "../..");
const viteBin = path.join(repositoryRoot, "node_modules/vite/bin/vite.js");
const viteConfig = path.join(e2eRoot, "vite.config.mjs");

function printHelp() {
  console.log(`Canvas browser parity/performance runner

Usage:
  node benchmarks/e2e/run.mjs [options]

Options:
  --baseline-root PATH       Reference library worktree (required for local runs)
  --candidate-root PATH      Candidate library worktree (default: current repository)
  --baseline-url URL         Explicit baseline fixture (requires --candidate-url)
  --candidate-url URL        Explicit candidate fixture (requires --baseline-url)
  --output PATH              Artifact directory
  --scenarios LIST           Comma-separated scenarios (${allScenarioNames.join(",")})
  --sections NUMBER          Extra stress CanvasComponents, 0-250 (default: 0)
  --browser chromium|chrome  Bundled Chromium or system Chrome (default: chromium)
  --headed                   Show the browser
  --trace                    Record Playwright screenshots and DOM snapshots
  --fail-on-perf-regression  Fail in addition to reporting noisy performance regressions
  --help                     Show this help
`);
}

function parseArguments(argv) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const options = {
    candidateRoot: repositoryRoot,
    baselineRoot: null,
    candidateRootProvided: false,
    baselineRootProvided: false,
    baselineUrl: null,
    candidateUrl: null,
    output: path.join(e2eRoot, "artifacts", timestamp),
    scenarios: [...allScenarioNames],
    sections: 0,
    browser: "chromium",
    headed: false,
    trace: false,
    failOnPerfRegression: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`Missing value for ${argument}`);
      index += 1;
      return next;
    };
    if (argument === "--help") {
      printHelp();
      process.exit(0);
    } else if (argument === "--baseline-root") {
      options.baselineRoot = path.resolve(value());
      options.baselineRootProvided = true;
    } else if (argument === "--candidate-root") {
      options.candidateRoot = path.resolve(value());
      options.candidateRootProvided = true;
    } else if (argument === "--baseline-url") options.baselineUrl = value();
    else if (argument === "--candidate-url") options.candidateUrl = value();
    else if (argument === "--output") options.output = path.resolve(value());
    else if (argument === "--scenarios") options.scenarios = value().split(",").filter(Boolean);
    else if (argument === "--sections") options.sections = Number(value());
    else if (argument === "--browser") options.browser = value();
    else if (argument === "--headed") options.headed = true;
    else if (argument === "--trace") options.trace = true;
    else if (argument === "--fail-on-perf-regression") options.failOnPerfRegression = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }

  options.sections = Math.max(0, Math.min(250, Math.trunc(options.sections || 0)));
  const unknown = options.scenarios.filter((name) => !allScenarioNames.includes(name));
  if (unknown.length > 0) throw new Error(`Unknown scenarios: ${unknown.join(", ")}`);
  if (!new Set(["chromium", "chrome"]).has(options.browser)) {
    throw new Error(`Unknown browser: ${options.browser}`);
  }
  return options;
}

async function waitForServer(url, child, logs, startupState) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (startupState.error) {
      throw new Error(
        `Could not start Vite: ${startupState.error.message}\n${logs.join("")}`,
        { cause: startupState.error },
      );
    }
    if (child.exitCode !== null) {
      throw new Error(`Vite exited with ${child.exitCode}\n${logs.join("")}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${url}\n${logs.join("")}`);
}

async function startFixtureServer({
  libraryRoot,
  libraryIdentity,
  port,
  id,
  register,
}) {
  const logs = [];
  const serverId = `${id}-${process.pid}-${port}`;
  const cacheDirectory = path.join(
    os.tmpdir(),
    `canvas-e2e-vite-${serverId}`,
  );
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
      detached: process.platform !== "win32",
    },
  );
  const collect = (chunk) => {
    logs.push(chunk.toString());
    if (logs.length > 100) logs.shift();
  };
  const startupState = { error: null };
  child.once("error", (error) => {
    startupState.error = error;
    collect(`${error.stack || error.message || error}\n`);
  });
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const url = `http://127.0.0.1:${port}/`;
  let stopPromise = null;
  const server = {
    url,
    stop() {
      stopPromise ??= (async () => {
        await stopChildProcessTree(child);
        await fs.rm(cacheDirectory, { recursive: true, force: true });
      })();
      return stopPromise;
    },
  };
  register?.(server);
  try {
    await waitForServer(url, child, logs, startupState);
  } catch (error) {
    await server.stop();
    throw error;
  }
  return server;
}

async function launchBrowser(browserName, headed) {
  const launchOptions = { headless: !headed };
  if (browserName === "chrome") return chromium.launch({ ...launchOptions, channel: "chrome" });
  try {
    return await chromium.launch(launchOptions);
  } catch (error) {
    console.warn(`Bundled Chromium unavailable; falling back to system Chrome: ${error.message}`);
    return chromium.launch({ ...launchOptions, channel: "chrome" });
  }
}

async function runTarget({
  browser,
  label,
  baseUrl,
  outputDirectory,
  scenarios,
  sections,
  trace,
  expectedSourceIdentity,
}) {
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
    page.on("pageerror", (error) => errors.push({ type: "pageerror", message: error.message }));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push({ type: "console", message: message.text() });
    });
  });
  await context.addInitScript({
    content: `(${installBrowserInstrumentation.toString()})();`,
  });
  const allowedOrigin = new URL(baseUrl).origin;
  await context.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === allowedOrigin || requestUrl.protocol === "data:") {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });

  await fs.mkdir(outputDirectory, { recursive: true });
  if (trace) {
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });
  }
  try {
    const results = await runScenarios({
      context,
      baseUrl,
      outputDirectory,
      selectedNames: scenarios,
      sections,
      expectedSourceIdentity,
    });
    const target = {
      label,
      baseUrl,
      diagnostics: {
        playwrightTrace: {
          enabled: trace,
          artifact: trace ? "trace.zip" : null,
        },
      },
      errors,
      results,
    };
    await fs.writeFile(
      path.join(outputDirectory, "target.json"),
      `${JSON.stringify(target, null, 2)}\n`,
    );
    return target;
  } finally {
    if (trace) {
      await context.tracing
        .stop({ path: path.join(outputDirectory, "trace.zip") })
        .catch(() => undefined);
    }
    await context.close();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const sourceSelection = validateSourceSelection(options);
  const servers = new Set();
  const sourceChecks = [];
  let startupTargets = null;
  let browser = null;
  let cleanupQueue = Promise.resolve();
  let receivedSignal = null;
  let signalCleanupError = null;

  const cleanup = () => {
    cleanupQueue = cleanupQueue.then(
      async () => {
        const activeBrowser = browser;
        browser = null;
        const activeServers = [...servers];
        servers.clear();
        await Promise.all([
          activeBrowser?.close(),
          ...activeServers.map((server) => server.stop()),
        ]);
      },
      async () => {
        const activeBrowser = browser;
        browser = null;
        const activeServers = [...servers];
        servers.clear();
        await Promise.all([
          activeBrowser?.close(),
          ...activeServers.map((server) => server.stop()),
        ]);
      },
    );
    return cleanupQueue;
  };
  const signalHandlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => {
      if (receivedSignal) return;
      receivedSignal = signal;
      process.exitCode = signal === "SIGINT" ? 130 : 143;
      void cleanup().catch((error) => {
        signalCleanupError = error;
        console.error(
          `Signal cleanup failed: ${error.stack || error.message || error}`,
        );
      });
    };
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }
  const throwIfInterrupted = () => {
    if (receivedSignal) {
      throw new Error(`Parity run interrupted by ${receivedSignal}`);
    }
  };
  const resolveLocalTargets = async () => {
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
    assertDistinctSourceTargets(baseline, candidate);
    return { baseline, candidate };
  };
  const recordSourceCheck = async (checkpoint) => {
    if (!startupTargets) return;
    const current = await resolveLocalTargets();
    assertStableSourceTargets(startupTargets, current, checkpoint);
    sourceChecks.push({
      checkpoint,
      checkedAt: new Date().toISOString(),
      targets: {
        baseline: sourceIdentitySummary(current.baseline),
        candidate: sourceIdentitySummary(current.candidate),
      },
    });
  };

  let baselineUrl = sourceSelection.baselineUrl;
  let candidateUrl = sourceSelection.candidateUrl;
  try {
    await fs.mkdir(options.output, { recursive: true });
    await fs.mkdir(path.join(options.output, "diffs"), { recursive: true });
    if (sourceSelection.mode === "local") {
      startupTargets = await resolveLocalTargets();
      sourceChecks.push({
        checkpoint: "startup",
        checkedAt: new Date().toISOString(),
        targets: {
          baseline: sourceIdentitySummary(startupTargets.baseline),
          candidate: sourceIdentitySummary(startupTargets.candidate),
        },
      });
      throwIfInterrupted();
    }

    const allocatePort = createPortAllocator(
      10_000 + ((process.pid % 25_000) * 2),
    );
    if (!baselineUrl) {
      const server = await startFixtureServer({
        libraryRoot: startupTargets.baseline.root,
        libraryIdentity: startupTargets.baseline.identity,
        port: await allocatePort(),
        id: "baseline",
        register: (resource) => servers.add(resource),
      });
      baselineUrl = server.url;
      throwIfInterrupted();
    }
    if (!candidateUrl) {
      const server = await startFixtureServer({
        libraryRoot: startupTargets.candidate.root,
        libraryIdentity: startupTargets.candidate.identity,
        port: await allocatePort(),
        id: "candidate",
        register: (resource) => servers.add(resource),
      });
      candidateUrl = server.url;
      throwIfInterrupted();
    }

    browser = await launchBrowser(options.browser, options.headed);
    throwIfInterrupted();
    const browserVersion = browser.version();
    const baseline = await runTarget({
      browser,
      label: "baseline",
      baseUrl: baselineUrl,
      outputDirectory: path.join(options.output, "baseline"),
      scenarios: options.scenarios,
      sections: options.sections,
      trace: options.trace,
      expectedSourceIdentity: startupTargets?.baseline.identity ?? null,
    });
    throwIfInterrupted();
    await recordSourceCheck("after-baseline");
    const candidate = await runTarget({
      browser,
      label: "candidate",
      baseUrl: candidateUrl,
      outputDirectory: path.join(options.output, "candidate"),
      scenarios: options.scenarios,
      sections: options.sections,
      trace: options.trace,
      expectedSourceIdentity: startupTargets?.candidate.identity ?? null,
    });
    throwIfInterrupted();
    await recordSourceCheck("after-candidate");

    const comparisons = [];
    for (const name of options.scenarios) {
      const baselineResult = baseline.results.find(
        (result) => result.name === name,
      );
      const candidateResult = candidate.results.find(
        (result) => result.name === name,
      );
      if (!baselineResult || !candidateResult) {
        throw new Error(`Missing scenario result: ${name}`);
      }
      comparisons.push(
        await compareScenario({
          name,
          baseline: baselineResult,
          candidate: candidateResult,
          diffDirectory: path.join(options.output, "diffs"),
          anchorTypes: baselineResult.anchorTypes,
          trajectoryMode: baselineResult.trajectoryMode,
        }),
      );
    }

    const outcome = evaluateRunOutcome({
      comparisons,
      baselineErrors: baseline.errors,
      candidateErrors: candidate.errors,
    });
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      environment: {
        browser: options.browser,
        browserVersion,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
        locale: "en-CA",
        timezone: "America/Toronto",
        reducedMotion: "no-preference",
      },
      inputs: {
        sourceMode: sourceSelection.mode,
        baselineRoot:
          sourceSelection.mode === "local" ? startupTargets.baseline.root : null,
        candidateRoot:
          sourceSelection.mode === "local" ? startupTargets.candidate.root : null,
        baselineUrl,
        candidateUrl,
        scenarios: options.scenarios,
        sections: options.sections,
      },
      provenance: {
        baseline: sourceIdentitySummary(startupTargets?.baseline),
        candidate: sourceIdentitySummary(startupTargets?.candidate),
        sourceChecks,
      },
      diagnostics: {
        playwrightTrace: {
          enabled: options.trace,
          artifacts: options.trace
            ? ["baseline/trace.zip", "candidate/trace.zip"]
            : [],
        },
        browserErrors: outcome.errors,
      },
      thresholds: STRICT_PARITY_THRESHOLDS,
      summary: {
        parityPass: outcome.parityPass,
        comparisonParityPass: outcome.comparisonParityPass,
        performancePass: outcome.performancePass,
        pageErrors: outcome.pageErrorCount,
        deferredUserDecisions: comparisons.flatMap((comparison) =>
          comparison.parityFailures.map((failure) => ({
            scenario: comparison.name,
            ...failure,
          })),
        ),
      },
      comparisons,
    };
    const reportPath = path.join(options.output, "report.json");
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    console.log(`Report: ${reportPath}`);
    for (const comparison of comparisons) {
      const parity = comparison.pass ? "PASS" : "REVIEW";
      const perf = comparison.performancePass ? "perf-ok" : "perf-regression";
      console.log(
        `${parity.padEnd(6)} ${comparison.name.padEnd(12)} ${perf} pixels=${comparison.visual.differentPixels ?? "size-mismatch"}`,
      );
    }
    if (!outcome.parityPass) {
      console.error(
        outcome.pageErrorCount > 0
          ? `Strict parity failed with ${outcome.pageErrorCount} browser error(s); inspect diagnostics.browserErrors.`
          : "Strict parity failed. Mismatches are recorded as deferred user decisions; no changes are accepted automatically.",
      );
      process.exitCode = 1;
    } else if (options.failOnPerfRegression && !outcome.performancePass) {
      process.exitCode = 2;
    }
  } finally {
    for (const [signal, handler] of signalHandlers) {
      process.off(signal, handler);
    }
    await cleanup();
    if (signalCleanupError) throw signalCleanupError;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  if (!process.exitCode) process.exitCode = 1;
});
