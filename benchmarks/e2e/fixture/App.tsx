import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  Canvas,
  CanvasComponent,
  DefaultIntroContent,
  DraggableImage,
  useCanvasContext,
  BLUR_TRANSITION,
  FADE_TRANSITION,
  GROW_TRANSITION,
  PAN_SPRING,
  STAGE2_TRANSITION,
  MOUSE_WHEEL_ZOOM_SENSITIVITY,
  TRACKPAD_ZOOM_SENSITIVITY,
  type NavItem,
  type SectionCoordinates,
} from "@canvas-source";

type HarnessSnapshot = {
  x: number;
  y: number;
  scale: number;
  animationStage: number;
  toolbarText: string;
  toolbarOpacity: string;
  sceneTransform: string;
};

declare global {
  interface Window {
    __CANVAS_SET_CUSTOM_TOOLBAR_FORMAT__?: (enabled: boolean) => void;
    __CANVAS_HARNESS__?: {
      ready: boolean;
      read: () => HarnessSnapshot;
      navigateToSection: (id: string) => void;
      setScene: (next: Partial<Pick<HarnessSnapshot, "x" | "y" | "scale">>) => void;
      animationContract: Record<string, unknown>;
    };
  }
}

const coordinates = {
  home: { x: 2600, y: 700, width: 800, height: 500 },
  lab: { x: 750, y: 2350, width: 900, height: 600 },
  drag: { x: 4150, y: 2200, width: 900, height: 600 },
} satisfies Record<string, SectionCoordinates>;

const navItems: NavItem[] = [
  { id: "home", label: "Home", icon: "Home", ...coordinates.home, isHome: true },
  { id: "lab", label: "Lab", icon: "Gauge", ...coordinates.lab },
  { id: "drag", label: "Drag", icon: "Move", ...coordinates.drag },
];

const DRAG_HOVER_SCALE = 1.02;
const DRAG_TRANSITION = { duration: 0.1, ease: "easeOut" } as const;
const formatToolbarCoordinates = (x: number, y: number) =>
  `coords ${x}/${y}`;
const formatToolbarScale = (scale: number) =>
  `zoom ${(scale * 100).toFixed(2)}%`;

function sectionForCoordinates(offset: SectionCoordinates | undefined) {
  if (!offset) return null;
  return (
    Object.entries(coordinates).find(
      ([, value]) => value.x === offset.x && value.y === offset.y,
    )?.[0] ?? null
  );
}

function HarnessBridge() {
  const { x, y, scale, animationStage, navigateToSection } = useCanvasContext();

  useLayoutEffect(() => {
    const bridge = document.querySelector<HTMLElement>("[data-benchmark-bridge]");
    const scene = bridge?.parentElement;
    const viewport = scene?.parentElement;
    if (scene) scene.dataset.benchmarkScene = "true";
    if (viewport) viewport.dataset.benchmarkViewport = "true";
  });

  useEffect(() => {
    window.__CANVAS_HARNESS__ = {
      ready: true,
      read: () => {
        const toolbar = document.querySelector<HTMLElement>("[data-toolbar-button]");
        const scene = document.querySelector<HTMLElement>("[data-benchmark-scene]");
        return {
          x: x.get(),
          y: y.get(),
          scale: scale.get(),
          animationStage,
          toolbarText: toolbar?.textContent?.replace(/\s+/g, " ").trim() ?? "",
          toolbarOpacity: toolbar ? getComputedStyle(toolbar).opacity : "",
          sceneTransform: scene ? getComputedStyle(scene).transform : "",
        };
      },
      navigateToSection,
      setScene: (next) => {
        if (typeof next.x === "number") x.set(next.x);
        if (typeof next.y === "number") y.set(next.y);
        if (typeof next.scale === "number") scale.set(next.scale);
      },
      animationContract: {
        grow: GROW_TRANSITION,
        blur: BLUR_TRANSITION,
        stage2: STAGE2_TRANSITION,
        fade: FADE_TRANSITION,
        panSpring: PAN_SPRING,
        mouseWheelZoomSensitivity: MOUSE_WHEEL_ZOOM_SENSITIVITY,
        trackpadZoomSensitivity: TRACKPAD_ZOOM_SENSITIVITY,
        dragHoverScale: DRAG_HOVER_SCALE,
        dragTransition: DRAG_TRANSITION,
      },
    };

    return () => {
      delete window.__CANVAS_HARNESS__;
    };
  }, [animationStage, navigateToSection, scale, x, y]);

  return <span hidden data-benchmark-bridge />;
}

function Panel({
  id,
  title,
  accent,
  children,
}: {
  id: string;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="benchmark-panel flex h-full w-full flex-col rounded-3xl p-10"
      data-benchmark-contract={id}
      data-testid={`section-${id}`}
    >
      <div className="mb-8 flex items-center gap-4">
        <span
          className="h-5 w-5 rounded-full border-2 border-white shadow"
          style={{ backgroundColor: accent }}
        />
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">{title}</h1>
      </div>
      {children}
    </section>
  );
}

