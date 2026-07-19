/**
 * Generic types for the canvas library
 * Apps should extend these types with their specific enums and constants
 */

import type { Transition } from "framer-motion";
import { ScreenSizeEnum } from "../lib/constants";

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

/**
 * Preset positions for the navbar
 */
export type NavbarPosition = 'top' | 'bottom' | 'left' | 'right';

/**
 * Display modes for navbar items
 */
export type NavbarDisplayMode =
  | 'icons'         // Icons only, label shows on expand (default)
  | 'labels'        // Labels only, no icons
  | 'icons-labels'  // Always show both icon and label
  | 'compact';      // Icons only, no expansion - just highlight

/**
 * Tooltip configuration for navbar buttons
 */
export interface NavbarTooltipConfig {
  /** Disable tooltips entirely. Default: false */
  disabled?: boolean;
  /** Additional className for tooltip */
  className?: string;
  /** Inline styles for tooltip */
  style?: React.CSSProperties;
  /** Delay before showing tooltip in ms. Default: 100 */
  delay?: number;
}

/**
 * Button styling configuration for navbar
 */
export interface NavbarButtonConfig {
  /** Additional className for all buttons */
  className?: string;
  /** Inline styles for all buttons */
  style?: React.CSSProperties;
  /** Active/pushed state className */
  activeClassName?: string;
  /** Active state inline styles */
  activeStyle?: React.CSSProperties;
  /** Hover state className */
  hoverClassName?: string;
  /** Hover state inline styles */
  hoverStyle?: React.CSSProperties;
  /** Icon className */
  iconClassName?: string;
  /** Icon size in pixels. Default: 20 */
  iconSize?: number;
  /** Label className */
  labelClassName?: string;
  /** Label inline styles */
  labelStyle?: React.CSSProperties;
}

/**
 * Animation timing configuration for intro animations.
 * Re-exports Framer Motion's Transition type for full flexibility.
 *
 * @example
 * // Simple duration-based transition
 * const timing: AnimationTimingConfig = {
 *   duration: 1.5,
 *   delay: 0.5,
 *   ease: "easeInOut"
 * };
 *
 * @example
 * // Custom bezier curve
 * const timing: AnimationTimingConfig = {
 *   duration: 0.96,
 *   delay: 3.14,
 *   ease: [0.35, 0.1, 0.8, 1]
 * };
 */
export type AnimationTimingConfig = Transition;

/**
 * Configuration options for the canvas navbar
 */
export interface NavbarConfig {
  // === Visibility ===
  /** Hide the navbar entirely. Default: false */
  hidden?: boolean;

  // === Display Mode ===
  /** How to display items. Default: 'icons' */
  display?: NavbarDisplayMode;

  // === Positioning ===
  /** Preset position. Default: 'bottom' */
  position?: NavbarPosition;

  // === Container Styling ===
  /** Additional className for the navbar container */
  className?: string;
  /** Inline styles for the navbar container */
  style?: React.CSSProperties;

  // === Button Configuration ===
  /** Button styling options */
  buttonConfig?: NavbarButtonConfig;

  // === Tooltip Configuration ===
  /** Tooltip options */
  tooltipConfig?: NavbarTooltipConfig;

  // === Spacing ===
  /** Gap between buttons in pixels. Default: 4 */
  gap?: number;
  /** Padding inside the navbar in pixels. Default: 4 */
  padding?: number;
}

/**
 * Configuration for zoom behavior per screen size.
 * Partial overrides are merged with library defaults.
 */
/** Zoom bounds for a single input method (pinch or wheel/trackpad). */
export interface ZoomInputBounds {
  /** Max zoom for this input. Falls back to zoomConfig.maxZoom, then MAX_ZOOM (3). */
  maxZoom?: number;
  /** Min zoom for this input. Falls back to the resolved per-screen-size MIN_ZOOM. */
  minZoom?: number;
}

export interface ZoomConfig {
  /** Override minimum zoom levels per screen size. Merged with defaults from MIN_ZOOMS. */
  minZooms?: Partial<Record<ScreenSizeEnum, number>>;
  /** Override navigation zoom levels per screen size. Merged with defaults from RESPONSIVE_ZOOM_MAP. */
  responsiveZoomMap?: Partial<Record<ScreenSizeEnum, number>>;
  /** Max zoom ceiling shared by wheel/trackpad and pinch. Default: MAX_ZOOM (3). */
  maxZoom?: number;
  /** Wheel/trackpad-specific zoom bounds (override maxZoom / MIN_ZOOM). */
  wheel?: ZoomInputBounds;
  /** Pinch-gesture-specific zoom bounds (override maxZoom / MIN_ZOOM). */
  pinch?: ZoomInputBounds;
}
