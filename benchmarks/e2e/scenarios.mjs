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
    const imageStyle = image ? getComputedStyle(image) : null;
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
      dragImageTransform: imageStyle?.transform ?? null,
      dragImageCursor:
        imageStyle?.cursor.replace(window.location.origin, "<fixture-origin>") ??
        null,
      dragImagePointerEvents: imageStyle?.pointerEvents ?? null,
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

async function instrumentedWheelSequence(
  page,
  { deltaX, deltaY, count, ctrlKey = false, label },
) {
  const checkpoints = [await captureCheckpoint(page, `${label}-before`)];
  for (let index = 0; index < count; index += 1) {
    await page.evaluate(
      ({ eventInit }) => {
        const viewport = document.querySelector("[data-benchmark-viewport='true']");
        if (!(viewport instanceof HTMLElement)) {
          throw new Error("Canvas viewport was not found");
        }
        const rect = viewport.getBoundingClientRect();
        const event = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          ...eventInit,
        });
        const counts = (window.__CANVAS_WHEEL_PROPERTY_COUNTS__ ??= {});
        for (const property of [
          "deltaMode",
          "deltaY",
          "clientX",
          "clientY",
        ]) {
          const value = event[property];
          Object.defineProperty(event, property, {
            configurable: true,
            get() {
              counts[property] = (counts[property] ?? 0) + 1;
              return value;
            },
          });
        }
        const scaleGetsBefore = window.__CANVAS_PERF__?.readProbe(
          "scaleGetCalls",
        );
        viewport.dispatchEvent(event);
        const scaleGetsAfter = window.__CANVAS_PERF__?.readProbe(
          "scaleGetCalls",
        );
        if (
          typeof scaleGetsBefore === "number" &&
          typeof scaleGetsAfter === "number"
        ) {
          window.__CANVAS_PERF__?.incrementWorkMetric(
            "wheel.scaleGetCalls",
            scaleGetsAfter - scaleGetsBefore,
          );
        }
      },
      { eventInit: { deltaX, deltaY, ctrlKey } },
    );
    await sleep(16);
    checkpoints.push(await captureCheckpoint(page, `${label}-${index + 1}`));
  }
  return checkpoints;
}

