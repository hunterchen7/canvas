import { motion, type MotionValue, type Transition, useMotionValue } from "framer-motion";
import { useState, useEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import {
  MAX_DIM_RATIO,
  GROW_TRANSITION,
  BLUR_TRANSITION,
  INTRO_ASPECT_RATIO,
} from "../../lib/constants";

// Re-export for backward compatibility
export { GROW_TRANSITION as growTransition } from "../../lib/constants";

interface CanvasWrapperProps {
  children: React.ReactNode;
  /** Shared progress MV (0->1) for the grow animation */
  introProgress: MotionValue<number>;
  /** Callback when the grow (stage1) completes */
  onIntroGrowComplete?: () => void;

  // ============== Intro Customization ==============
  /** Disable intro animation entirely (starts at full size) */
  skipIntro?: boolean;
  /** Custom intro content to show during loading */
  introContent?: ReactNode;
  /** Custom loading text (default: "LOADING CANVAS") */
  loadingText?: string;
  /** Background gradient for intro screen */
  introBackgroundGradient?: string;
  /** Canvas box gradient for blur mask */
  canvasBoxGradient?: string;
  /** Grow animation transition config */
  growTransition?: Transition;
  /** Blur animation transition config */
  blurTransition?: Transition;
}

/**
 * Default intro content (Hack Western branding)
 * Positioned in the upper third of the screen
 */
const DefaultIntroContent = () => (
  <div className="absolute left-1/2 top-24 flex -translate-x-1/2 flex-col items-center text-center">
    <Image
      src="/horse.svg"
      alt="Hack Western Logo"
      width={64}
      height={64}
      className="mb-4"
    />
    <div className="font-jetbrains-mono font-semibold text-[#543C5AB2]">
      HACK WESTERN 12
    </div>
  </div>
);

export const CanvasWrapper = ({
  children,
  introProgress,
  onIntroGrowComplete,
  skipIntro = false,
  introContent,
  loadingText = "LOADING CANVAS",
  introBackgroundGradient = "linear-gradient(to top, #FEB6AF 0%, var(--salmon) 15%, var(--beige) 50%)",
  canvasBoxGradient = "radial-gradient(130.38% 95% at 50.03% 97.25%, #EFB8A0 0%, #EAD2DF 48.09%, #EFE3E1 100%)",
  growTransition = GROW_TRANSITION,
  blurTransition = BLUR_TRANSITION,
}: CanvasWrapperProps) => {
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [dots, setDots] = useState<string>("..");
  const [stage1NotFinished, setStage1NotFinished] = useState(true);
  const completedRef = useRef(false);

  // If skipIntro is true, immediately complete the intro
  useEffect(() => {
    if (skipIntro && !completedRef.current) {
      completedRef.current = true;
      introProgress.set(1);
      onIntroGrowComplete?.();
    }
  }, [skipIntro, introProgress, onIntroGrowComplete]);

  // add up to 4 dots, then go back down to 2
  useEffect(() => {
    if (skipIntro) return; // Don't animate dots if skipping intro

    const interval = setInterval(() => {
      setDots((prevDots) => {
        if (prevDots.length < 3) {
          return prevDots + ".";
        } else {
          return ".";
        }
      });
    }, 500);
    return () => clearInterval(interval);
  }, [skipIntro]);

  useEffect(() => {
    if (skipIntro) return; // Don't calculate dimensions if skipping intro

    // calculate the initial 3:2 box size with margins (client-only)
    const calculateInitialSize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const maxWidth = vw * MAX_DIM_RATIO.width;
      const maxHeight = vh * MAX_DIM_RATIO.height;

      // width or height as limiter
      if (maxWidth / INTRO_ASPECT_RATIO <= maxHeight) {
        return { width: maxWidth, height: maxWidth / INTRO_ASPECT_RATIO };
      } else {
        return { height: maxHeight, width: maxHeight * INTRO_ASPECT_RATIO };
      }
    };

    setDimensions(calculateInitialSize());
  }, [skipIntro]);

  // If skipIntro, render children directly without animation wrapper
  if (skipIntro) {
    return (
      <motion.div
        className="fixed inset-0 overflow-hidden"
        style={{
          touchAction: "none",
          userSelect: "none",
          pointerEvents: "none",
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className="fixed inset-0 overflow-hidden"
      style={{
        backgroundImage: stage1NotFinished ? introBackgroundGradient : undefined,
        touchAction: "none",
        userSelect: "none",
        pointerEvents: "none",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {stage1NotFinished && (
        <>
          {/* Render custom intro content or default */}
          {introContent !== undefined ? introContent : <DefaultIntroContent />}
        </>
      )}

      {dimensions && (
        <>
          {/* Blurring mask box */}
          <motion.div
            initial={{
              width: dimensions.width,
              height: dimensions.height,
              opacity: 1,
              backgroundImage: canvasBoxGradient,
            }}
            animate={{
              opacity: 0,
              display: "none",
            }}
            transition={blurTransition}
            className="absolute left-1/2 top-1/2 z-20 origin-center -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg"
          />
          {/* Growing wrapper drives introProgress */}
          <motion.div
            initial={{
              width: dimensions.width,
              height: dimensions.height,
            }}
            animate={{
              width: "100vw",
              height: "100vh",
            }}
            transition={growTransition}
            onUpdate={(latest: { width?: number; height?: number }) => {
              if (completedRef.current) return;
              if (typeof latest.width === "number") {
                const w0 = dimensions.width;
                const w1 = window.innerWidth;
                const progress =
                  w1 === w0 ? 1 : (latest.width - w0) / (w1 - w0);
                const clamped = Math.min(Math.max(progress, 0), 1);
                introProgress.set(clamped);
              }
            }}
            onAnimationComplete={() => {
              if (!completedRef.current) {
                completedRef.current = true;
                introProgress.set(1);
                setStage1NotFinished(false);
                onIntroGrowComplete?.();
              }
            }}
            className="absolute left-1/2 top-1/2 z-10 origin-center -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg shadow-[0_20px_40px_rgba(103,86,86,0.15)]"
          >
            <div className="h-full w-full">{children}</div>
          </motion.div>
        </>
      )}
      {stage1NotFinished && loadingText && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-center font-jetbrains-mono font-semibold text-[#543C5AB2]">
          {loadingText}{dots}
        </div>
      )}
    </motion.div>
  );
};
