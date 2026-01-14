import { useState } from "react";
import {
  Canvas,
  CanvasComponent,
  DraggableImage,
  type NavItem,
  type SectionCoordinates,
} from "@hunterchen/canvas";
import {
  Home,
  Puzzle,
  RotateCcw,
  Github,
  PackageOpen,
  Code,
} from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { examples, baseProvinces } from "./constants";
import { generateProvinceLayout } from "./utils";

// Section coordinates
export const coordinates = {
  home: { x: 2600, y: 500, width: 1200, height: 800 },
  features: { x: 1000, y: 2100, width: 1200, height: 950 },
  playground: { x: 4200, y: 2100, width: 1200, height: 800 },
} satisfies Record<string, SectionCoordinates>;

// Navigation items
export const navItems: NavItem[] = [
  {
    id: "home",
    label: "Home",
    icon: "Home",
    ...coordinates.home,
    isHome: true,
  },
  { id: "features", label: "Examples", icon: "Code", ...coordinates.features },
  {
    id: "playground",
    label: "Playground",
    icon: "Puzzle",
    ...coordinates.playground,
  },
];

function App() {
  return (
    <div className="h-full w-full">
      <Canvas
        homeCoordinates={coordinates.home}
        navItems={navItems}
        skipIntro={true}
      >
        {/* Home Section - Center */}
        <CanvasComponent offset={coordinates.home}>
          <HomeSection />
        </CanvasComponent>

        {/* Features Section - Top Left */}
        <CanvasComponent offset={coordinates.features}>
          <FeaturesSection />
        </CanvasComponent>

        {/* Playground Section - Top Right (with draggable images) */}
        <CanvasComponent offset={coordinates.playground}>
          <PlaygroundSection />
        </CanvasComponent>
      </Canvas>
    </div>
  );
}

// ============== Section Components ==============

function HomeSection() {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-neutral-300 bg-white/80 p-8 shadow-lg backdrop-blur-sm cursor-auto"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      style={{ userSelect: "text" }}
    >
      <Home className="mb-4 h-12 w-12 text-neutral-600" />
      <h1 className="mb-2 text-3xl font-bold text-neutral-800">
        Welcome to Canvas
      </h1>
      <p className="mb-6 max-w-md text-center text-neutral-600">
        An interactive, pannable, and zoomable canvas, originally built for the{" "}
        <a
          href="https://archive.hackwestern.com/2025"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-neutral-800"
        >
          Hack Western 12 website
        </a>
        . Navigate using the buttons below or by dragging the canvas. Also
        includes a custom draggable image components, see the puzzle section!
      </p>
      <div className="mt-2 flex gap-3">
        <a
          href="https://github.com/hunterchen7/canvas"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-neutral-800 px-4 py-2 text-sm text-white transition-colors hover:bg-neutral-700"
        >
          <Github className="h-4 w-4" />
          GitHub
        </a>
        <a
          href="https://www.npmjs.com/package/@hunterchen/canvas"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-500"
        >
          <PackageOpen className="h-4 w-4" />
          npm
        </a>
      </div>
    </div>
  );
}

function FeaturesSection() {
  return (
    <div
      className="flex h-full w-full flex-col rounded-2xl border border-neutral-300 bg-white/80 p-8 shadow-lg backdrop-blur-sm overflow-auto"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      style={{ userSelect: "text" }}
    >
      <div className="mb-6 flex items-center w-full justify-between gap-3">
        <div className="flex items-center gap-3">
          <Code className="h-8 w-8 text-neutral-600" />
          <h2 className="text-2xl font-bold text-neutral-800">Code Examples</h2>
        </div>
        <a
          href="https://github.com/hunterchen7/canvas/tree/main/examples"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-neutral-800 px-4 py-2 text-sm text-white transition-colors hover:bg-neutral-700"
        >
          <Github className="h-4 w-4" />
          Examples
        </a>
      </div>
      <div className="space-y-6">
        {examples.map((example, i) => (
          <div key={i} className="space-y-2">
            <h3 className="text-lg font-semibold text-neutral-700">
              {example.title}
            </h3>
            <div className="overflow-x-auto rounded-lg">
              <SyntaxHighlighter
                language="typescript"
                style={oneDark}
                customStyle={{
                  margin: 0,
                  borderRadius: "0.5rem",
                  fontSize: "0.75rem",
                }}
              >
                {example.code}
              </SyntaxHighlighter>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlaygroundSection() {
  // Generate smart non-overlapping layout based on province sizes
  const positions = generateProvinceLayout(baseProvinces, 1100, 800);

  const provinces = baseProvinces.map((prov, i) => ({
    ...prov,
    x: positions[i].x,
    y: positions[i].y,
  }));

  // Reset key - changing this forces all DraggableImages to remount
  const [resetKey, setResetKey] = useState(0);

  return (
    <div className="relative h-full w-full overflow-visible rounded-2xl border border-neutral-300 bg-white/80 p-8 shadow-lg backdrop-blur-sm cursor-auto">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Puzzle className="h-8 w-8 text-neutral-600" />
          <h2 className="text-2xl font-bold text-neutral-800">
            Draggable Images Demo
          </h2>
        </div>
        <button
          onClick={() => setResetKey((k) => k + 1)}
          className="flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-200"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
      </div>
      <p className="mb-2 text-sm text-neutral-500">
        Assemble Canada! Drag the provinces and territories into place.
      </p>
      <div className="text-xs text-neutral-400">
        (Only the province shapes are draggable, not the background)
      </div>

      {/* Draggable province shapes */}
      {provinces.map((prov) => (
        <DraggableImage
          key={`${prov.name}-${resetKey}`}
          src={prov.src}
          alt={prov.name}
          initialPos={{ x: prov.x, y: prov.y }}
          width={prov.w}
          height={prov.h}
        />
      ))}
    </div>
  );
}

export default App;
