import { animate, type MotionValue, type Point } from "framer-motion";
import { useMemo } from "react";
import {
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
  MAX_DIM_RATIO,
  INTRO_ASPECT_RATIO,
  PAN_SPRING,
  ScreenSizeEnum,
} from "./constants";

export const canvasWidth = DEFAULT_CANVAS_WIDTH;
export const canvasHeight = DEFAULT_CANVAS_HEIGHT;

// Re-export ScreenSizeEnum for backward compatibility
export { ScreenSizeEnum } from "./constants";

export const useMemoPoint = (x: number, y: number): Point => {
  return useMemo(() => ({ x, y }), [x, y]);
};

export interface MinimalPointerInput {
  clientX: number;
  clientY: number;
}

export const getDistance = (
  p1: MinimalPointerInput,
  p2: MinimalPointerInput,
) => {
  const dx = p1.clientX - p2.clientX;
  const dy = p1.clientY - p2.clientY;
  return Math.sqrt(dx ** 2 + dy ** 2);
};

export const getMidpoint = (
  p1: MinimalPointerInput,
  p2: MinimalPointerInput,
): Point => {
  return {
    x: (p1.clientX + p2.clientX) / 2,
    y: (p1.clientY + p2.clientY) / 2,
  };
};

export const getScreenSizeEnum = (width: number): ScreenSizeEnum => {
  // iphone 12 pro is 390px, iphone 14 pro max is 430px, SE 3rd gen is 375px
  if (width < 400) return ScreenSizeEnum.SMALL_MOBILE;
  if (width < 768) return ScreenSizeEnum.MOBILE;
  if (width < 1440) return ScreenSizeEnum.TABLET;
  if (width < 1920) return ScreenSizeEnum.SMALL_DESKTOP;
  if (width < 2560) return ScreenSizeEnum.MEDIUM_DESKTOP;
  if (width <= 3440) return ScreenSizeEnum.LARGE_DESKTOP;
  return ScreenSizeEnum.HUGE_DESKTOP;
};

export function getSectionPanCoordinates({
  windowDimensions,
  coords,
  targetZoom,
  negative,
}: {
  windowDimensions: { width: number; height: number };
  coords: { x: number; y: number; width: number; height: number };
  targetZoom: number;
  negative?: boolean;
}) {
  const { width, height } = windowDimensions;
  // Calculate the center of the section
  const sectionCenterX = coords.x + coords.width / 2;
  const sectionCenterY = coords.y + coords.height / 2;

  // Calculate the required pan offset to center the section in the viewport
  const targetX = width / 2 - sectionCenterX * targetZoom;
  const targetY = height / 2 - sectionCenterY * targetZoom;

  if (negative) {
    return {
      x: -targetX,
      y: -targetY,
    };
  }

  return {
    x: targetX,
    y: targetY,
  };
}

export async function panToOffsetScene(
  offset: Point,
  x: MotionValue<number>,
  y: MotionValue<number>,
  scale: MotionValue<number>,
  newZoom?: number,
): Promise<void> {
  const animX = animate(x, offset.x, PAN_SPRING);
  const animY = animate(y, offset.y, PAN_SPRING);
  const animScale = animate(scale, newZoom ?? 1, PAN_SPRING);
  await Promise.all([animScale, animX, animY]);
}

export const calcInitialBoxWidth = (
  windowWidth: number,
  windowHeight: number,
) => {
  // math CanvasWrapper's bounding box size and compute scale s.t. canvas fits entirely within
  const maxWidth = windowWidth * MAX_DIM_RATIO.width;
  const maxHeight = windowHeight * MAX_DIM_RATIO.height;

  let boxWidth, boxHeight;

  if (maxWidth / INTRO_ASPECT_RATIO <= maxHeight) {
    boxWidth = maxWidth;
    boxHeight = boxWidth / INTRO_ASPECT_RATIO;
  } else {
    boxHeight = maxHeight;
    boxWidth = boxHeight * INTRO_ASPECT_RATIO;
  }

  // scale so the canvas fits inside the computed 3:2 box
  return Math.min(boxWidth / canvasWidth, boxHeight / canvasHeight);
};

// Re-export commonly used constants for backward compatibility
export { MAX_DIM_RATIO } from "./constants";
export {
  INTERACTIVE_SELECTOR,
  ZOOM_BOUND,
  MAX_ZOOM,
  MIN_ZOOMS,
} from "./constants";
