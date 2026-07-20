/**
 * Performance optimization utilities for cross-platform compatibility
 * Particularly focused on iOS Safari performance issues
 */

// Detect if the device is iOS
export const isIOS = (): boolean => {
  if (typeof window === "undefined") return false;

  return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

// Detect if the device is a mobile device
export const isMobile = (): boolean => {
  if (typeof window === "undefined") return false;

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
};

// Check if user prefers reduced motion
export const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined") return false;

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

export type PerformanceModeValue = "high" | "medium" | "low";

// Manual override for testing and as a user escape hatch:
// ?canvasPerf=high|medium|low or localStorage["canvas-perf-mode"].
const readPerformanceOverride = (): PerformanceModeValue | null => {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get(
      "canvasPerf",
    );
    const value =
      fromQuery ?? window.localStorage.getItem("canvas-perf-mode");
    return value === "high" || value === "medium" || value === "low"
      ? value
      : null;
  } catch {
    return null;
  }
};

/**
 * Performance tier detection.
 *
 * Philosophy: assume a device is CAPABLE. Modern phones (recent iPhones,
 * flagship Androids) and any desktop run the full experience at 60fps; the
 * reduced tiers exist for genuinely constrained devices and for users who ask
 * for a calmer presentation.
 *
 * Why not sniff hardware? There is no RELIABLE static signal for device power:
 * - navigator.deviceMemory is Chromium-only (Safari/Firefox omit it) AND is
 *   FARBLED downward by privacy browsers (Brave) for fingerprint resistance —
 *   so a flagship on Brave reports <=4 GiB and gets misclassified as mid-range.
 * - navigator.hardwareConcurrency is likewise farbled (Brave caps it) and
 *   meaningless on Android (budget chips report 8 cores).
 * Because a capable device cannot be told apart from a weak one at page load,
 * we assume capable rather than punish the majority for an unmeasurable
 * minority. (Genuinely low-end tiers stay reachable via the explicit override
 * below, and prefers-reduced-motion.)
 *
 * Signals used, strongest first:
 * - ?canvasPerf=high|medium|low or localStorage["canvas-perf-mode"] override.
 * - prefers-reduced-motion -> low (the one reliable "give me less" signal).
 * - otherwise -> high.
 */
export const detectPerformanceMode = (): PerformanceModeValue => {
  if (typeof window === "undefined") return "high";

  const override = readPerformanceOverride();
  if (override) return override;

  if (prefersReducedMotion()) return "low";

  return "high";
};

// Get optimized will-change value based on state
export const getWillChange = (
  isAnimating: boolean,
  properties: string[] = ["transform"],
): string => {
  // Only apply will-change when actually animating
  // Leaving it on causes memory issues on iOS
  return isAnimating ? properties.join(", ") : "auto";
};
