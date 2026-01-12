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

/**
 * CanvasSection is now a generic string type.
 * Apps define their own section IDs as strings.
 */
export type CanvasSection = string;

/**
 * Configuration for a single navigation item.
 * Combines section identity, display info, and coordinates.
 */
export interface NavItem {
  /** Unique identifier for this section */
  id: string;
  /** Display label shown in the navbar */
  label: string;
  /** Lucide icon name (e.g., "Home", "Info", "Users") */
  icon?: string;
  /** Custom icon component (alternative to Lucide icon) */
  customIcon?: React.ComponentType<{ className?: string }>;
  /** X coordinate on the canvas */
  x: number;
  /** Y coordinate on the canvas */
  y: number;
  /** Width of the section viewport */
  width: number;
  /** Height of the section viewport */
  height: number;
  /** If true, clicking this section triggers the reset/home behavior */
  isHome?: boolean;
}
