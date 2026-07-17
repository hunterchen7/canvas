import {
  Profiler,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ProfilerOnRenderCallback,
} from "react";
import { useMotionValueEvent } from "framer-motion";
import {
  Canvas,
  CanvasComponent,
  DefaultIntroContent,
  Draggable,
  PerformanceProvider,
  useCanvasContext,
  usePerformance,
  type NavItem,
  type SectionCoordinates,
} from "../../../src/index";
import type { BenchmarkConfig, BenchmarkResult } from "./schema";
import {
  recordProfilerRender,
  recordRender,
  registerInPageRunner,
  updateCanvasState,
} from "./metrics";

interface SectionSpec extends SectionCoordinates {
  id: string;
  label: string;
  color: string;
}

const INTRO_GROW = { duration: 0.42, delay: 0.12, ease: "easeInOut" } as const;
const INTRO_BLUR = { duration: 0.28, delay: 0.04, ease: "easeIn" } as const;
const INTRO_PAN = { duration: 0.42, ease: "easeInOut" } as const;
const SCENE_FADE = { duration: 0.12, ease: "linear" } as const;
const SECTION_WIDTH = 760;
const SECTION_HEIGHT = 520;
const SECTION_X_STEP = 1120;
const SECTION_Y_STEP = 860;

function createSections(count: number, seed: number): SectionSpec[] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * 1.4)));
  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const hue = (seed * 17 + index * 47) % 360;
    return {
      id: `section-${index + 1}`,
      label: `Section ${String(index + 1).padStart(2, "0")}`,
      x: 420 + column * SECTION_X_STEP,
      y: 340 + row * SECTION_Y_STEP,
      width: SECTION_WIDTH,
      height: SECTION_HEIGHT,
      color: `hsl(${hue} 70% 92%)`,
    };
  });
}

function selectNavigationItems(
  sections: SectionSpec[],
  count: number,
): NavItem[] {
  const indices = new Set<number>([0]);
  if (count > 1) {
    for (let index = 1; index < count; index += 1) {
      indices.add(Math.round((index * (sections.length - 1)) / (count - 1)));
    }
  }
  return [...indices].slice(0, count).map((index, navIndex) => {
    const section = sections[index]!;
    return {
      id: section.id,
      label: section.label,
      icon: navIndex === 0 ? "Home" : "Circle",
      x: section.x,
      y: section.y,
      width: section.width,
      height: section.height,
      isHome: navIndex === 0,
    };
  });
}

function SectionPayload({
  section,
  complexity,
}: {
  section: SectionSpec;
  complexity: number;
}) {
  recordRender(`section:${section.id}`);
  return (
    <article
      data-benchmark-section={section.id}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        border: "2px solid rgba(15, 23, 42, 0.16)",
        borderRadius: 28,
        padding: 28,
        background: section.color,
        color: "#172033",
        boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12)",
        overflow: "hidden",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, opacity: 0.62 }}>CANVAS RUNTIME FIXTURE</div>
          <h2 style={{ margin: "4px 0 18px", fontSize: 30 }}>{section.label}</h2>
        </div>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{section.id}</span>
      </header>
      <div className="benchmark-card-grid">
        {Array.from({ length: complexity }, (_, index) => (
          <div className="benchmark-card" key={index}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <i style={{ width: `${28 + ((index * 13) % 58)}%` }} />
          </div>
        ))}
      </div>
      <Draggable
        initialPos={{ x: 34, y: 24 }}
        data-benchmark-draggable={section.id}
        aria-label={`Drag ${section.label}`}
      >
        <div className="benchmark-draggable">drag</div>
      </Draggable>
    </article>
  );
}

function RuntimeProbe() {
  recordRender("runtime-probe");
  const { x, y, scale, animationStage } = useCanvasContext();
  const performanceConfig = usePerformance();

  useMotionValueEvent(x, "change", (value) => updateCanvasState({ x: value }));
  useMotionValueEvent(y, "change", (value) => updateCanvasState({ y: value }));
  useMotionValueEvent(scale, "change", (value) =>
    updateCanvasState({ scale: value }),
  );

  useEffect(() => {
    updateCanvasState({
      x: x.get(),
      y: y.get(),
      scale: scale.get(),
      animationStage,
    });
  }, [animationStage, scale, x, y]);

  useEffect(() => {
    updateCanvasState({ detectedMode: performanceConfig.mode });
  }, [performanceConfig.mode]);

  return null;
}

function viewportElement(): HTMLElement {
  const viewport = document.querySelector<HTMLElement>(
    "[data-benchmark-shell] .touch-none.select-none.overflow-hidden",
  );
  if (!viewport) throw new Error("Canvas viewport was not found");
  return viewport;
}

function navButtons(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>('button[aria-label^="Section "]'),
  );
}

async function pause(durationMs: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

async function repeatWheel(
  viewport: HTMLElement,
  init: WheelEventInit,
  count: number,
): Promise<void> {
  const rect = viewport.getBoundingClientRect();
  for (let index = 0; index < count; index += 1) {
    viewport.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        ...init,
      }),
    );
    await pause(16);
  }
}

