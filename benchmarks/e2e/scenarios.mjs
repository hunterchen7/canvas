import fs from "node:fs/promises";
import path from "node:path";
import { captureDomContract } from "./contracts.mjs";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const metricMap = (response) =>
  Object.fromEntries(response.metrics.map((metric) => [metric.name, metric.value]));

const durationMetrics = new Set([
  "TaskDuration",
  "ScriptDuration",
  "LayoutDuration",
  "RecalcStyleDuration",
  "V8CompileDuration",
]);

function subtractMetrics(beforeResponse, afterResponse) {
  const before = metricMap(beforeResponse);
  const after = metricMap(afterResponse);
  const names = [
    "TaskDuration",
    "ScriptDuration",
    "LayoutDuration",
    "RecalcStyleDuration",
    "V8CompileDuration",
    "LayoutCount",
    "RecalcStyleCount",
    "Nodes",
    "JSHeapUsedSize",
    "JSHeapTotalSize",
  ];
  return Object.fromEntries(
    names.map((name) => {
      const suffix = durationMetrics.has(name) ? "Ms" : "";
      const multiplier = durationMetrics.has(name) ? 1_000 : 1;
      return [`${name}${suffix}`, ((after[name] ?? 0) - (before[name] ?? 0)) * multiplier];
    }),
  );
}

async function waitForFixture(page, { requireStageTwo = true } = {}) {
  await page.waitForFunction(() => window.__CANVAS_HARNESS__?.ready === true, null, {
    timeout: 12_000,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) =>
        image.complete ? image.decode().catch(() => undefined) : new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        }),
      ),
    );
  });
  if (requireStageTwo) {
    await page.waitForFunction(
      () => window.__CANVAS_HARNESS__?.read().animationStage === 2,
      null,
      { timeout: 12_000 },
    );
  }
}

