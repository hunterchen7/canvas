import { type Easing } from "framer-motion";

/**
 * Canvas Library Constants
 * All configurable constants consolidated in one place
 */

// ============================================================================
// SCREEN SIZE BREAKPOINTS
// ============================================================================

export enum ScreenSizeEnum {
    SMALL_MOBILE = "small-mobile",
    MOBILE = "mobile",
    TABLET = "tablet",
    SMALL_DESKTOP = "small-desktop",
    MEDIUM_DESKTOP = "medium-desktop",
    LARGE_DESKTOP = "large-desktop",
    HUGE_DESKTOP = "huge-desktop",
}

// ============================================================================
// CANVAS DIMENSIONS
// ============================================================================

/** Default canvas width in pixels */
export const CANVAS_WIDTH = 6000;

/** Default canvas height in pixels */
export const CANVAS_HEIGHT = 4000;

// ============================================================================
// INTRO ANIMATION
// ============================================================================

/** Maximum dimensions ratio for the intro box relative to viewport */
export const MAX_DIM_RATIO = {
    width: 0.8,
    height: 0.5,
} as const;

/** Intro box aspect ratio (width:height) */
export const INTRO_ASPECT_RATIO = 3 / 2;

/** Grow animation transition config */
export const GROW_TRANSITION = {
    duration: 0.96,
    delay: 3.14,
    ease: [0.35, 0.1, 0.8, 1] as Easing,
} as const;

/** Blur mask animation transition config */
export const BLUR_TRANSITION = {
    duration: 0.85,
    delay: 1.25,
    ease: "easeIn" as Easing,
} as const;

/** Stage 2 pan-to-home transition config */
export const STAGE2_TRANSITION = {
    duration: 0.96,
    ease: [0.37, 0.1, 0.6, 1],
} as const;

// ============================================================================
// ZOOM & PAN
// ============================================================================

/** Maximum zoom level */
export const MAX_ZOOM = 3;

/** Minimum zoom bound multiplier to prevent zooming out past canvas edges */
export const ZOOM_BOUND = 1.05;

/** Minimum zoom levels per screen size */
export const MIN_ZOOMS: Record<ScreenSizeEnum, number> = {
    [ScreenSizeEnum.SMALL_MOBILE]: 0.3,
    [ScreenSizeEnum.MOBILE]: 0.35,
    [ScreenSizeEnum.TABLET]: 0.25,
    [ScreenSizeEnum.SMALL_DESKTOP]: 0.15,
    [ScreenSizeEnum.MEDIUM_DESKTOP]: 0.1,
    [ScreenSizeEnum.LARGE_DESKTOP]: 0.1,
    [ScreenSizeEnum.HUGE_DESKTOP]: 0.1,
} as const;

/** Pan animation spring config */
export const PAN_SPRING = {
    visualDuration: 0.34,
    type: "spring",
    stiffness: 200,
    damping: 25,
} as const;

/** Wheel zoom sensitivity for mouse wheel */
export const MOUSE_WHEEL_ZOOM_SENSITIVITY = 0.0015;

/** Wheel zoom sensitivity for trackpad */
export const TRACKPAD_ZOOM_SENSITIVITY = 0.015;

// ============================================================================
// INTERACTIONS
// ============================================================================

/** CSS selector for interactive elements that should not trigger pan */
export const INTERACTIVE_SELECTOR =
    "button,[role='button'],input,textarea,[contenteditable='true']," +
    "[data-toolbar-button],[data-navbar-button]";

// ============================================================================
// VIEWPORT CULLING
// ============================================================================

/** Buffer zone in pixels for hysteresis visibility detection */
export const VIEWPORT_HYSTERESIS_BUFFER = 120;

/** Threshold for showing image fallback on smaller screens */
export const IMAGE_FALLBACK_WIDTH_THRESHOLD = 2000;

// ============================================================================
// NAVBAR
// ============================================================================

/** Responsive zoom levels for navbar navigation per screen size */
export const RESPONSIVE_ZOOM_MAP: Record<ScreenSizeEnum, number> = {
    [ScreenSizeEnum.SMALL_MOBILE]: 0.5,
    [ScreenSizeEnum.MOBILE]: 0.6,
    [ScreenSizeEnum.TABLET]: 0.8,
    [ScreenSizeEnum.SMALL_DESKTOP]: 0.9,
    [ScreenSizeEnum.MEDIUM_DESKTOP]: 1,
    [ScreenSizeEnum.LARGE_DESKTOP]: 1.25,
    [ScreenSizeEnum.HUGE_DESKTOP]: 1.5,
} as const;

// ============================================================================
// PERFORMANCE
// ============================================================================

/** Debounce duration in ms for navbar clicks based on performance mode */
export const NAVBAR_DEBOUNCE_MS = {
    high: 0,
    medium: 100,
    low: 400,
} as const;

// ============================================================================
// TOOLBAR
// ============================================================================

/** Epsilon for position comparison to hide toolbar when at home */
export const TOOLBAR_OPACITY_POS_EPS = 1; // px

/** Epsilon for scale comparison to hide toolbar when at 1x */
export const TOOLBAR_OPACITY_SCALE_EPS = 0.01; // scale delta
