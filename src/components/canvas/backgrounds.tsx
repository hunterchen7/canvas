import React, { type ReactNode } from "react";
import { motion } from "framer-motion";
import { canvasWidth, canvasHeight } from "../../lib/canvas";
import { cn } from "../../lib/utils";

// ============== Canvas Background ==============

export interface DefaultCanvasBackgroundProps {
  /** Custom gradient CSS string. If not provided, uses the default radial gradient. */
  gradientStyle?: string;
  /** Whether to show the dot pattern. Default: true */
  showDots?: boolean;
  /** Dot pattern color. Default: #888888 */
  dotColor?: string;
  /** Dot pattern size in pixels. Default: 1.5 */
  dotSize?: number;
  /** Dot pattern spacing in pixels. Default: 22 */
  dotSpacing?: number;
  /** Dot pattern opacity (0-1). Default: 0.35 */
  dotOpacity?: number;
  /** Whether to show the noise filter. Default: true */
  showFilter?: boolean;
  /** Filter opacity (0-1). Default: 0.6 */
  filterOpacity?: number;
  /** Additional className for the gradient layer */
  gradientClassName?: string;
  /** Additional className for the dots layer */
  dotsClassName?: string;
  /** Additional className for the filter layer */
  filterClassName?: string;
  /** Additional children to render in the background */
  children?: ReactNode;
}

/** The default canvas gradient (neutral gray) */
export const DEFAULT_CANVAS_GRADIENT = `radial-gradient(ellipse ${canvasWidth}px ${canvasHeight}px at ${canvasWidth / 2}px ${canvasHeight}px, #e5e5e5 0%, #d4d4d4 41%, #a3a3a3 59%, #f5f5f5 90%)`;

/**
 * Default canvas background with gradient, dots, and noise filter.
 * All aspects are customizable via props.
 */
export const DefaultCanvasBackground: React.FC<DefaultCanvasBackgroundProps> = ({
  gradientStyle,
  showDots = true,
  dotColor = "#888888",
  dotSize = 1.5,
  dotSpacing = 22,
  dotOpacity = 0.35,
  showFilter = true,
  filterOpacity = 0.6,
  gradientClassName,
  dotsClassName,
  filterClassName,
  children,
}) => {
  const gradientImage = gradientStyle ?? DEFAULT_CANVAS_GRADIENT;

  return (
    <>
      {/* Gradient layer */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 h-full w-full",
          gradientClassName
        )}
        style={{
          backgroundImage: gradientImage,
        }}
      />

      {/* Dots layer */}
      {showDots && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full",
            dotsClassName
          )}
          style={{
            backgroundImage: `radial-gradient(${dotColor} ${dotSize}px, transparent ${dotSize}px)`,
            backgroundSize: `${dotSpacing}px ${dotSpacing}px`,
            opacity: dotOpacity,
          }}
        />
      )}

      {/* Filter/noise layer */}
      {showFilter && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 hidden h-full w-full bg-none filter md:inline md:bg-noise",
            filterClassName
          )}
          style={{
            opacity: filterOpacity,
            filter: "contrast(0.6)",
          }}
        />
      )}

      {children}
    </>
  );
};

// ============== Wrapper/Intro Background ==============

export interface DefaultWrapperBackgroundProps {
  /** Background gradient for the intro screen */
  gradient?: string;
  /** Additional className */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

/**
 * Default wrapper/intro background gradient.
 */
export const DefaultWrapperBackground: React.FC<DefaultWrapperBackgroundProps> = ({
  gradient = "linear-gradient(to top, #d4d4d4 0%, #e5e5e5 50%, #f5f5f5 100%)",
  className,
  style,
}) => {
  return (
    <div
      className={cn("absolute inset-0 h-full w-full", className)}
      style={{
        backgroundImage: gradient,
        ...style,
      }}
    />
  );
};

export interface DefaultIntroContentProps {
  /** Logo image source */
  logoSrc?: string;
  /** Logo alt text */
  logoAlt?: string;
  /** Logo width */
  logoWidth?: number;
  /** Logo height */
  logoHeight?: number;
  /** Title text */
  title?: string;
  /** Additional className for the container */
  className?: string;
  /** Additional className for the title */
  titleClassName?: string;
}

/**
 * Default intro content shown during loading.
 * Can be customized or replaced entirely.
 */
export const DefaultIntroContent: React.FC<DefaultIntroContentProps> = ({
  logoSrc,
  logoAlt = "Logo",
  logoWidth = 64,
  logoHeight = 64,
  title,
  className,
  titleClassName,
}) => {
  // If no logo or title provided, render nothing
  if (!logoSrc && !title) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute left-1/2 top-24 flex -translate-x-1/2 flex-col items-center text-center",
        className
      )}
    >
      {logoSrc && (
        <motion.img
          src={logoSrc}
          alt={logoAlt}
          width={logoWidth}
          height={logoHeight}
          className="mb-4"
        />
      )}
      {title && (
        <div
          className={cn(
            "font-sans font-semibold text-neutral-600",
            titleClassName
          )}
        >
          {title}
        </div>
      )}
    </div>
  );
};

export interface CanvasBlurMaskProps {
  /** Gradient for the blur mask box */
  gradient?: string;
  /** Additional className */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

/**
 * The blur mask box that fades out during the intro animation.
 */
export const DefaultCanvasBlurMask: React.FC<CanvasBlurMaskProps> = ({
  gradient = "radial-gradient(130.38% 95% at 50.03% 97.25%, #d4d4d4 0%, #e5e5e5 48.09%, #f5f5f5 100%)",
  className,
  style,
}) => {
  // This component is meant to be used as a reference/customization point.
  // The actual blur mask is rendered in wrapper.tsx with animation props.
  return null;
};

// Default gradient values for export (neutral grays)
export const DEFAULT_INTRO_GRADIENT =
  "linear-gradient(to top, #d4d4d4 0%, #e5e5e5 50%, #f5f5f5 100%)";

export const DEFAULT_CANVAS_BOX_GRADIENT =
  "radial-gradient(130.38% 95% at 50.03% 97.25%, #d4d4d4 0%, #e5e5e5 48.09%, #f5f5f5 100%)";
