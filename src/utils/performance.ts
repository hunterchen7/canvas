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
 * Capability-based performance tier detection.
 *
 * Philosophy: assume a device is CAPABLE unless it presents hard evidence of
 * being low-end. Modern phones (recent iPhones, flagship Androids) run the
 * full experience at 60fps; only genuinely memory/CPU-starved devices need
 * the reduced tiers. Form factor is not capability: screen width and mobile
 * user agents say nothing about GPU/CPU power and are deliberately NOT used.
 *
 * Signals, strongest first:
 * - navigator.deviceMemory (Chromium only; GiB, capped at 8): <=2 GiB is a
 *   budget device (low), <=4 GiB is older mid-range (medium).
 * - navigator.hardwareConcurrency: weak on Android (budget chips still report
 *   8 cores), but <=3 cores is credible low-end evidence anywhere.
 * - Safari/Firefox expose neither meaningfully -> assume high. iPhones in
 *   particular are uniformly capable; the old iOS->low rule punished the
 *   best devices.
 * - prefers-reduced-motion -> low (most conservative presentation).
 */
export const detectPerformanceMode = (): PerformanceModeValue => {
  if (typeof window === "undefined") return "high";

  const override = readPerformanceOverride();
  if (override) return override;

  if (prefersReducedMotion()) return "low";

  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  if (memory !== undefined) {
    if (memory <= 2) return "low";
    if (memory <= 4) return "medium";
    return "high";
  }

  const cores = navigator.hardwareConcurrency;
  if (typeof cores === "number" && cores > 0 && cores <= 3) return "medium";

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
