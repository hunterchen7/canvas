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
  /** Lucide icon name or a custom icon component */
  icon: string | React.ComponentType<{ className?: string }>;
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

/**
 * Preset positions for the toolbar
 */
export type ToolbarPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * What to display in the toolbar
 */
export type ToolbarDisplayMode = 'coordinates' | 'scale' | 'both';

/**
 * Configuration options for the canvas toolbar
 */
export interface ToolbarConfig {
  // === Visibility ===
  /** Hide the toolbar entirely. Default: false */
  hidden?: boolean;

  // === Display Mode ===
  /** What to show: 'coordinates', 'scale', or 'both'. Default: 'both' */
  display?: ToolbarDisplayMode;

  // === Positioning ===
  /** Preset position. Default: 'top-left' */
  position?: ToolbarPosition;

  // === Auto-hide Behavior ===
  /** Disable auto-hide when at home position. Default: false */
  disableAutoHide?: boolean;

  // === Styling (Tailwind-friendly) ===
  /** Additional className for the container */
  className?: string;
  /** Additional className for the coordinates text */
  coordinatesClassName?: string;
  /** Additional className for the scale text */
  scaleClassName?: string;
  /** Additional className for the separator */
  separatorClassName?: string;

  // === Styling (non-Tailwind / inline styles) ===
  /** Inline styles for the container */
  style?: React.CSSProperties;
  /** Inline styles for the coordinates */
  coordinatesStyle?: React.CSSProperties;
  /** Inline styles for the scale */
  scaleStyle?: React.CSSProperties;

  // === Content Customization ===
  /** Custom separator between coordinates and scale. Default: ' | ' */
  separator?: string;
  /** Gap around the separator in pixels or CSS value. Default: undefined (uses inline spacing) */
  separatorGap?: number | string;
  /** Format for coordinates. Default: '(x, y)' */
  coordinatesFormat?: (x: number, y: number) => string;
  /** Format for scale. Default: '1.00x' */
  scaleFormat?: (scale: number) => string;
}
