import { useState, useEffect } from "react";
import {
  detectPerformanceMode,
  isIOS,
  isMobile,
  prefersReducedMotion,
} from "../utils/performance";
import useWindowDimensions from "./useWindowDimensions";

export type PerformanceMode = "high" | "medium" | "low";

export interface PerformanceConfig {
  mode: PerformanceMode;
  isIOS: boolean;
  isMobile: boolean;
  prefersReducedMotion: boolean;
  enableComplexShadows: boolean;
}

const createDefaultConfig = (): PerformanceConfig => ({
  mode: "high",
  isIOS: false,
  isMobile: false,
  prefersReducedMotion: false,
  enableComplexShadows: true,
});

// Tiering is capability-based (see detectPerformanceMode): device memory and
// core count, assuming "high" when the signals are absent. The width argument
// is kept for API compatibility but no longer influences the tier — a narrow
// window is not a slow device.
const detectPerformanceConfig = (_width: number): PerformanceConfig => {
  const isIOSDevice = isIOS();
  const isMobileDevice = isMobile();
  const reducedMotion = prefersReducedMotion();
  const mode = detectPerformanceMode();

  return {
    mode,
    isIOS: isIOSDevice,
    isMobile: isMobileDevice,
    prefersReducedMotion: reducedMotion,
    enableComplexShadows: mode !== "low",
  };
};

export const usePerformanceModeForWidth = (
  width: number,
): PerformanceConfig => {
  const [config, setConfig] = useState<PerformanceConfig>(createDefaultConfig);

  useEffect(() => {
    setConfig(detectPerformanceConfig(width));
  }, []);

  return config;
};

/**
 * Hook to determine optimal performance settings based on device capabilities
 * Does not disable any animations - only provides info for optimization
 */
export const usePerformanceMode = (): PerformanceConfig => {
  const { width } = useWindowDimensions();
  return usePerformanceModeForWidth(width);
};
