import { type Point, useTransform, motion } from "framer-motion";
import { useEffect, useState, useMemo } from "react";
import { useCanvasContext } from "../../contexts/CanvasContext";
import {
  TOOLBAR_OPACITY_POS_EPS,
  TOOLBAR_OPACITY_SCALE_EPS,
} from "../../lib/constants";
import { cn } from "../../lib/utils";
import type { ToolbarConfig, ToolbarPosition } from "../../types";

type ToolbarProps = {
  homeCoordinates?: Point;
  config?: ToolbarConfig;
};

const positionStyles: Record<ToolbarPosition, string> = {
  "top-left": "left-4 top-6 sm:top-4",
  "top-right": "right-4 top-6 sm:top-4",
  "bottom-left": "left-4 bottom-6 sm:bottom-4",
  "bottom-right": "right-4 bottom-6 sm:bottom-4",
};

const Toolbar = ({
  homeCoordinates = { x: 0, y: 0 },
  config = {},
}: ToolbarProps) => {
  const { x, y, scale } = useCanvasContext();
  const [hasMounted, setHasMounted] = useState(false);

  const {
    display = "both",
    position = "top-left",
    disableAutoHide = false,
    className,
    coordinatesClassName,
    scaleClassName,
    separatorClassName,
    style,
    coordinatesStyle,
    scaleStyle,
    separator = "|",
    separatorGap,
    coordinatesFormat,
    scaleFormat,
  } = config;

  const separatorStyle: React.CSSProperties | undefined = separatorGap
    ? {
        marginInline:
          typeof separatorGap === "number" ? `${separatorGap}px` : separatorGap,
      }
    : undefined;

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // numeric MotionValues
  const rawDx = useTransform(
    [x, scale],
    ([lx, ls]) => -((lx as number) / (ls as number)) + homeCoordinates.x
  );
  const rawDy = useTransform(
    [y, scale],
    ([ly, ls]) => -((ly as number) / (ls as number)) + homeCoordinates.y
  );

  // formatted MotionValues for default display
  const displayX = useTransform(rawDx, (v) => Math.round(v).toString());
  const displayY = useTransform(rawDy, (v) => Math.round(v).toString());
  const displayScale = useTransform(scale, (v) => v.toFixed(2));

  // For custom formatters, we need to use state to track values
  const [currentX, setCurrentX] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [currentScale, setCurrentScale] = useState(1);

  useEffect(() => {
    const unsubX = rawDx.on("change", (v) => setCurrentX(Math.round(v)));
    const unsubY = rawDy.on("change", (v) => setCurrentY(Math.round(v)));
    const unsubScale = scale.on("change", (v) => setCurrentScale(v));
    return () => {
      unsubX();
      unsubY();
      unsubScale();
    };
  }, [rawDx, rawDy, scale]);

  const opacity = useTransform([rawDx, rawDy, scale], ([dx, dy, ls]) => {
    if (disableAutoHide) return 1;
    return Math.abs(dx as number) < TOOLBAR_OPACITY_POS_EPS &&
      Math.abs(dy as number) < TOOLBAR_OPACITY_POS_EPS &&
      Math.abs((ls as number) - 1) < TOOLBAR_OPACITY_SCALE_EPS
      ? 0
      : 1;
  });

  const handlePointerDown = (e: React.PointerEvent) => e.stopPropagation();

  const showCoordinates = display === "coordinates" || display === "both";
  const showScale = display === "scale" || display === "both";
  const showSeparator = display === "both";

  // Compute formatted values
  const formattedCoordinates = useMemo(() => {
    if (coordinatesFormat) {
      return coordinatesFormat(currentX, currentY);
    }
    return null; // Will use motion spans for default
  }, [coordinatesFormat, currentX, currentY]);

  const formattedScale = useMemo(() => {
    if (scaleFormat) {
      return scaleFormat(currentScale);
    }
    return null; // Will use motion span for default
  }, [scaleFormat, currentScale]);

  // Placeholder content for SSR/initial render
  const placeholderContent = useMemo(() => {
    const parts: string[] = [];
    if (showCoordinates) parts.push("(0, 0)");
    if (showSeparator) parts.push(separator);
    if (showScale) parts.push("1.00x");
    return parts.join("");
  }, [showCoordinates, showScale, showSeparator, separator]);

  return (
    <motion.div
      className={cn(
        "absolute z-[1000] cursor-default select-none rounded-[10px] border border-border bg-canvas-offwhite p-2 font-mono text-xs text-canvas-heavy shadow-[0_6px_12px_rgba(0,0,0,0.10)] md:text-sm",
        positionStyles[position],
        className
      )}
      onPointerDown={handlePointerDown}
      data-toolbar-button
      style={{ opacity, ...style }}
    >
      {hasMounted ? (
        <>
          {showCoordinates && (
            <span className={coordinatesClassName} style={coordinatesStyle}>
              {formattedCoordinates !== null ? (
                formattedCoordinates
              ) : (
                <>
                  (<motion.span>{displayX}</motion.span>,{" "}
                  <motion.span>{displayY}</motion.span>)
                </>
              )}
            </span>
          )}
          {showSeparator && (
            <span
              className={cn("text-canvas-light", separatorClassName)}
              style={separatorStyle}
            >
              {separator}
            </span>
          )}
          {showScale && (
            <span className={scaleClassName} style={scaleStyle}>
              {formattedScale !== null ? (
                formattedScale
              ) : (
                <>
                  <motion.span>{displayScale}</motion.span>x
                </>
              )}
            </span>
          )}
        </>
      ) : (
        <span style={{ opacity: 0 }}>{placeholderContent}</span>
      )}
    </motion.div>
  );
};

export default Toolbar;
