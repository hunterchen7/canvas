#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

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
    if (processHandle?.exitCode != null) {
      throw new Error(`Vite exited before becoming ready (${processHandle.exitCode})`);
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

async function phase(page, name, action) {
  await page.evaluate((phaseName) => {
    window.__CANVAS_BENCHMARK__.beginPhase(phaseName);
  }, name);
  await action();
  await page.evaluate((phaseName) => {
    window.__CANVAS_BENCHMARK__.endPhase(phaseName);
  }, name);
}

async function waitForMotion(page, timeoutMs = 7000) {
  await page.evaluate(
    (timeout) => window.__CANVAS_BENCHMARK__.waitForMotionSettled(timeout),
    timeoutMs,
  );
}

async function main() {
  const values = parseArguments(process.argv.slice(2));
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
  const suppliedUrl = values.get("url");
  const baseUrl = suppliedUrl ?? `http://127.0.0.1:${port}`;
  let browser = null;
  let page = null;
  let result = null;

  try {
    if (!suppliedUrl) {
      const viteBin = path.join(repositoryRoot, "node_modules/vite/bin/vite.js");
      server = spawn(
        process.execPath,
        [
          viteBin,
          "--config",
          path.join(runtimeRoot, "vite.config.ts"),
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--strictPort",
        ],
        {
          cwd: repositoryRoot,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      server.stdout.on("data", (chunk) => process.stderr.write(chunk));
      server.stderr.on("data", (chunk) => process.stderr.write(chunk));
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

    await page.goto(`${baseUrl}/?${query}`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page.waitForFunction(
      () => Boolean(window.__CANVAS_BENCHMARK__),
      undefined,
      { timeout: timeoutMs },
    );
    await page.evaluate(() => window.__CANVAS_BENCHMARK__.setRunner("playwright"));
    await page.evaluate(
      (timeout) => window.__CANVAS_BENCHMARK__.waitForCanvasReady(timeout),
      timeoutMs,
    );
    await waitForMotion(page);
    await page.evaluate(() => window.__CANVAS_BENCHMARK__.endPhase("intro"));

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
      });

      await phase(page, "visibility", async () => {
        const target = navbarButtons.nth(Math.floor(navbarCount / 2));
        const label = await target.getAttribute("aria-label");
        const number = Number.parseInt(label?.replace(/\D+/g, "") ?? "1", 10);
        activeSectionId = `section-${number}`;
        await target.click();
        await waitForMotion(page);
      });
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
    });

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
    });

    await phase(page, "zoom", async () => {
      await page.mouse.move(centerX, centerY);
      await page.keyboard.down("Control");
      for (let index = 0; index < 10; index += 1) {
        await page.mouse.wheel(0, -5);
        await page.waitForTimeout(16);
      }
      await page.keyboard.up("Control");
      await page.waitForTimeout(300);
    });

    await phase(page, "settle", async () => {
      await page.waitForTimeout(500);
    });

    result = await page.evaluate(() => window.__CANVAS_BENCHMARK__.finalize());
  } catch (error) {
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
    await browser?.close();
    if (server && server.exitCode == null) server.kill("SIGTERM");
  }

  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  const output = values.get("output");
  if (output) {
    const outputPath = path.resolve(process.cwd(), output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");
    process.stderr.write(`Wrote ${outputPath}\n`);
  }
  process.stdout.write(serialized);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : error}\n`);
  process.exitCode = 1;
});
