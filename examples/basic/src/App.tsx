import {
  Canvas,
  CanvasComponent,
  Draggable,
  DraggableImage,
  type NavItem,
  type SectionCoordinates,
} from "@hunterchen/canvas";
import {
  Home,
  Sparkles,
  Puzzle,
  Users,
  BarChart3,
  GripVertical,
} from "lucide-react";

// Section coordinates
const coordinates = {
  home: { x: 2600, y: 1700, width: 800, height: 600 },
  features: { x: 800, y: 400, width: 800, height: 600 },
  playground: { x: 4400, y: 400, width: 800, height: 600 },
  team: { x: 800, y: 2800, width: 800, height: 600 },
  stats: { x: 4400, y: 2800, width: 800, height: 600 },
} satisfies Record<string, SectionCoordinates>;

// Navigation items
const navItems: NavItem[] = [
  { id: "home", label: "Home", icon: "Home", ...coordinates.home, isHome: true },
  { id: "features", label: "Features", icon: "Sparkles", ...coordinates.features },
  { id: "playground", label: "Playground", icon: "Puzzle", ...coordinates.playground },
  { id: "team", label: "Team", icon: "Users", ...coordinates.team },
  { id: "stats", label: "Stats", icon: "BarChart3", ...coordinates.stats },
];

function App() {
  return (
    <div className="h-full w-full">
      <Canvas
        homeCoordinates={coordinates.home}
        navItems={navItems}
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

        {/* Team Section - Bottom Left (with draggables) */}
        <CanvasComponent offset={coordinates.team}>
          <TeamSection />
        </CanvasComponent>

        {/* Stats Section - Bottom Right */}
        <CanvasComponent offset={coordinates.stats}>
          <StatsSection />
        </CanvasComponent>
      </Canvas>
    </div>
  );
}

// ============== Section Components ==============

function HomeSection() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-neutral-300 bg-white/80 p-8 shadow-lg backdrop-blur-sm">
      <Home className="mb-4 h-12 w-12 text-neutral-600" />
      <h1 className="mb-2 text-3xl font-bold text-neutral-800">
        Welcome to Canvas
      </h1>
      <p className="mb-6 max-w-md text-center text-neutral-600">
        An interactive, pannable, and zoomable canvas for building immersive
        web experiences. Navigate using the buttons below or drag to explore.
      </p>
      <div className="flex gap-2 text-sm text-neutral-500">
        <span className="rounded-full bg-neutral-100 px-3 py-1">Pan</span>
        <span className="rounded-full bg-neutral-100 px-3 py-1">Zoom</span>
        <span className="rounded-full bg-neutral-100 px-3 py-1">Navigate</span>
      </div>
    </div>
  );
}

