/**
 * Generic types for the canvas library
 * Apps should extend these types with their specific enums and constants
 */

export interface SectionCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export enum CanvasSection {
  Home = "home",
  About = "about",
  Projects = "projects",
  Sponsors = "sponsors",
  FAQ = "faq",
  Team = "team",
}
