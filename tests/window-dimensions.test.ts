import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import type { ViteDevServer } from "vite";
import { createServer } from "vite";

const testRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "window-dimensions",
);

let browser: Browser;
let server: ViteDevServer;
let baseUrl: string;

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    try {
      return await chromium.launch({ headless: true, channel: "chrome" });
    } catch (fallbackError) {
      throw new AggregateError(
        [error, fallbackError],
        "Neither Playwright Chromium nor system Chrome could be launched",
      );
    }
  }
}

async function openHydratedPage(viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(
    ({ width, height }) =>
      document.querySelector('[data-dimensions-probe="server"]')
        ?.textContent === `${width}x${height}` &&
      window.__WINDOW_DIMENSIONS_LISTENERS__?.().active === 1,
    viewport,
  );
  return { context, errors, page };
}

const listenerStats = (page: Page) =>
  page.evaluate(() => window.__WINDOW_DIMENSIONS_LISTENERS__());

describe("shared window dimensions store", { concurrency: false }, () => {
  before(async () => {
    server = await createServer({
      root: testRoot,
      appType: "spa",
      logLevel: "silent",
      server: {
        host: "127.0.0.1",
        port: 0,
        strictPort: false,
        hmr: false,
      },
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not resolve the hydration test server address");
    }
    baseUrl = `http://127.0.0.1:${address.port}/`;
    browser = await launchBrowser();
  });

  after(async () => {
    await browser?.close();
    await server?.close();
  });

  test("renders a deterministic server snapshot", async () => {
    const { renderWindowDimensionsProbe } = await server.ssrLoadModule(
      "/server.tsx",
    );
    const rendered = renderWindowDimensionsProbe();
    const document = await fs.readFile(path.join(testRoot, "index.html"), "utf8");

    assert.equal(
      rendered,
      '<output data-dimensions-probe="server">1200x800</output>',
    );
    assert.ok(document.includes(`<div id="root">${rendered}</div>`));
  });

  test("hydrates at a different viewport without a mismatch", async () => {
    const { context, errors, page } = await openHydratedPage({
      width: 901,
      height: 701,
    });
    try {
      assert.equal(
        await page.locator('[data-dimensions-probe="server"]').textContent(),
        "901x701",
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(await listenerStats(page), {
        adds: 1,
        removes: 0,
        active: 1,
      });
    } finally {
      await context.close();
    }
  });

  test("fans out resize updates through one listener and cleans it up", async () => {
    const { context, errors, page } = await openHydratedPage({
      width: 900,
      height: 700,
    });
    try {
      await page.evaluate(() => window.__WINDOW_DIMENSIONS_TEST__.mount("extra"));
      await page.waitForFunction(
        () =>
          document.querySelector('[data-dimensions-probe="extra"]')
            ?.textContent === "900x700",
      );
      assert.deepEqual(await listenerStats(page), {
        adds: 1,
        removes: 0,
        active: 1,
      });

      await page.setViewportSize({ width: 777, height: 555 });
      await page.waitForFunction(() =>
        [...document.querySelectorAll("[data-dimensions-probe]")].every(
          (element) => element.textContent === "777x555",
        ),
      );

      await page.evaluate(() =>
        window.__WINDOW_DIMENSIONS_TEST__.unmountServer(),
      );
      assert.deepEqual(await listenerStats(page), {
        adds: 1,
        removes: 0,
        active: 1,
      });

      await page.evaluate(() => window.__WINDOW_DIMENSIONS_TEST__.unmount("extra"));
      await page.waitForFunction(
        () => window.__WINDOW_DIMENSIONS_LISTENERS__().active === 0,
      );
      assert.deepEqual(await listenerStats(page), {
        adds: 1,
        removes: 1,
        active: 0,
      });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
});