const scenarioDefinitions = [
  {
    name: "wheel-hot-path",
    trajectoryMode: "checkpoints",
    anchorTypes: ["wheel"],
    query: ({ sections }) =>
      `?intro=0&sections=${sections}&instrumentMotion=1`,
    async prepare(page, url) {
      await page.goto(url, { waitUntil: "networkidle" });
      await waitForFixture(page);
      await waitForVisualIdle(page);
      await resetBrowserMetrics(page);
    },
    async act(page) {
      await waitFrames(page, 2);
      const checkpoints = [
        ...(await instrumentedWheelSequence(page, {
          deltaX: 18,
          deltaY: 12,
          count: 12,
          label: "pan",
        })),
        ...(await instrumentedWheelSequence(page, {
          deltaX: 0,
          deltaY: -5,
          count: 10,
          ctrlKey: true,
          label: "zoom",
        })),
      ];
      await page.evaluate(() => {
        for (const [property, count] of Object.entries(
          window.__CANVAS_WHEEL_PROPERTY_COUNTS__ ?? {},
        )) {
          window.__CANVAS_PERF__?.recordWorkMetric(
            `wheel.${property}Reads`,
            count,
          );
        }
        delete window.__CANVAS_WHEEL_PROPERTY_COUNTS__;

        const viewport = document.querySelector(
          "[data-benchmark-viewport='true']",
        );
        if (!(viewport instanceof HTMLElement)) {
          throw new Error("Canvas viewport was not found");
        }
        const rect = viewport.getBoundingClientRect();
        const event = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          deltaX: 0,
          deltaY: 0,
        });
        const durations = [];
        for (let repetition = 0; repetition < 5; repetition += 1) {
          const started = performance.now();
          for (let index = 0; index < 20_000; index += 1) {
            viewport.dispatchEvent(event);
          }
          durations.push(performance.now() - started);
        }
        durations.sort((left, right) => left - right);
        window.__CANVAS_PERF__?.recordWorkMetric(
          "wheel.panBurstMedianMs",
          durations[Math.floor(durations.length / 2)],
        );
      });
      await waitForVisualIdle(page, 300);
      checkpoints.push(await captureCheckpoint(page, "settled"));
      return checkpoints;
    },
  },
  {
    name: "window-dimension-fanout",
    trajectoryMode: "checkpoints",
    anchorTypes: [],
    query: ({ sections }) =>
      `?intro=0&sections=${Math.max(sections, 100)}`,
    async prepare(page, url) {
      await page.goto(url, { waitUntil: "networkidle" });
      await waitForFixture(page);
      await waitForVisualIdle(page);
      await resetBrowserMetrics(page);
    },
    async act(page) {
      const checkpoints = [await captureCheckpoint(page, "before-input")];
      await page.evaluate(async () => {
        const originalWidth = window.innerWidth;
        const descriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");
        let syntheticWidth = originalWidth;
        Object.defineProperty(window, "innerWidth", {
          configurable: true,
          get: () => syntheticWidth,
        });

        const changingStarted = performance.now();
        for (let index = 0; index < 2_000; index += 1) {
          syntheticWidth = index % 2 === 0 ? originalWidth - 1 : originalWidth;
          window.dispatchEvent(new Event("resize"));
        }
        const changingDuration = performance.now() - changingStarted;

        if (descriptor) Object.defineProperty(window, "innerWidth", descriptor);
        else delete window.innerWidth;
        window.dispatchEvent(new Event("resize"));
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));

        const sameSizeStarted = performance.now();
        for (let index = 0; index < 5_000; index += 1) {
          window.dispatchEvent(new Event("resize"));
        }
        const sameSizeDuration = performance.now() - sameSizeStarted;

        window.__CANVAS_PERF__?.recordWorkMetric(
          "changingResizeDispatchMs",
          changingDuration,
        );
        window.__CANVAS_PERF__?.recordWorkMetric(
          "sameSizeResizeDispatchMs",
          sameSizeDuration,
        );
      });
      await waitForVisualIdle(page, 250);
      checkpoints.push(await captureCheckpoint(page, "settled"));
      return checkpoints;
    },
  },
  {
    name: "pinch-hot-path",
    trajectoryMode: "checkpoints",
    anchorTypes: ["pointerdown", "pointermove", "pointerup"],
    query: ({ sections }) => `?intro=0&sections=${sections}`,
    async prepare(page, url) {
      await page.goto(url, { waitUntil: "networkidle" });
      await waitForFixture(page);
      await waitForVisualIdle(page);
      await resetBrowserMetrics(page);
    },
    async act(page, cdp) {
      if (!cdp) throw new Error("Pinch benchmark requires a CDP session");
      const viewport = page.locator("[data-benchmark-viewport='true']");
      const box = await viewport.boundingBox();
      if (!box) throw new Error("Canvas viewport was not found");

      await page.evaluate(() => {
        const element = document.querySelector(
          "[data-benchmark-viewport='true']",
        );
        if (!(element instanceof HTMLElement)) {
          throw new Error("Canvas viewport was not found");
        }
        window.__CANVAS_PINCH_POINTER_IDS__ = [];
        const recordPointerId = (event) => {
          if (!window.__CANVAS_PINCH_POINTER_IDS__.includes(event.pointerId)) {
            window.__CANVAS_PINCH_POINTER_IDS__.push(event.pointerId);
          }
        };
        element.addEventListener("pointerdown", recordPointerId);

        const originalArrayFrom = Array.from;
        Array.from = function (...args) {
          if (
            Object.prototype.toString.call(args[0]) ===
            "[object Map Iterator]"
          ) {
            window.__CANVAS_PERF__?.incrementWorkMetric(
              "pinch.mapIteratorArrayFromCalls",
            );
          }
          return Reflect.apply(originalArrayFrom, this, args);
        };

        window.__CANVAS_RESTORE_PINCH_BENCHMARK__ = () => {
          Array.from = originalArrayFrom;
          element.removeEventListener("pointerdown", recordPointerId);
          delete window.__CANVAS_PINCH_POINTER_IDS__;
          delete window.__CANVAS_RESTORE_PINCH_BENCHMARK__;
        };
      });

      const dispatchTouch = (type, touchPoints) =>
        cdp.send("Input.dispatchTouchEvent", { type, touchPoints });

      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      const firstTouch = { id: 1, x: centerX - 80, y: centerY };
      let secondTouch = { id: 2, x: centerX + 80, y: centerY };
      const checkpoints = [await captureCheckpoint(page, "before-input")];
      try {
        await dispatchTouch("touchStart", [firstTouch]);
        await waitFrames(page, 2);
        checkpoints.push(await captureCheckpoint(page, "pointerdown-1"));
        await dispatchTouch("touchStart", [firstTouch, secondTouch]);
        await waitFrames(page, 2);
        checkpoints.push(await captureCheckpoint(page, "pointerdown-2"));

        for (let index = 1; index <= 12; index += 1) {
          secondTouch = {
            ...secondTouch,
            x: centerX + 80 + index * 3,
            y: centerY + index * 2,
          };
          await dispatchTouch("touchMove", [firstTouch, secondTouch]);
          await waitFrames(page, 1);
          checkpoints.push(await captureCheckpoint(page, `step-${index}`));
        }

        const pointerIds = await page.evaluate(
          () => window.__CANVAS_PINCH_POINTER_IDS__,
        );
        if (pointerIds.length !== 2) {
          throw new Error(
            `Expected two trusted pointer IDs, received ${pointerIds.length}`,
          );
        }
        await page.evaluate(
          ({ x, y, pointerId }) => {
            const element = document.querySelector(
              "[data-benchmark-viewport='true']",
            );
            if (!(element instanceof HTMLElement)) {
              throw new Error("Canvas viewport was not found");
            }
            const events = [0, 1].map(
              (offset) =>
                new PointerEvent("pointermove", {
                  bubbles: true,
                  cancelable: true,
                  pointerId,
                  pointerType: "touch",
                  buttons: 1,
                  clientX: x + offset,
                  clientY: y + offset,
                }),
            );
            const durations = [];
            for (let repetition = 0; repetition < 5; repetition += 1) {
              const started = performance.now();
              for (let index = 0; index < 20_000; index += 1) {
                element.dispatchEvent(events[index % events.length]);
              }
              durations.push(performance.now() - started);
            }
            durations.sort((left, right) => left - right);
            window.__CANVAS_PERF__?.recordWorkMetric(
              "pinch.moveBurstMedianMs",
              durations[Math.floor(durations.length / 2)],
            );
          },
          { x: secondTouch.x, y: secondTouch.y, pointerId: pointerIds[1] },
        );
        checkpoints.push(await captureCheckpoint(page, "after-burst"));

        await dispatchTouch("touchEnd", [secondTouch]);
        await waitFrames(page, 2);
        checkpoints.push(await captureCheckpoint(page, "pointerup-2"));
        await dispatchTouch("touchEnd", [firstTouch]);
        await waitFrames(page, 2);
        checkpoints.push(await captureCheckpoint(page, "pointerup-1"));
      } finally {
        await page.evaluate(() => window.__CANVAS_RESTORE_PINCH_BENCHMARK__?.());
      }
      await waitForVisualIdle(page, 250);
      checkpoints.push(await captureCheckpoint(page, "settled"));
      return checkpoints;
    },
  },
  {
    name: "default-intro-content",
    trajectoryMode: "checkpoints",
    anchorTypes: [],
    query: ({ sections }) =>
      `?intro=0&sections=${sections}&standaloneIntro=1`,
    async prepare(page, url) {
      await page.goto(url, { waitUntil: "networkidle" });
      await waitForFixture(page);
      await waitForVisualIdle(page);
      await resetBrowserMetrics(page);
    },
    async act(page) {
      await waitForVisualIdle(page, 250);
      return [await captureCheckpoint(page, "stable")];
    },
  },
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
    name: "toolbar-dynamic-format",
    trajectoryMode: "checkpoints",
    anchorTypes: ["wheel"],
    query: ({ sections }) => `?intro=0&sections=${sections}&toolbar=dynamic`,
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
      await page.evaluate(() => {
        window.__CANVAS_SET_CUSTOM_TOOLBAR_FORMAT__?.(true);
      });
      await page.waitForFunction(() =>
        document
          .querySelector("[data-toolbar-button]")
          ?.textContent?.startsWith("coords "),
      );
      checkpoints.push(await captureCheckpoint(page, "custom-enabled"));
      await waitForVisualIdle(page, 300);
      checkpoints.push(await captureCheckpoint(page, "settled"));
      return checkpoints;
    },
  },
  {
    name: "drag-hover-hit-test",
    trajectoryMode: "checkpoints",
    anchorTypes: [],
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
      const checkpoints = [await captureCheckpoint(page, "before-input")];
      const points = [
        [0.04, 0.04],
        [0.5, 0.5],
        [0.96, 0.96],
        [0.5, 0.5],
      ];
      for (const [index, [xRatio, yRatio]] of points.entries()) {
        await page.mouse.move(
          box.x + box.width * xRatio,
          box.y + box.height * yRatio,
        );
        await waitForVisualIdle(page, 150);
        checkpoints.push(await captureCheckpoint(page, `hover-${index + 1}`));
      }
      await page.evaluate(() => {
        const image = document.querySelector(
          "img[alt='Benchmark draggable shape']",
        );
        if (!(image instanceof HTMLImageElement)) {
          throw new Error("Draggable benchmark image is not visible");
        }
        const rect = image.getBoundingClientRect();
        const event = new MouseEvent("mousemove", {
          bubbles: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        });
        const durations = [];
        for (let repetition = 0; repetition < 5; repetition += 1) {
          const started = performance.now();
          for (let index = 0; index < 100_000; index += 1) {
            window.dispatchEvent(event);
          }
          durations.push(performance.now() - started);
        }
        durations.sort((left, right) => left - right);
        window.__CANVAS_PERF__?.recordWorkMetric(
          "draggable.hoverBurstMedianMs",
          durations[Math.floor(durations.length / 2)],
        );
      });
      await page.mouse.move(box.x - 20, box.y - 20);
      await waitForVisualIdle(page, 150);
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
      const interactionCheckpoints = (await scenario.act(page, cdp)) ?? [];
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
