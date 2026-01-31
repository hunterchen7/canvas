import { useState, useEffect } from "react";
import * as LucideIcons from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  NavbarDisplayMode,
  NavbarButtonConfig,
  NavbarTooltipConfig,
} from "../../../types";
import { cn } from "../../../lib/utils";

interface SingleButtonProps {
  label: string;
  /** Lucide icon name or a custom icon component */
  icon: string | React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  isPushed: boolean;
  link?: string;
  onDebouncedClick?: (callback: () => void) => void;
  /** Display mode for the button */
  displayMode?: NavbarDisplayMode;
  /** Button styling configuration */
  buttonConfig?: NavbarButtonConfig;
  /** Tooltip configuration */
  tooltipConfig?: NavbarTooltipConfig;
  /** Whether the navbar is in vertical layout */
  isVertical?: boolean;
}

export default function SingleButton({
  label,
  icon,
  onClick,
  isPushed,
  link,
  onDebouncedClick,
  displayMode = "icons",
  buttonConfig = {},
  tooltipConfig = {},
  isVertical = false,
}: SingleButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showTag, setShowTag] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const isLucideIconName = typeof icon === "string";
  const IconComponent = isLucideIconName
    ? (LucideIcons[icon as keyof typeof LucideIcons] as LucideIcons.LucideIcon | undefined)
    : icon;

  // Extract config values
  const {
    className: buttonClassName,
    style: buttonStyle,
    activeClassName,
    activeStyle,
    hoverClassName,
    hoverStyle,
    iconClassName,
    iconSize = 20,
    labelClassName,
    labelStyle,
  } = buttonConfig;

  const {
    disabled: tooltipDisabled = false,
    className: tooltipClassName,
    style: tooltipStyle,
    delay: tooltipDelay = 100,
  } = tooltipConfig;

  // Determine what to show based on display mode
  const showIcon = displayMode !== "labels";
  const allowExpand = displayMode === "icons"; // Only expand on active in icons mode
  const showTooltip = (displayMode === "icons" || displayMode === "compact") && !tooltipDisabled;

  // Validate icon component for modes that need it
  if (showIcon && !IconComponent) {
    throw new Error(
      "A valid 'icon' prop is required (Lucide icon name or custom icon component).",
    );
  }

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (isHovered && showTooltip) {
      timeoutId = setTimeout(() => {
        setShowTag(true);
      }, tooltipDelay);
    } else {
      setShowTag(false);
    }

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isHovered, showTooltip, tooltipDelay]);

  useEffect(() => {
    setShowTag(false);
    setIsHovered(false);
  }, [isPushed]);

  // Reset copied email state after 2 seconds
  useEffect(() => {
    if (copiedEmail) {
      const timeoutId = setTimeout(() => {
        setCopiedEmail(false);
      }, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [copiedEmail]);

  const performClick = () => {
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
      return;
    }

    onClick?.();
  };

  const handleClick = () => {
    if (onDebouncedClick) {
      onDebouncedClick(performClick);
    } else {
      performClick();
    }
  };

  const displayLabel = copiedEmail ? "Email copied!" : label;

  // Compute button classes
  const baseButtonClass = "relative flex items-center rounded-md p-2 text-neutral-500 transition-colors duration-200 focus:outline-none";
  // Only apply default classes if no custom style is provided
  const stateClass = isPushed
    ? (activeClassName || (!activeStyle && "bg-neutral-200"))
    : isHovered
      ? (hoverClassName || (!hoverStyle && "bg-neutral-100"))
      : "";

  // Compute button styles
  const computedButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    ...(isPushed && activeStyle),
    ...(isHovered && !isPushed && hoverStyle),
  };

  // Compute icon classes and styles
  const iconSizeStyle = { width: iconSize, height: iconSize };
  const baseIconClass = "flex-shrink-0";
  // Only apply default icon colors if no custom button color style is provided
  const hasCustomColor = buttonStyle?.color;
  const iconColorClass = hasCustomColor
    ? ""
    : isPushed
      ? "text-neutral-700"
      : "text-neutral-500";

  // Compute label classes
  const baseLabelClass = "whitespace-nowrap font-canvas-figtree text-sm font-medium text-neutral-700";

  // Tooltip position based on vertical layout
  const tooltipPositionClass = isVertical
    ? "left-full top-1/2 -translate-y-1/2 ml-2"
    : "-top-10 left-1/2";
  const tooltipTransform = isVertical
    ? { x: 0, y: "-50%" }
    : { x: "-50%" };

  // Render icon element
  const renderIcon = () => {
    if (!showIcon || !IconComponent) return null;
    return (
      <IconComponent
        className={cn(baseIconClass, iconColorClass, iconClassName)}
        style={iconSizeStyle}
      />
    );
  };

  // Render label element
  const renderLabel = (animated = false) => {
    if (animated) {
      return (
        <motion.span
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: "auto" }}
          exit={{ opacity: 0, width: 0 }}
          transition={{
            duration: 0.1,
            ease: "easeInOut",
          }}
          className={cn("overflow-hidden", baseLabelClass, labelClassName)}
          style={labelStyle}
        >
          {displayLabel}
        </motion.span>
      );
    }
    return (
      <span
        className={cn(baseLabelClass, labelClassName)}
        style={labelStyle}
      >
        {displayLabel}
      </span>
    );
  };

  // Render tooltip
  const renderTooltip = () => {
    if (!showTooltip || !showTag || isPushed) return null;

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: isVertical ? 0 : 5, scale: 0.9, ...tooltipTransform }}
          animate={{ opacity: 1, y: 0, scale: 1, ...tooltipTransform }}
          exit={{ opacity: 0, y: isVertical ? 0 : 5, scale: 0.9, ...tooltipTransform }}
          transition={{
            duration: 0.05,
            ease: "easeOut",
          }}
          className={cn("pointer-events-none absolute z-50", tooltipPositionClass)}
        >
          <div className="rounded-sm bg-gradient-to-t from-black/10 to-transparent px-[1px] pb-[2.5px] pt-[1px]">
            <div
              className={cn(
                "whitespace-nowrap rounded-sm px-2 py-1 font-canvas-figtree text-sm",
                !tooltipStyle?.backgroundColor && "bg-neutral-50",
                !tooltipStyle?.color && "text-neutral-600",
                tooltipClassName,
              )}
              style={tooltipStyle}
            >
              {displayLabel}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  };

  // Render based on display mode
  const renderContent = () => {
    // Labels only mode
    if (displayMode === "labels") {
      return renderLabel();
    }

    // Icons + labels always mode
    if (displayMode === "icons-labels") {
      return (
        <div className="flex items-center gap-2">
          {renderIcon()}
          {renderLabel()}
        </div>
      );
    }

    // Compact mode - icons only, no expansion
    if (displayMode === "compact") {
      return (
        <>
          {renderIcon()}
          {renderTooltip()}
        </>
      );
    }

    // Icons mode (default) - expands on active
    if (isPushed && allowExpand) {
      return (
        <div className="flex items-center gap-2">
          <div>{renderIcon()}</div>
          {renderLabel(true)}
        </div>
      );
    }

    return (
      <>
        {renderIcon()}
        {renderTooltip()}
      </>
    );
  };

  return (
    <motion.button
      aria-label={label}
      className={cn(baseButtonClass, stateClass, buttonClassName)}
      style={computedButtonStyle}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileTap={{ scale: 0.95 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 25,
      }}
    >
      {renderContent()}
    </motion.button>
  );
}