function HomePanel() {
  return (
    <Panel id="home" title="Canvas benchmark" accent="#2563eb">
      <p className="max-w-xl text-lg leading-7 text-zinc-600">
        A deterministic fixture for visual, interaction, animation, and frame-pacing parity.
      </p>
      <div className="mt-auto grid grid-cols-3 gap-4">
        {[
          ["1280×720", "viewport"],
          ["1.0", "device scale"],
          ["Arial", "fixture font"],
        ].map(([value, label]) => (
          <div key={label} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xl font-bold text-zinc-800">{value}</div>
            <div className="mt-1 text-sm text-zinc-500">{label}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function LabPanel() {
  return (
    <Panel id="lab" title="Motion laboratory" accent="#16a34a">
      <div className="grid flex-1 grid-cols-2 gap-6">
        <div className="rounded-2xl bg-emerald-50 p-6 text-emerald-950">
          <div className="text-sm font-bold uppercase tracking-widest">Trajectory</div>
          <div className="mt-4 text-5xl font-black">x · y · s</div>
        </div>
        <div className="flex flex-col justify-between rounded-2xl bg-zinc-900 p-6 text-white">
          <svg aria-label="fixture-wave" viewBox="0 0 240 100" className="w-full">
            <path
              d="M4 54c24-58 48 58 72 0s48 58 72 0 48 58 88 0"
              fill="none"
              stroke="#86efac"
              strokeWidth="8"
              strokeLinecap="round"
            />
          </svg>
          <div className="text-sm text-zinc-300">SVG identity is part of the DOM contract.</div>
        </div>
      </div>
    </Panel>
  );
}

function DragPanel() {
  return (
    <Panel id="drag" title="Drag surface" accent="#f97316">
      <p className="text-zinc-600">The blue shape exercises Framer Motion drag and alpha hit-testing.</p>
      <div className="relative mt-5 flex-1 rounded-2xl border border-dashed border-orange-300 bg-orange-50">
        <DraggableImage
          src="/benchmark-shape.svg"
          alt="Benchmark draggable shape"
          width={240}
          height={180}
          initialPos={{ x: 250, y: 95 }}
          hoverScale={DRAG_HOVER_SCALE}
          transition={DRAG_TRANSITION}
        />
      </div>
    </Panel>
  );
}

function StressSections({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => {
    const offset = {
      x: 150 + (index % 10) * 540,
      y: 100 + Math.floor(index / 10) * 360,
      width: 260,
      height: 180,
    };
    return (
      <CanvasComponent key={index} offset={offset}>
        <div
          className="rounded-xl border border-zinc-300 bg-white p-4 text-sm text-zinc-500"
          data-benchmark-stress={index}
        >
          stress section {index + 1}
        </div>
      </CanvasComponent>
    );
  });
}

export default function App() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const skipIntro = query.get("intro") !== "1";
  const [customToolbarFormat, setCustomToolbarFormat] = useState(
    () => query.get("toolbar") === "custom",
  );
  const showDefaultIntroContent = query.get("standaloneIntro") === "1";
  const stressCount = Math.max(0, Math.min(250, Number(query.get("sections") ?? 0) || 0));

  useEffect(() => {
    window.__CANVAS_SET_CUSTOM_TOOLBAR_FORMAT__ = setCustomToolbarFormat;
    return () => {
      delete window.__CANVAS_SET_CUSTOM_TOOLBAR_FORMAT__;
    };
  }, []);

  return (
    <main data-testid="benchmark-root">
      {showDefaultIntroContent && (
        <div data-benchmark-contract="default-intro-content">
          <DefaultIntroContent
            logoSrc="/benchmark-shape.svg"
            logoAlt="Benchmark intro logo"
            logoWidth={64}
            logoHeight={48}
            title="Default intro content"
          />
        </div>
      )}
      <Canvas
        homeCoordinates={coordinates.home}
        navItems={navItems}
        skipIntro={skipIntro}
        loadingText="CANVAS PARITY"
        canvasBackground={
          <div
            className="benchmark-grid pointer-events-none absolute inset-0 bg-zinc-100"
            data-benchmark-contract="background"
          />
        }
        wrapperBackground={
          <div className="absolute inset-0 bg-zinc-200" data-benchmark-contract="intro-background" />
        }
        introBackgroundGradient="linear-gradient(180deg, #e4e4e7, #f4f4f5)"
        canvasBoxGradient="linear-gradient(135deg, #ffffff, #dbeafe)"
        toolbarConfig={{
          position: "top-right",
          className: "font-sans",
          style: { backgroundColor: "#ffffff", borderColor: "#d4d4d8" },
          coordinatesFormat: customToolbarFormat
            ? formatToolbarCoordinates
            : undefined,
          scaleFormat: customToolbarFormat ? formatToolbarScale : undefined,
        }}
        navbarConfig={{
          position: "bottom",
          tooltipConfig: { disabled: true },
        }}
      >
        <HarnessBridge />
        <CanvasComponent
          offset={coordinates.home}
          coordinatesToSection={sectionForCoordinates}
        >
          <HomePanel />
        </CanvasComponent>
        <CanvasComponent
          offset={coordinates.lab}
          coordinatesToSection={sectionForCoordinates}
        >
          <LabPanel />
        </CanvasComponent>
        <CanvasComponent
          offset={coordinates.drag}
          coordinatesToSection={sectionForCoordinates}
        >
          <DragPanel />
        </CanvasComponent>
        <StressSections count={stressCount} />
      </Canvas>
    </main>
  );
}
