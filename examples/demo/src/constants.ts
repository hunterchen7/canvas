// Code examples for the Features section
export const examples = [
  {
    title: "Navigation Items",
    code: `const navItems: NavItem[] = [
  {
    id: "home",
    label: "Home",
    icon: "Home",
    x: 2600,
    y: 1700,
    width: 1200,
    height: 800,
    isHome: true
  },
  {
    id: "about",
    label: "About",
    icon: "Info",
    x: 800,
    y: 400,
    width: 1200,
    height: 800
  }
];

<Canvas 
  homeCoordinates={homeCoordinates} 
  navItems={navItems}
/>`,
  },
  {
    title: "Draggable Elements",
    code: `import { Draggable } from '@hunterchen/canvas';

function MyComponent() {
  return (
    <Draggable initialPos={{ x: 50, y: 50 }}>
      <div className="card">
        Drag me around!
      </div>
    </Draggable>
  );
}`,
  },
];

// Canadian provinces and territories
export const baseProvinces = [
  // Western - dimensions from viewBox (width x height), magic numbers originate from the orignal SVGs
  {
    name: "British Columbia",
    src: "/provinces/bc.svg",
    w: Math.round(11991 * 0.01),
    h: Math.round(19712 * 0.01),
  },
  {
    name: "Alberta",
    src: "/provinces/ab.svg",
    w: Math.round(9108 * 0.01),
    h: Math.round(14724 * 0.01),
  },
  {
    name: "Saskatchewan",
    src: "/provinces/sk.svg",
    w: Math.round(8362 * 0.01),
    h: Math.round(14043 * 0.01),
  },
  {
    name: "Manitoba",
    src: "/provinces/mb.svg",
    w: Math.round(9453 * 0.01),
    h: Math.round(13477 * 0.01),
  },

  // Central
  {
    name: "Ontario",
    src: "/provinces/on.svg",
    w: Math.round(17976 * 0.01),
    h: Math.round(17692 * 0.01),
  },
  {
    name: "Quebec",
    src: "/provinces/qc.svg",
    w: Math.round(18073 * 0.01),
    h: Math.round(20233 * 0.01),
  },
  // Atlantic
  {
    name: "New Brunswick",
    src: "/provinces/nb.svg",
    w: Math.round(4698 * 0.01),
    h: Math.round(4885 * 0.01),
  },
  {
    name: "Nova Scotia",
    src: "/provinces/ns.svg",
    w: Math.round(5515 * 0.01),
    h: Math.round(6471 * 0.01),
  },
  {
    name: "PEI",
    src: "/provinces/pe.svg",
    w: Math.round(1977 * 0.01),
    h: Math.round(1046 * 0.01),
  },
  {
    name: "Newfoundland",
    src: "/provinces/nl.svg",
    w: Math.round(15945 * 0.01),
    h: Math.round(12001 * 0.01),
  },

  // Territories
  {
    name: "Yukon",
    src: "/provinces/yt.svg",
    w: Math.round(8908 * 0.01),
    h: Math.round(14282 * 0.01),
  },
  {
    name: "NWT",
    src: "/provinces/nt.svg",
    w: Math.round(15401 * 0.01),
    h: Math.round(23033 * 0.01),
  },
  {
    name: "Nunavut",
    src: "/provinces/nu.svg",
    w: Math.round(29287 * 0.01),
    h: Math.round(37253 * 0.01),
  },
];
