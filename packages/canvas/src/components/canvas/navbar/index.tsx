import { motion, useMotionValueEvent } from "framer-motion";
import { useState, useRef, useEffect, useCallback } from "react";
import SingleButton from "./single-button";
// TODO: These should be passed as props or provided via context from the app
// For now, apps will need to re-export from this library
import { CanvasSection } from "../../../types";
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

interface NavbarProps {
  panToOffset: (
    offset: { x: number; y: number },
    onComplete?: () => void,
    zoom?: number,
  ) => void;
  onReset: () => void;
  // App must provide section coordinates mapping
  coordinates: Record<string, { x: number; y: number; width: number; height: number }>;
  sections: CanvasSection[];
  homeSection: CanvasSection;
}

export default function Navbar({
  panToOffset,
  onReset,
  coordinates,
  sections,
  homeSection,
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
    function handlePan(section: CanvasSection) {
      setExpandedButton(section);
      activePans.current++;

      // Predictive pre-render hint: mark the target section so its CanvasComponent can
      // render even before it comes fully into view.
      setNextTargetSection(section);

      if (section === homeSection) {
        onReset();
        return;
      }

      const sectionCoords = coordinates[section];
      if (!sectionCoords) return;

      const panCoords = getSectionPanCoordinates({
        windowDimensions: { width, height },
        coords: sectionCoords,
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

  // Clean up timers on unmount
  useEffect(() => {
    if (animationStage < 2) return;
    handlePan(CanvasSection.Home);
    return () => {
      if (panTimeout.current) clearTimeout(panTimeout.current);
      if (debounceCooldownTimeout.current)
        clearTimeout(debounceCooldownTimeout.current);
    };
  }, [handlePan, animationStage]);

  return (
    <div
      className="bottom-12 md:bottom-4"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        pointerEvents: "auto",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* padding to prevent edge bug */}
      <div className="px-4 md:px-8">
        <motion.div className="flex select-none items-center justify-center gap-1 rounded-[10px] border-[1px] border-border bg-offwhite p-1 shadow-[0_6px_12px_rgba(0,0,0,0.10)]">
          <div className="flex items-center gap-1">
            <SingleButton
              label="Home"
              icon="Home"
              onClick={() => handlePan(CanvasSection.Home)}
              isPushed={expandedButton === CanvasSection.Home}
              onDebouncedClick={handleDebouncedClick}
            />
            <SingleButton
              label="About"
              icon="Info"
              onClick={() => handlePan(CanvasSection.About)}
              isPushed={expandedButton === CanvasSection.About}
              onDebouncedClick={handleDebouncedClick}
            />
            <SingleButton
              label="Projects"
              icon="LayoutDashboard"
              onClick={() => handlePan(CanvasSection.Projects)}
              isPushed={expandedButton === CanvasSection.Projects}
              onDebouncedClick={handleDebouncedClick}
            />
            <SingleButton
              label="Sponsors"
              icon="Handshake"
              onClick={() => handlePan(CanvasSection.Sponsors)}
              isPushed={expandedButton === CanvasSection.Sponsors}
              onDebouncedClick={handleDebouncedClick}
            />
            <SingleButton
              label="FAQ"
              icon="HelpCircle"
              onClick={() => handlePan(CanvasSection.FAQ)}
              isPushed={expandedButton === CanvasSection.FAQ}
              onDebouncedClick={handleDebouncedClick}
            />
            <SingleButton
              label="Team"
              icon="Users"
              onClick={() => handlePan(CanvasSection.Team)}
              isPushed={expandedButton === CanvasSection.Team}
              onDebouncedClick={handleDebouncedClick}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
