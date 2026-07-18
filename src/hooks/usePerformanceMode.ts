import { useState, useEffect } from "react";
import { isIOS, isMobile, prefersReducedMotion } from "../utils/performance";
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

const detectPerformanceConfig = (width: number): PerformanceConfig => {
  const isIOSDevice = isIOS();
  const isMobileDevice = isMobile();
  const reducedMotion = prefersReducedMotion();

  let mode: PerformanceMode = "high";
  if (isIOSDevice || reducedMotion || width < 768) {
    mode = "low";
  } else if (isMobileDevice || width < 1024) {
    mode = "medium";
  }

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
