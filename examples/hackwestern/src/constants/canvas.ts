import type { NavItem, SectionCoordinates } from "@hunterchen/canvas";

/**
 * Navigation items configuration for the canvas navbar.
 * Each item defines a section with its label, icon, coordinates, and whether it's the home section.
 */
export const navItems: NavItem[] = [
  {
    id: "home",
    label: "Home",
    icon: "Home",
    x: 2867,
    y: 1200,
    width: 264,
    height: 800,
    isHome: true,
  },
  {
    id: "about",
    label: "About",
    icon: "Info",
    x: 1400,
    y: 400,
    width: 1013,
    height: 800,
  },
  {
    id: "projects",
    label: "Projects",
    icon: "LayoutDashboard",
    x: 3663,
    y: 400,
    width: 1200,
    height: 895,
  },
  {
    id: "sponsors",
    label: "Sponsors",
    icon: "Handshake",
    x: 760,
    y: 1700,
    width: 1240,
    height: 900,
  },
  {
    id: "faq",
    label: "FAQ",
    icon: "HelpCircle",
    x: 2070,
    y: 2600,
    width: 1768,
    height: 917,
  },
  {
    id: "team",
    label: "Team",
    icon: "Users",
    x: 4050,
    y: 1660,
    width: 1080,
    height: 917,
  },
];

/**
 * Helper to get a specific section's coordinates by id.
 */
export const getCoordinates = (id: string): SectionCoordinates => {
  const item = navItems.find((item) => item.id === id);
  if (!item) throw new Error(`Section "${id}" not found in navItems`);
  return { x: item.x, y: item.y, width: item.width, height: item.height };
};

/**
 * Coordinates object derived from navItems for convenient access.
 */
export const coordinates = Object.fromEntries(
  navItems.map((item) => [
    item.id,
    { x: item.x, y: item.y, width: item.width, height: item.height },
  ])
) as {
  home: SectionCoordinates;
  about: SectionCoordinates;
  projects: SectionCoordinates;
  sponsors: SectionCoordinates;
  faq: SectionCoordinates;
  team: SectionCoordinates;
};