async function waitFrames(page, count = 4) {
  await page.evaluate(
    (frameCount) =>
      new Promise((resolve) => {
        let remaining = frameCount;
        const frame = () => {
          remaining -= 1;
          if (remaining <= 0) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    count,
  );
}

async function waitForMotionSettled(page, { consecutiveFrames = 24, timeoutMs = 4_000 } = {}) {
  await page.evaluate(
    ({ requiredFrames, timeout }) =>
      new Promise((resolve, reject) => {
        const started = performance.now();
        let stableFrames = 0;
        let previous = null;
        const frame = () => {
          const current = window.__CANVAS_HARNESS__?.read();
          const runningAnimations = document
            .getAnimations()
            .filter((animation) => animation.playState === "running").length;
          const unchanged =
            previous &&
            current &&
            current.animationStage === 2 &&
            Math.abs(current.x - previous.x) < 0.000001 &&
            Math.abs(current.y - previous.y) < 0.000001 &&
            Math.abs(current.scale - previous.scale) < 0.00000001 &&
            current.sceneTransform === previous.sceneTransform &&
            runningAnimations === 0;
          stableFrames = unchanged ? stableFrames + 1 : 0;
          previous = current;
          if (stableFrames >= requiredFrames) resolve();
          else if (performance.now() - started > timeout) {
            reject(new Error(`Motion did not settle within ${timeout}ms`));
          } else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    { requiredFrames: consecutiveFrames, timeout: timeoutMs },
  );
}

async function waitForVisualIdle(page, milliseconds = 550) {
  await page.waitForTimeout(milliseconds);
  await waitForMotionSettled(page);
}

async function stabilizeRasterForCapture(page) {
  await page.evaluate(() => {
    window.__CANVAS_PERF__?.clearTrackedIntervals();
    const body = document.body;
    const previousDisplay = body.style.display;
    body.style.display = "none";
    void body.offsetHeight;
    body.style.display = previousDisplay;
    void body.offsetHeight;
  });
  await waitFrames(page, 6);
}

async function resetBrowserMetrics(page) {
  await page.evaluate(() => window.__CANVAS_PERF__?.reset());
  await waitFrames(page, 2);
  await page.evaluate(() => window.__CANVAS_PERF__?.reset());
}

async function captureCheckpoint(page, label) {
  return page.evaluate((checkpointLabel) => {
    const state = window.__CANVAS_HARNESS__?.read();
    const image = document.querySelector("img[alt='Benchmark draggable shape']");
    const imageRect = image?.getBoundingClientRect();
    const dragRoot = image?.parentElement;
    const dragTransform = dragRoot ? getComputedStyle(dragRoot).transform : null;
    const dragMatrix = dragTransform
      ? new DOMMatrixReadOnly(dragTransform === "none" ? undefined : dragTransform)
      : null;
    return {
      label: checkpointLabel,
      ...state,
      dragTranslation: dragMatrix ? { x: dragMatrix.m41, y: dragMatrix.m42 } : null,
      dragTransform,
      dragImageTransform: image ? getComputedStyle(image).transform : null,
      dragImageRect: imageRect
        ? {
            x: imageRect.x,
            y: imageRect.y,
            width: imageRect.width,
            height: imageRect.height,
          }
        : null,
    };
  }, label);
}

async function dragPointer(page, start, end, steps = 28) {
  const checkpoints = [await captureCheckpoint(page, "before-input")];
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  checkpoints.push(await captureCheckpoint(page, "pointerdown"));
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    await page.mouse.move(
      start.x + (end.x - start.x) * progress,
      start.y + (end.y - start.y) * progress,
    );
    await sleep(16);
    checkpoints.push(await captureCheckpoint(page, `step-${index}`));
  }
  await page.mouse.up();
  checkpoints.push(await captureCheckpoint(page, "pointerup"));
  return checkpoints;
}

async function wheelSequence(page, { x, y, deltaX, deltaY, count, ctrlKey = false }) {
  const checkpoints = [await captureCheckpoint(page, "before-input")];
  await page.mouse.move(x, y);
  if (ctrlKey) await page.keyboard.down("Control");
  try {
    for (let index = 0; index < count; index += 1) {
      await page.mouse.wheel(deltaX, deltaY);
      await sleep(16);
      checkpoints.push(await captureCheckpoint(page, `step-${index + 1}`));
    }
  } finally {
    if (ctrlKey) await page.keyboard.up("Control");
  }
  checkpoints.push(await captureCheckpoint(page, "after-input"));
  return checkpoints;
}

const scenarioDefinitions = [
  {
    name: "static-home",
    trajectoryMode: "checkpoints",
    anchorTypes: [],
    query: ({ sections }) => `?intro=0&sections=${sections}`,
    async prepare(page, url) {
      await page.goto(url, { waitUntil: "networkidle" });
      await waitForFixture(page);
      await waitForVisualIdle(page);
      await resetBrowserMetrics(page);
    },
    async act(page) {
      await waitForVisualIdle(page, 500);
      return [await captureCheckpoint(page, "stable")];
    },
  },
  {
    name: "intro",
    trajectoryMode: "animation",
    anchorTypes: [],
    query: ({ sections }) => `?intro=1&sections=${sections}`,
    async prepare(page, url) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await waitForFixture(page, { requireStageTwo: false });
    },
    async act(page) {
      await page.waitForFunction(
        () => window.__CANVAS_HARNESS__?.read().animationStage === 2,
        null,
        { timeout: 12_000 },
      );
      await waitForVisualIdle(page, 850);
      return [await captureCheckpoint(page, "settled")];
    },
    includeNavigationMetrics: true,
  },
  {
    name: "pan",
    trajectoryMode: "checkpoints",
    anchorTypes: ["pointerdown"],
    query: ({ sections }) => `?intro=0&sections=${sections}`,
    async prepare(page, url) {
      await page.goto(url, { waitUntil: "networkidle" });
      await waitForFixture(page);
      await waitForVisualIdle(page);
      await resetBrowserMetrics(page);
    },
    async act(page) {
      const checkpoints = await dragPointer(page, { x: 90, y: 360 }, { x: 350, y: 505 });
      await waitForVisualIdle(page, 250);
      checkpoints.push(await captureCheckpoint(page, "settled"));
      return checkpoints;
    },
  },
  {
    name: "zoom",
    trajectoryMode: "checkpoints",
    anchorTypes: ["wheel"],
    query: ({ sections }) => `?intro=0&sections=${sections}`,
    async prepare(page, url) {
      await page.goto(url, { waitUntil: "networkidle" });
      await waitForFixture(page);
      await waitForVisualIdle(page);
      await resetBrowserMetrics(page);
    },
    async act(page) {
      const checkpoints = await wheelSequence(page, {
        x: 640,
        y: 360,
        deltaX: 0,
        deltaY: -6,
        count: 6,
        ctrlKey: true,
      });
      await waitForVisualIdle(page, 300);
      checkpoints.push(await captureCheckpoint(page, "settled"));
      return checkpoints;
    },
  },
  {
    name: "navbar",
    trajectoryMode: "animation",
    anchorTypes: ["pointerdown", "click"],
    query: ({ sections }) => `?intro=0&sections=${sections}`,
    async prepare(page, url) {
      await page.goto(url, { waitUntil: "networkidle" });
      await waitForFixture(page);
      await waitForVisualIdle(page);
      await resetBrowserMetrics(page);
    },
    async act(page) {
      const checkpoints = [await captureCheckpoint(page, "before-input")];
      await page.locator("button[aria-label='Lab']").click();
      await waitForVisualIdle(page, 900);
      checkpoints.push(await captureCheckpoint(page, "settled"));
      return checkpoints;
    },
  },
  {
    name: "toolbar",
    trajectoryMode: "checkpoints",
    anchorTypes: ["wheel"],
    query: ({ sections }) => `?intro=0&sections=${sections}`,
    async prepare(page, url) {
      await page.goto(url, { waitUntil: "networkidle" });
      await waitForFixture(page);
      await waitForVisualIdle(page);
      await resetBrowserMetrics(page);
    },
    async act(page) {
      const checkpoints = await wheelSequence(page, {
        x: 640,
        y: 360,
        deltaX: 24,
        deltaY: 18,
        count: 8,
      });
      await waitForVisualIdle(page, 300);
      checkpoints.push(await captureCheckpoint(page, "settled"));
      return checkpoints;
    },
  },
  {
    name: "toolbar-custom-format",
    trajectoryMode: "checkpoints",
    anchorTypes: ["wheel"],
    query: ({ sections }) => `?intro=0&sections=${sections}&toolbar=custom`,
    async prepare(page, url) {
      await page.goto(url, { waitUntil: "networkidle" });
      await waitForFixture(page);
      await waitForVisualIdle(page);
      await resetBrowserMetrics(page);
    },
    async act(page) {
      const checkpoints = await wheelSequence(page, {
        x: 640,
        y: 360,
        deltaX: 24,
        deltaY: 18,
        count: 8,
      });
      await waitForVisualIdle(page, 300);
      checkpoints.push(await captureCheckpoint(page, "settled"));
      return checkpoints;
    },
  },
  {
    name: "drag",
    trajectoryMode: "checkpoints",
    anchorTypes: ["pointerdown"],
    query: ({ sections }) => `?intro=0&sections=${sections}`,
    async prepare(page, url) {
      await page.goto(url, { waitUntil: "networkidle" });
      await waitForFixture(page);
      await page.locator("button[aria-label='Drag']").click();
      await waitForVisualIdle(page, 900);
      await resetBrowserMetrics(page);
    },
    async act(page) {
      const image = page.locator("img[alt='Benchmark draggable shape']");
      const box = await image.boundingBox();
      if (!box) throw new Error("Draggable benchmark image is not visible");
      const checkpoints = await dragPointer(
        page,
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        { x: box.x + box.width / 2 + 125, y: box.y + box.height / 2 + 70 },
        24,
      );
      await page.mouse.move(15, 15);
      await waitForVisualIdle(page, 350);
      checkpoints.push(await captureCheckpoint(page, "settled"));
      return checkpoints;
    },
  },
];

export const allScenarioNames = scenarioDefinitions.map((scenario) => scenario.name);

export async function runScenarios({
  context,
  baseUrl,
  outputDirectory,
  selectedNames = allScenarioNames,
  sections = 0,
}) {
  const selected = scenarioDefinitions.filter((scenario) => selectedNames.includes(scenario.name));
  const results = [];
  await fs.mkdir(path.join(outputDirectory, "screenshots"), { recursive: true });
  await fs.mkdir(path.join(outputDirectory, "scenarios"), { recursive: true });

  for (const scenario of selected) {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    const beforeNavigation = await cdp.send("Performance.getMetrics");
    const url = new URL(scenario.query({ sections }), baseUrl).href;

    try {
      await scenario.prepare(page, url);
      const beforeAction = scenario.includeNavigationMetrics
        ? beforeNavigation
        : await cdp.send("Performance.getMetrics");
      const interactionCheckpoints = (await scenario.act(page)) ?? [];
      const afterAction = await cdp.send("Performance.getMetrics");
      const browserPerformance = await page.evaluate(() => window.__CANVAS_PERF__?.snapshot());
      if (!browserPerformance) throw new Error("Browser instrumentation was not installed");

      await stabilizeRasterForCapture(page);

      const screenshotPath = path.join(outputDirectory, "screenshots", `${scenario.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true, animations: "allow" });
      const contract = await page.evaluate(captureDomContract);
      const finalHarnessState = await page.evaluate(() => window.__CANVAS_HARNESS__?.read());
      const animationContract = await page.evaluate(
        () => window.__CANVAS_HARNESS__?.animationContract,
      );
      const result = {
        name: scenario.name,
        url: `${new URL(url).pathname}${new URL(url).search}`,
        anchorTypes: scenario.anchorTypes,
        trajectoryMode: scenario.trajectoryMode,
        interactionCheckpoints,
        screenshotPath,
        contract,
        finalHarnessState,
        animationContract,
        performance: {
          browser: browserPerformance,
          cdp: subtractMetrics(beforeAction, afterAction),
        },
      };
      results.push(result);
      await fs.writeFile(
        path.join(outputDirectory, "scenarios", `${scenario.name}.json`),
        `${JSON.stringify(result, null, 2)}\n`,
      );
    } finally {
      await cdp.detach().catch(() => undefined);
      await page.close();
    }
  }

  return results;
}
