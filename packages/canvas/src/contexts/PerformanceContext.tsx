import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import useWindowDimensions from "../hooks/useWindowDimensions";
import { isIOS, isMobile, prefersReducedMotion } from "../utils/performance";

export type PerformanceMode = "high" | "medium" | "low";

export interface PerformanceConfig {
    mode: PerformanceMode;
    isIOS: boolean;
    isMobile: boolean;
    prefersReducedMotion: boolean;
    enableComplexShadows: boolean;
}

const defaultConfig: PerformanceConfig = {
    mode: "high",
    isIOS: false,
    isMobile: false,
    prefersReducedMotion: false,
    enableComplexShadows: true,
};

const PerformanceContext = createContext<PerformanceConfig>(defaultConfig);

export const usePerformance = () => useContext(PerformanceContext);

// Backward compatibility alias
export const usePerformanceMode = usePerformance;

interface PerformanceProviderProps {
    children: ReactNode;
}

/**
 * Performance Provider - Centralized performance mode detection
 * 
 * Detects device capabilities and user preferences once at the top level,
 * avoiding redundant device detection across multiple components.
 * 
 * Usage:
 *   <PerformanceProvider>
 *     <App />
 *   </PerformanceProvider>
 * 
 * Then in components:
 *   const { mode, isIOS, enableComplexShadows } = usePerformance();
 */
export const PerformanceProvider: React.FC<PerformanceProviderProps> = ({ children }) => {
    const [config, setConfig] = useState<PerformanceConfig>(defaultConfig);
    const { width } = useWindowDimensions();

    useEffect(() => {
        const isIOSDevice = isIOS();
        const isMobileDevice = isMobile();
        const reducedMotion = prefersReducedMotion();

        let mode: PerformanceMode = "high";

        // Determine performance mode based on device and screen size
        if (isIOSDevice || reducedMotion || width < 768) {
            mode = "low";
        } else if (isMobileDevice || width < 1024) {
            mode = "medium";
        }

        setConfig({
            mode,
            isIOS: isIOSDevice,
            isMobile: isMobileDevice,
            prefersReducedMotion: reducedMotion,
            // Use simpler shadows on iOS and low-end devices for better performance
            enableComplexShadows: mode !== "low",
        });
    }, [width]);

    return (
        <PerformanceContext.Provider value={config}>
            {children}
        </PerformanceContext.Provider>
    );
};
