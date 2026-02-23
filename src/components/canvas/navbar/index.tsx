import { motion, useMotionValueEvent } from "framer-motion";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import SingleButton from "./single-button";
import type { NavItem, NavbarConfig, NavbarPosition } from "../../../types";
import { useCanvasContext } from "../../../contexts/CanvasContext";
import useWindowDimensions from "../../../hooks/useWindowDimensions";
import { usePerformanceMode } from "../../../hooks/usePerformanceMode";
import {
  getScreenSizeEnum,
  getSectionPanCoordinates,
} from "../../../lib/canvas";
import {
  RESPONSIVE_ZOOM_MAP,
  NAVBAR_DEBOUNCE_MS,
} from "../../../lib/constants";
import { cn } from "../../../lib/utils";

interface NavbarProps {
  panToOffset: (
    offset: { x: number; y: number },
    onComplete?: () => void,
    zoom?: number,
  ) => void;
  onReset: () => void;
  /** Array of navigation items defining sections, their icons, and coordinates */
  items: NavItem[];
  /** Navbar configuration options */
  config?: NavbarConfig;
  /** Register a handler so external code can trigger navigation via navigateToSection */
  onRegisterNavigate?: (handler: ((sectionId: string) => void) | null) => void;
}

const positionStyles: Record<NavbarPosition, React.CSSProperties> = {
  top: {
    top: "1rem",
    bottom: "auto",
    left: "50%",
    transform: "translateX(-50%)",
  },
  bottom: {
    bottom: "1rem",
    top: "auto",
    left: "50%",
    transform: "translateX(-50%)",
  },
  left: {
    left: "1rem",
    right: "auto",
    top: "50%",
    transform: "translateY(-50%)",
  },
  right: {
    right: "1rem",
    left: "auto",
    top: "50%",
    transform: "translateY(-50%)",
  },
};

// Responsive position adjustments (mobile vs desktop)
const responsivePositionClasses: Record<NavbarPosition, string> = {
  top: "top-12 md:top-4",
  bottom: "bottom-12 md:bottom-4",
  left: "left-4",
  right: "right-4",
};

export default function Navbar({
  panToOffset,
  onReset,
  items,
  config = {},
  onRegisterNavigate,
}: NavbarProps) {
  const { x, y, scale, animationStage, setNextTargetSection } =
    useCanvasContext();
  const [expandedButton, setExpandedButton] = useState<string | null>(null);
  const activePans = useRef(0);
  const panTimeout = useRef<NodeJS.Timeout | null>(null);

  // Debounce state
  const debounceBlocked = useRef(false);
  const debounceCooldownTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const { height, width } = useWindowDimensions();
  const { mode } = usePerformanceMode();

  const defaultZoom = RESPONSIVE_ZOOM_MAP[getScreenSizeEnum(width)];

  // Derive debounce duration from performance mode
  const debounceMs = NAVBAR_DEBOUNCE_MS[mode] ?? 0;

  // Extract config values
  const {
    display = "icons",
    position = "bottom",
    className,
    style,
    buttonConfig,
    tooltipConfig,
    gap,
    padding,
  } = config;

  const isVertical = position === "left" || position === "right";

  // Find the home section from items
  const homeItem = useMemo(() => items.find((item) => item.isHome), [items]);

  // Leading-edge debounce handler
  const handleDebouncedClick = useCallback(
    (callback: () => void) => {
      if (debounceMs === 0) {
        callback();
        return;
      }

      if (debounceBlocked.current) {
        // We're in the cooldown window; ignore this click
        return;
      }

      // Enter cooldown and perform the click immediately
      debounceBlocked.current = true;
      callback();

      if (debounceCooldownTimeout.current) {
        clearTimeout(debounceCooldownTimeout.current);
      }

      debounceCooldownTimeout.current = setTimeout(() => {
        debounceBlocked.current = false;
        debounceCooldownTimeout.current = null;
      }, debounceMs);
    },
    [debounceMs],
  );

  const updateExpandedButton = () => {
    // reset activePans if no movement has occurred recently
    if (panTimeout.current) clearTimeout(panTimeout.current);
    panTimeout.current = setTimeout(() => {
      activePans.current = 0;
    }, 500);

    if (activePans.current == 0) setExpandedButton(null);
  };

  useMotionValueEvent(x, "change", updateExpandedButton);
  useMotionValueEvent(y, "change", updateExpandedButton);
  useMotionValueEvent(scale, "change", updateExpandedButton);

  const handlePan = useCallback(
    function handlePan(item: NavItem) {
      setExpandedButton(item.id);
      activePans.current++;

      // Predictive pre-render hint: mark the target section so its CanvasComponent can
      // render even before it comes fully into view.
      setNextTargetSection(item.id);

      if (item.isHome) {
        onReset();
        return;
      }

      const panCoords = getSectionPanCoordinates({
        windowDimensions: { width, height },
        coords: { x: item.x, y: item.y, width: item.width, height: item.height },
        targetZoom: defaultZoom,
        negative: true,
      });

      panToOffset(
        panCoords,
        () => {
          activePans.current--;
        },
        defaultZoom,
      );
    },
    [panToOffset, onReset, width, height, defaultZoom, setNextTargetSection],
  );

  // Register handlePan for external navigation via navigateToSection
  const handlePanRef = useRef(handlePan);
  useEffect(() => {
    handlePanRef.current = handlePan;
  }, [handlePan]);

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!onRegisterNavigate) return;
    const handler = (sectionId: string) => {
      const item = itemsRef.current.find((i) => i.id === sectionId);
      if (item) handlePanRef.current(item);
    };
    onRegisterNavigate(handler);
    return () => onRegisterNavigate(null);
  }, [onRegisterNavigate]);

  // Clean up timers on unmount and pan to home on animation complete
  useEffect(() => {
    if (animationStage < 2) return;
    if (homeItem) {
      handlePan(homeItem);
    }
    return () => {
      if (panTimeout.current) clearTimeout(panTimeout.current);
      if (debounceCooldownTimeout.current)
        clearTimeout(debounceCooldownTimeout.current);
    };
  }, [handlePan, animationStage, homeItem]);

  // Compute container styles (positioning only)
  const containerStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 1000,
    pointerEvents: "auto",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    ...positionStyles[position],
  };

  // Compute inner container styles (visual styling)
  const innerStyle: React.CSSProperties = {
    ...(gap !== undefined && { gap: `${gap}px` }),
    ...(padding !== undefined && { padding: `${padding}px` }),
    ...(isVertical && { flexDirection: "column" }),
    ...style,
  };

  return (
    <div
      className={responsivePositionClasses[position]}
      style={containerStyle}
    >
      {/* padding to prevent edge bug */}
      <div className={isVertical ? "py-4 md:py-8" : "px-4 md:px-8"}>
        <motion.div
          className={cn(
            "flex select-none items-center justify-center gap-1 rounded-[10px] border p-1 shadow-[0_6px_12px_rgba(0,0,0,0.08)]",
            !style?.backgroundColor && "bg-white",
            !style?.borderColor && "border-neutral-200",
            isVertical && "flex-col",
            className,
          )}
          style={innerStyle}
        >
          <div className={cn("flex items-center gap-1", isVertical && "flex-col")}>
            {items.map((item) => (
              <SingleButton
                key={item.id}
                label={item.label}
                icon={item.icon}
                onClick={() => handlePan(item)}
                isPushed={expandedButton === item.id}
                onDebouncedClick={handleDebouncedClick}
                displayMode={display}
                buttonConfig={buttonConfig}
                tooltipConfig={tooltipConfig}
                isVertical={isVertical}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
