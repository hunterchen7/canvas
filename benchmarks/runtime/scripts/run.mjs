#!/usr/bin/env node
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { startDeepProfile } from "./deep-profile.mjs";
import {
  assertMatchingLibraryIdentity,
  resolveLibraryTarget,
} from "./library-target.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(runtimeRoot, "../..");

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const [key, inlineValue] = argument.slice(2).split("=", 2);
    if (inlineValue != null) {
      values.set(key, inlineValue);
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      values.set(key, argv[index + 1]);
      index += 1;
    } else {
      values.set(key, "true");
    }
  }
  return values;
}

function integer(values, key, fallback, minimum, maximum) {
  const parsed = Number.parseInt(values.get(key) ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function boolean(values, key, fallback) {
  const value = values.get(key);
  if (value == null) return fallback;
  return value !== "false" && value !== "0";
}

const PROFILE_KINDS = new Set(["cpu", "trace", "allocations"]);

function profileKinds(values) {
  const explicit = values.get("profile");
  if (explicit == null && !values.has("profile-dir")) return [];
  if (explicit === "false" || explicit === "0") return [];
  const requested =
    explicit == null || explicit === "true" || explicit === "all"
      ? explicit === "all"
        ? [...PROFILE_KINDS]
        : ["cpu", "trace"]
      : explicit.split(",").map((value) => value.trim()).filter(Boolean);
  const unknown = requested.filter((kind) => !PROFILE_KINDS.has(kind));
  if (unknown.length > 0) {
    throw new Error(
      `Invalid --profile kind${unknown.length === 1 ? "" : "s"} ${unknown.join(", ")}; use cpu, trace, or allocations`,
    );
  }
  return [...new Set(requested)];
}

function profileOutputDirectory(values, runId) {
  const supplied = values.get("profile-dir");
  if (supplied) return path.resolve(process.cwd(), supplied);
  const output = values.get("output");
  if (!output) return path.join(os.tmpdir(), `${runId}-profile`);
  const outputPath = path.resolve(process.cwd(), output);
  const extension = path.extname(outputPath);
  return path.join(
    path.dirname(outputPath),
    `${path.basename(outputPath, extension)}-profile`,
  );
}

function viewportFor(mode, values) {
  if (values.has("width") || values.has("height")) {
    return {
      width: integer(values, "width", 1440, 320, 3840),
      height: integer(values, "height", 900, 320, 2160),
    };
  }
  if (mode === "low") return { width: 600, height: 844 };
  if (mode === "medium") return { width: 900, height: 900 };
  return { width: 1440, height: 900 };
}

async function waitForServer(url, processHandle, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (processHandle?.exitCode != null || processHandle?.signalCode != null) {
      throw new Error(
        `Vite exited before becoming ready (${processHandle.exitCode ?? processHandle.signalCode})`,
      );
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not become ready at ${url} within ${timeoutMs}ms`);
}

async function stopServer(processHandle) {
  if (
    !processHandle ||
    processHandle.exitCode != null ||
    processHandle.signalCode != null
  ) {
    return;
  }
  const exited = new Promise((resolve) => {
    processHandle.once("exit", resolve);
  });
  processHandle.kill("SIGTERM");
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 2_000)),
  ]);
  if (
    !stopped &&
    processHandle.exitCode == null &&
    processHandle.signalCode == null
  ) {
    processHandle.kill("SIGKILL");
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
}

function pipeProcessOutput(processHandle) {
  processHandle.stdout.on("data", (chunk) => process.stderr.write(chunk));
  processHandle.stderr.on("data", (chunk) => process.stderr.write(chunk));
}

async function waitForSuccessfulExit(processHandle, description) {
  const { code, signal } = await new Promise((resolve, reject) => {
    processHandle.once("error", reject);
    processHandle.once("exit", (code, signal) => resolve({ code, signal }));
  });
  if (code !== 0) {
    throw new Error(
      `${description} failed (${signal ? `signal ${signal}` : `exit ${code}`})`,
    );
  }
}

function attachRunnerProvenance(
  benchmarkResult,
  { expected, observed, verified, source, execution },
) {
  if (!benchmarkResult || typeof benchmarkResult !== "object") {
    return benchmarkResult;
  }
  return {
    ...benchmarkResult,
    library: {
      source,
      expected,
      observed,
      verified,
    },
    execution,
  };
}

async function phase(page, name, action, deepProfile) {
  await page.evaluate((phaseName) => {
    window.__CANVAS_BENCHMARK__.beginPhase(phaseName);
  }, name);
  if (deepProfile) await deepProfile.mark(`canvas:phase:${name}:start`);
  await action();
  await page.evaluate((phaseName) => {
    window.__CANVAS_BENCHMARK__.endPhase(phaseName);
  }, name);
  if (deepProfile) {
    const startMark = `canvas:phase:${name}:start`;
    const endMark = `canvas:phase:${name}:end`;
    await deepProfile.mark(endMark);
    await deepProfile.measure(`canvas:phase:${name}`, startMark, endMark);
  }
}

async function waitForMotion(page, timeoutMs = 7000) {
  await page.evaluate(
    (timeout) => window.__CANVAS_BENCHMARK__.waitForMotionSettled(timeout),
    timeoutMs,
  );
}

async function main() {
  const values = parseArguments(process.argv.slice(2));
  const suppliedUrl = values.get("url");
  const production = boolean(values, "production", false);
  const requestedLibraryRoot = values.get("library-root");
  const explicitLibrarySelection =
    requestedLibraryRoot != null || values.has("library-label");
  if (suppliedUrl && requestedLibraryRoot != null) {
    throw new Error(
      "--url and --library-root cannot be combined because an external server's source cannot be selected locally",
    );
  }
  if (suppliedUrl && production) {
    throw new Error(
      "--url and --production cannot be combined because an external server cannot be built locally",
    );
  }
  const libraryTarget = suppliedUrl
    ? null
    : await resolveLibraryTarget({
        repositoryRoot,
        libraryRoot: requestedLibraryRoot,
        libraryLabel: values.get("library-label"),
      });
  const mode = values.get("mode") ?? "high";
  if (!["auto", "high", "medium", "low"].includes(mode)) {
    throw new Error(`Invalid --mode ${mode}; use auto, high, medium, or low`);
  }
  const sections = integer(values, "sections", 24, 1, 200);
  const navItems = integer(values, "nav-items", Math.min(sections, 8), 1, sections);
  const complexity = integer(values, "complexity", 24, 1, 200);
  const seed = integer(values, "seed", 42, 0, 2_147_483_647);
  const timeoutMs = integer(values, "timeout", 45_000, 5_000, 180_000);
  const port = integer(values, "port", 4173, 1024, 65_535);
  const viewport = viewportFor(mode, values);
  const runId =
    values.get("run-id") ??
    `canvas-${mode}-${sections}-${complexity}-${Date.now().toString(36)}`;
  const requestedProfileKinds = profileKinds(values);
  const profilingEnabled = requestedProfileKinds.length > 0;
  const deepProfileDirectory = profilingEnabled
    ? profileOutputDirectory(values, runId)
    : null;
  const cpuSamplingIntervalUs = integer(
    values,
    "cpu-sampling-interval-us",
    1_000,
    100,
    1_000_000,
  );
  const allocationSamplingIntervalBytes = integer(
    values,
    "allocation-sampling-interval-bytes",
    32_768,
    1_024,
    16_777_216,
  );
  const query = new URLSearchParams({
    sections: String(sections),
    navItems: String(navItems),
    complexity: String(complexity),
    mode,
    intro: boolean(values, "intro", true) ? "1" : "0",
    autorun: "0",
    seed: String(seed),
    runId,
  });

  let server = null;
  const baseUrl = suppliedUrl ?? `http://127.0.0.1:${port}`;
  let browser = null;
  let page = null;
  let result = null;
  let runnerError = null;
  let deferredCleanupError = null;
  let deepProfile = null;
  let deepProfileResult = null;
  let viteCacheDirectory = null;
  let productionWorkspace = null;
  let productionBuildDirectory = null;
  let buildProcess = null;
  let observedLibraryIdentity = null;
  let libraryIdentityVerified = false;

  try {
    if (!suppliedUrl) {
      if (production) {
        productionWorkspace = await mkdtemp(
          path.join(os.tmpdir(), "canvas-runtime-production-"),
        );
        productionBuildDirectory = path.join(productionWorkspace, "dist");
        viteCacheDirectory = path.join(productionWorkspace, "vite-cache");
      } else if (explicitLibrarySelection) {
        viteCacheDirectory = await mkdtemp(
          path.join(os.tmpdir(), "canvas-runtime-vite-"),
        );
      }
      const viteBin = path.join(repositoryRoot, "node_modules/vite/bin/vite.js");
      const viteEnvironment = {
        ...process.env,
        CANVAS_BENCHMARK_LIBRARY_ROOT: libraryTarget.root,
        CANVAS_BENCHMARK_LIBRARY_LABEL: libraryTarget.identity.label,
        ...(viteCacheDirectory
          ? { CANVAS_BENCHMARK_VITE_CACHE_DIR: viteCacheDirectory }
          : {}),
        ...(productionBuildDirectory
          ? {
              CANVAS_BENCHMARK_BUILD_OUT_DIR: productionBuildDirectory,
              CANVAS_BENCHMARK_BUILD_SOURCEMAP: "true",
              CANVAS_BENCHMARK_REACT_PROFILING: "true",
            }
          : {}),
      };

      if (production) {
        buildProcess = spawn(
          process.execPath,
          [
            viteBin,
            "build",
            "--config",
            path.join(runtimeRoot, "vite.config.ts"),
            "--configLoader",
            "runner",
          ],
          {
            cwd: repositoryRoot,
            env: viteEnvironment,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        pipeProcessOutput(buildProcess);
        await waitForSuccessfulExit(buildProcess, "Vite production build");

        const postBuildTarget = await resolveLibraryTarget({
          repositoryRoot,
          libraryRoot: requestedLibraryRoot,
          libraryLabel: values.get("library-label"),
        });
        try {
          assertMatchingLibraryIdentity(
            libraryTarget.identity,
            postBuildTarget.identity,
          );
        } catch (error) {
          throw new Error(
            "Library source identity changed while the production bundle was being built; refusing to benchmark a stale bundle",
            { cause: error },
          );
        }

        if (profilingEnabled) {
          await mkdir(deepProfileDirectory, { recursive: true });
          const preservedBuildDirectory = path.join(
            deepProfileDirectory,
            "production-build",
          );
          await rm(preservedBuildDirectory, { recursive: true, force: true });
          await cp(
            productionBuildDirectory,
            preservedBuildDirectory,
            { recursive: true, force: true },
          );
        }
      }

      server = spawn(
        process.execPath,
        [
          viteBin,
          ...(production ? ["preview"] : []),
          "--config",
          path.join(runtimeRoot, "vite.config.ts"),
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--strictPort",
          ...(explicitLibrarySelection || production
            ? ["--configLoader", "runner"]
            : []),
        ],
        {
          cwd: repositoryRoot,
          env: viteEnvironment,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      pipeProcessOutput(server);
      await waitForServer(baseUrl, server, timeoutMs);
    }

    browser = await chromium.launch({ headless: !boolean(values, "headed", false) });
    const context = await browser.newContext({ viewport });
    page = await context.newPage();
    page.on("pageerror", (error) => {
      process.stderr.write(`[pageerror] ${error.stack ?? error.message}\n`);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        process.stderr.write(`[console.error] ${message.text()}\n`);
      }
    });

    if (profilingEnabled) {
      deepProfile = await startDeepProfile({
        page,
        outputDirectory: deepProfileDirectory,
        kinds: requestedProfileKinds,
        cpuSamplingIntervalUs,
        allocationSamplingIntervalBytes,
        runMetadata: {
          runId,
          mode,
          sections,
          navItems,
          complexity,
          seed,
          viewport,
          url: baseUrl,
          execution: {
            serverMode: production
              ? "production-bundle"
              : "development-server",
            sourceMaps: production,
            preservedBuildDirectory:
              production && profilingEnabled ? "production-build" : null,
          },
          library: libraryTarget?.identity ?? {
            label: values.get("library-label") ?? "external-url",
            externalUrl: baseUrl,
            identityVerifiedAfterNavigation: true,
          },
        },
      });
      await deepProfile.markOnNextDocument("canvas:phase:intro:start");
    }

    await page.goto(`${baseUrl}/?${query}`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page.waitForFunction(
      () => Boolean(window.__CANVAS_BENCHMARK__),
      undefined,
      { timeout: timeoutMs },
    );
    observedLibraryIdentity = await page.evaluate(
      () => window.__CANVAS_BENCHMARK_LIBRARY__,
    );
    assertMatchingLibraryIdentity(
      libraryTarget?.identity ?? null,
      observedLibraryIdentity,
    );
    libraryIdentityVerified = true;
    process.stderr.write(
      `[library] ${observedLibraryIdentity.label} ${observedLibraryIdentity.proof} (${observedLibraryIdentity.source.hash})\n`,
    );
    await page.evaluate(() => window.__CANVAS_BENCHMARK__.setRunner("playwright"));
    await page.evaluate(
      (timeout) => window.__CANVAS_BENCHMARK__.waitForCanvasReady(timeout),
      timeoutMs,
    );
    await waitForMotion(page);
    await page.evaluate(() => window.__CANVAS_BENCHMARK__.endPhase("intro"));
    if (deepProfile) {
      await deepProfile.mark("canvas:phase:intro:end");
      await deepProfile.measure(
        "canvas:phase:intro",
        "canvas:phase:intro:start",
        "canvas:phase:intro:end",
      );
    }

    const navbarButtons = page.locator('button[aria-label^="Section "]');
    const navbarCount = await navbarButtons.count();
    let activeSectionId = "section-1";

    if (navbarCount > 1) {
      await phase(page, "navbar", async () => {
        const target = navbarButtons.nth(navbarCount - 1);
        const label = await target.getAttribute("aria-label");
        const number = Number.parseInt(label?.replace(/\D+/g, "") ?? "1", 10);
        activeSectionId = `section-${number}`;
        await target.click();
        await waitForMotion(page);
      }, deepProfile);

      await phase(page, "visibility", async () => {
        const target = navbarButtons.nth(Math.floor(navbarCount / 2));
        const label = await target.getAttribute("aria-label");
        const number = Number.parseInt(label?.replace(/\D+/g, "") ?? "1", 10);
        activeSectionId = `section-${number}`;
        await target.click();
        await waitForMotion(page);
      }, deepProfile);
    }

    await phase(page, "drag", async () => {
      const draggable = page.locator(
        `[data-benchmark-draggable="${activeSectionId}"]`,
      );
      await draggable.waitFor({ state: "visible", timeout: timeoutMs });
      const box = await draggable.boundingBox();
      if (!box) throw new Error(`No bounding box for ${activeSectionId} draggable`);
      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 90, startY + 55, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(250);
    }, deepProfile);

    const viewportLocator = page.locator(
      "[data-benchmark-shell] .touch-none.select-none.overflow-hidden",
    );
    const viewportBox = await viewportLocator.boundingBox();
    if (!viewportBox) throw new Error("No bounding box for canvas viewport");
    const centerX = viewportBox.x + viewportBox.width / 2;
    const centerY = viewportBox.y + viewportBox.height / 2;

    await phase(page, "pan", async () => {
      await page.mouse.move(centerX, centerY);
      for (let index = 0; index < 12; index += 1) {
        await page.mouse.wheel(18, 12);
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(300);
    }, deepProfile);

    await phase(page, "zoom", async () => {
      await page.mouse.move(centerX, centerY);
      await page.keyboard.down("Control");
      for (let index = 0; index < 10; index += 1) {
        await page.mouse.wheel(0, -5);
        await page.waitForTimeout(16);
      }
      await page.keyboard.up("Control");
      await page.waitForTimeout(300);
    }, deepProfile);

    await phase(page, "settle", async () => {
      await page.waitForTimeout(500);
    }, deepProfile);

    result = await page.evaluate(() => window.__CANVAS_BENCHMARK__.finalize());
  } catch (error) {
    runnerError = error;
    if (page) {
      try {
        result = await page.evaluate(
          (message) => window.__CANVAS_BENCHMARK__?.fail(message),
          error instanceof Error ? error.stack ?? error.message : String(error),
        );
      } catch {
        // Preserve the original runner failure below.
      }
    }
    if (!result) throw error;
    process.exitCode = 1;
  } finally {
    result = attachRunnerProvenance(result, {
      expected: libraryTarget?.identity ?? null,
      observed: observedLibraryIdentity,
      verified: libraryIdentityVerified,
      source: suppliedUrl ? "external-url" : "local-source",
      execution: {
        serverMode: suppliedUrl
          ? "external-url"
          : production
            ? "production-bundle"
            : "development-server",
        reactRuntime: suppliedUrl
          ? "external-unknown"
          : production
            ? "production-profiling"
            : "development",
        sourceMaps: production,
      },
    });
    if (deepProfile) {
      try {
        deepProfileResult = await deepProfile.stop({
          benchmarkResult: result,
          status: result?.status ?? (runnerError ? "error" : "complete"),
          error: runnerError,
        });
      } catch (profileError) {
        process.stderr.write(
          `[profile] ${profileError instanceof Error ? profileError.stack ?? profileError.message : profileError}\n`,
        );
        if (!runnerError) deferredCleanupError = profileError;
      }
    }
    for (const cleanup of [
      () => browser?.close(),
      () => stopServer(server),
      () => stopServer(buildProcess),
      () =>
        productionWorkspace
          ? rm(productionWorkspace, { recursive: true, force: true })
          : viteCacheDirectory
            ? rm(viteCacheDirectory, { recursive: true, force: true })
            : undefined,
    ]) {
      try {
        await cleanup();
      } catch (cleanupError) {
        process.stderr.write(
          `[cleanup] ${cleanupError instanceof Error ? cleanupError.stack ?? cleanupError.message : cleanupError}\n`,
        );
        if (!runnerError && !deferredCleanupError) {
          deferredCleanupError = cleanupError;
        }
      }
    }
    if (deferredCleanupError) throw deferredCleanupError;
  }

  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  const output = values.get("output");
  if (output) {
    const outputPath = path.resolve(process.cwd(), output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");
    process.stderr.write(`Wrote ${outputPath}\n`);
  }
  if (deepProfileResult) {
    process.stderr.write(`Wrote deep profile ${deepProfileResult.outputDirectory}\n`);
  }
  process.stdout.write(serialized);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : error}\n`);
  process.exitCode = 1;
});