function FeaturesSection() {
  const features = [
    { title: "Smooth Panning", description: "Click and drag to pan around the canvas" },
    { title: "Pinch to Zoom", description: "Use scroll or pinch gestures to zoom" },
    { title: "Section Navigation", description: "Jump between sections with the navbar" },
    { title: "Draggable Elements", description: "Some elements can be freely moved" },
    { title: "Performance Optimized", description: "Adaptive rendering for all devices" },
  ];

  return (
    <div className="flex h-full w-full flex-col rounded-2xl border border-neutral-300 bg-white/80 p-8 shadow-lg backdrop-blur-sm">
      <div className="mb-6 flex items-center gap-3">
        <Sparkles className="h-8 w-8 text-neutral-600" />
        <h2 className="text-2xl font-bold text-neutral-800">Features</h2>
      </div>
      <ul className="space-y-4">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3">
            <div className="mt-1 h-2 w-2 rounded-full bg-neutral-400" />
            <div>
              <h3 className="font-semibold text-neutral-700">{feature.title}</h3>
              <p className="text-sm text-neutral-500">{feature.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlaygroundSection() {
  // Canadian provinces and territories - scattered for puzzle assembly
  // Using Wikimedia Commons SVG-based province outlines
  const provinces = [
    // Western
    { name: "British Columbia", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/British_Columbia_in_Canada_2.svg/200px-British_Columbia_in_Canada_2.svg.png", x: 450, y: 320, w: 70, h: 80 },
    { name: "Alberta", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Alberta_in_Canada_2.svg/200px-Alberta_in_Canada_2.svg.png", x: 120, y: 180, w: 60, h: 75 },
    { name: "Saskatchewan", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Saskatchewan_in_Canada_2.svg/200px-Saskatchewan_in_Canada_2.svg.png", x: 580, y: 100, w: 55, h: 70 },
    { name: "Manitoba", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Manitoba_in_Canada_2.svg/200px-Manitoba_in_Canada_2.svg.png", x: 300, y: 380, w: 55, h: 75 },

    // Central
    { name: "Ontario", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Ontario_in_Canada_2.svg/200px-Ontario_in_Canada_2.svg.png", x: 50, y: 350, w: 80, h: 70 },
    { name: "Quebec", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Quebec_in_Canada_2.svg/200px-Quebec_in_Canada_2.svg.png", x: 520, y: 230, w: 90, h: 90 },

    // Atlantic
    { name: "New Brunswick", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/New_Brunswick_in_Canada_2.svg/200px-New_Brunswick_in_Canada_2.svg.png", x: 200, y: 90, w: 40, h: 45 },
    { name: "Nova Scotia", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Nova_Scotia_in_Canada_2.svg/200px-Nova_Scotia_in_Canada_2.svg.png", x: 650, y: 380, w: 45, h: 35 },
    { name: "PEI", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Prince_Edward_Island_in_Canada_2.svg/200px-Prince_Edward_Island_in_Canada_2.svg.png", x: 380, y: 150, w: 30, h: 20 },
    { name: "Newfoundland", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Newfoundland_and_Labrador_in_Canada_2.svg/200px-Newfoundland_and_Labrador_in_Canada_2.svg.png", x: 150, y: 280, w: 70, h: 80 },

    // Territories
    { name: "Yukon", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Yukon_in_Canada_2.svg/200px-Yukon_in_Canada_2.svg.png", x: 630, y: 280, w: 50, h: 60 },
    { name: "NWT", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Northwest_Territories_in_Canada_2.svg/200px-Northwest_Territories_in_Canada_2.svg.png", x: 280, y: 200, w: 80, h: 70 },
    { name: "Nunavut", src: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Nunavut_in_Canada_2.svg/200px-Nunavut_in_Canada_2.svg.png", x: 450, y: 80, w: 100, h: 90 },
  ];

  return (
    <div className="relative h-full w-full overflow-visible rounded-2xl border border-neutral-300 bg-white/80 p-8 shadow-lg backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-3">
        <Puzzle className="h-8 w-8 text-neutral-600" />
        <h2 className="text-2xl font-bold text-neutral-800">Canada Puzzle</h2>
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
          key={prov.name}
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

function TeamSection() {
  const team = [
    { name: "Alex Chen", role: "Designer", seed: "alex" },
    { name: "Jordan Lee", role: "Developer", seed: "jordan" },
    { name: "Sam Rivera", role: "PM", seed: "sam" },
  ];

  return (
    <div className="flex h-full w-full flex-col rounded-2xl border border-neutral-300 bg-white/80 p-8 shadow-lg backdrop-blur-sm">
      <div className="mb-6 flex items-center gap-3">
        <Users className="h-8 w-8 text-neutral-600" />
        <h2 className="text-2xl font-bold text-neutral-800">Team</h2>
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        Drag the team cards to rearrange them!
      </p>
      <div className="flex flex-1 gap-4">
        {team.map((member) => (
          <Draggable key={member.name}>
            <div className="group flex cursor-grab flex-col items-center rounded-xl border border-neutral-200 bg-white p-4 shadow-md transition-shadow hover:shadow-lg active:cursor-grabbing">
              <div className="absolute -right-1 -top-1 opacity-0 transition-opacity group-hover:opacity-100">
                <GripVertical className="h-4 w-4 text-neutral-400" />
              </div>
              <img
                src={`https://picsum.photos/seed/${member.seed}/100/100`}
                alt={member.name}
                className="mb-3 h-16 w-16 rounded-full object-cover"
              />
              <h3 className="font-semibold text-neutral-700">{member.name}</h3>
              <p className="text-sm text-neutral-500">{member.role}</p>
            </div>
          </Draggable>
        ))}
      </div>
    </div>
  );
}

function StatsSection() {
  const stats = [
    { label: "Active Users", value: "12,345" },
    { label: "Projects Created", value: "8,901" },
    { label: "Total Interactions", value: "2.4M" },
    { label: "Satisfaction Rate", value: "98%" },
  ];

  return (
    <div className="flex h-full w-full flex-col rounded-2xl border border-neutral-300 bg-white/80 p-8 shadow-lg backdrop-blur-sm">
      <div className="mb-6 flex items-center gap-3">
        <BarChart3 className="h-8 w-8 text-neutral-600" />
        <h2 className="text-2xl font-bold text-neutral-800">Stats</h2>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 p-4"
          >
            <span className="text-3xl font-bold text-neutral-800">
              {stat.value}
            </span>
            <span className="text-sm text-neutral-500">{stat.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-neutral-100 p-3">
        <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        <span className="text-sm text-neutral-600">Live data</span>
      </div>
    </div>
  );
}

export default App;