function BenchmarkCanvas({ config }: { config: BenchmarkConfig }) {
  recordRender("benchmark-canvas");
  const sections = useMemo(
    () => createSections(config.sectionCount, config.seed),
    [config.sectionCount, config.seed],
  );
  const navItems = useMemo(
    () => selectNavigationItems(sections, config.navItemCount),
    [config.navItemCount, sections],
  );
  const coordinates = useMemo(
    () => new Map(sections.map((section) => [`${section.x}:${section.y}`, section.id])),
    [sections],
  );
  const coordinatesToSection = useCallback(
    (offset: SectionCoordinates | undefined) =>
      offset ? coordinates.get(`${offset.x}:${offset.y}`) ?? null : null,
    [coordinates],
  );
  const columns = Math.max(1, Math.ceil(Math.sqrt(config.sectionCount * 1.4)));
  const rows = Math.ceil(config.sectionCount / columns);
  const sceneWidth = Math.max(6000, 840 + columns * SECTION_X_STEP);
  const sceneHeight = Math.max(4000, 680 + rows * SECTION_Y_STEP);

  return (
    <div data-benchmark-shell>
      <Canvas
        homeCoordinates={sections[0]!}
        canvasWidth={sceneWidth}
        canvasHeight={sceneHeight}
        navItems={navItems}
        skipIntro={!config.introEnabled}
        introContent={<DefaultIntroContent title="Runtime benchmark" />}
        loadingText="MEASURING CANVAS"
        growTransition={INTRO_GROW}
        blurTransition={INTRO_BLUR}
        panTransition={INTRO_PAN}
        fadeTransition={SCENE_FADE}
        navbarConfig={{ display: "compact", tooltipConfig: { disabled: true } }}
        toolbarConfig={{ display: "both", disableAutoHide: true }}
      >
        <RuntimeProbe />
        {sections.map((section) => (
          <CanvasComponent
            key={section.id}
            offset={section}
            coordinatesToSection={coordinatesToSection}
          >
            <SectionPayload section={section} complexity={config.sectionComplexity} />
          </CanvasComponent>
        ))}
      </Canvas>
    </div>
  );
}

function ControlPanel({
  config,
  result,
  onRun,
}: {
  config: BenchmarkConfig;
  result: BenchmarkResult | null;
  onRun: () => void;
}) {
  return (
    <aside className="benchmark-controls">
      <strong>Canvas runtime benchmark</strong>
      <span>
        {config.sectionCount} sections · {config.sectionComplexity} nodes/section · mode {config.requestedMode}
      </span>
      <button type="button" onClick={onRun} disabled={Boolean(result)}>
        {result ? "Run complete" : "Run in page"}
      </button>
      {result && (
        <a
          download={`${result.runId}.json`}
          href={`data:application/json;charset=utf-8,${encodeURIComponent(
            JSON.stringify(result, null, 2),
          )}`}
        >
          Download JSON
        </a>
      )}
    </aside>
  );
}

export function BenchmarkApplication({ config }: { config: BenchmarkConfig }) {
  recordRender("app");
  const [result, setResult] = useState<BenchmarkResult | null>(null);

  const runInPage = useCallback(async (): Promise<BenchmarkResult> => {
    const api = window.__CANVAS_BENCHMARK__;
    await api.waitForCanvasReady();
    api.endPhase("intro");
    await api.waitForMotionSettled();

    const buttons = navButtons();
    if (buttons.length > 1) {
      api.beginPhase("navbar");
      buttons.at(-1)!.click();
      await api.waitForMotionSettled();
      api.endPhase("navbar");

      api.beginPhase("visibility");
      buttons[Math.floor(buttons.length / 2)]!.click();
      await api.waitForMotionSettled();
      api.endPhase("visibility");
    }

    const viewport = viewportElement();
    api.beginPhase("pan");
    await repeatWheel(viewport, { deltaX: 18, deltaY: 12 }, 12);
    await pause(300);
    api.endPhase("pan");

    api.beginPhase("zoom");
    await repeatWheel(viewport, { ctrlKey: true, deltaY: -5 }, 10);
    await pause(300);
    api.endPhase("zoom");

    api.beginPhase("settle");
    await pause(350);
    api.endPhase("settle");
    const completed = api.finalize();
    setResult(completed);
    console.info("CANVAS_BENCHMARK_RESULT", JSON.stringify(completed));
    return completed;
  }, []);

  useEffect(() => {
    registerInPageRunner(runInPage);
    if (config.autorun) {
      void window.__CANVAS_BENCHMARK__.runInPage().catch((error) => {
        window.__CANVAS_BENCHMARK__.fail(error);
      });
    }
  }, [config.autorun, runInPage]);

  return (
    <PerformanceProvider>
      <BenchmarkCanvas config={config} />
      <ControlPanel
        config={config}
        result={result}
        onRun={() => {
          void window.__CANVAS_BENCHMARK__.runInPage().then(setResult);
        }}
      />
    </PerformanceProvider>
  );
}

export const onProfilerRender: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  recordProfilerRender(
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  );
};

export function ProfiledBenchmarkApplication({
  config,
}: {
  config: BenchmarkConfig;
}) {
  return (
    <Profiler id="canvas-runtime-root" onRender={onProfilerRender}>
      <BenchmarkApplication config={config} />
    </Profiler>
  );
}
