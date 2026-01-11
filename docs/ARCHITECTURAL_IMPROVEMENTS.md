# Canvas Library Architectural Improvements - Change Log

## Overview

This document details three major quality-of-life architectural improvements made to the canvas library to improve maintainability, performance, and customizability.

---

## 1. Constants Consolidation

### Problem
Constants were scattered across multiple files, creating:
- **Circular dependency**: `lib/canvas.ts` imported `MAX_DIM_RATIO` from `wrapper.tsx` (a component)
- **Poor discoverability**: Magic numbers and configuration values spread across codebase
- **Maintenance burden**: Changes to timing/sizing required hunting through multiple files

### Solution
Created a single source of truth: **`src/lib/constants.ts`**

### Changes Made

#### New File: `src/lib/constants.ts`
```typescript
// All constants organized by category:
- CANVAS_WIDTH, CANVAS_HEIGHT
- MAX_DIM_RATIO, INTRO_ASPECT_RATIO
- GROW_TRANSITION, BLUR_TRANSITION, STAGE2_TRANSITION
- MAX_ZOOM, ZOOM_BOUND, MIN_ZOOMS
- PAN_SPRING
- MOUSE_WHEEL_ZOOM_SENSITIVITY, TRACKPAD_ZOOM_SENSITIVITY
- INTERACTIVE_SELECTOR
- VIEWPORT_HYSTERESIS_BUFFER, IMAGE_FALLBACK_WIDTH_THRESHOLD
- RESPONSIVE_ZOOM_MAP
- NAVBAR_DEBOUNCE_MS
- TOOLBAR_OPACITY_POS_EPS, TOOLBAR_OPACITY_SCALE_EPS
```

#### Updated Files

**`lib/canvas.ts`**
- Imports constants from `./constants`
- Re-exports common constants for backward compatibility
- Removed duplicate `panSpring`, `MIN_ZOOMS`, `MAX_ZOOM`, etc.
- Uses `INTRO_ASPECT_RATIO` instead of hardcoded `3/2`

**`components/canvas/wrapper.tsx`**
- Imports `MAX_DIM_RATIO`, `GROW_TRANSITION`, `BLUR_TRANSITION`
- Re-exports `growTransition` for backward compatibility
- Removed local transition definitions

**`components/canvas/component.tsx`**
- Imports `VIEWPORT_HYSTERESIS_BUFFER`, `IMAGE_FALLBACK_WIDTH_THRESHOLD`
- Removed magic number `120` (hysteresis buffer)
- Removed magic number `2000` (fallback threshold)

**`components/canvas/toolbar.tsx`**
- Imports `TOOLBAR_OPACITY_POS_EPS`, `TOOLBAR_OPACITY_SCALE_EPS`
- Removed local epsilon constants

**`components/canvas/navbar/index.tsx`**
- Imports `RESPONSIVE_ZOOM_MAP`, `NAVBAR_DEBOUNCE_MS`
- Removed local `RESPONSIVE_ZOOM_MAP` definition
- Simplified debounce logic from switch statement to object lookup

**`components/canvas/canvas.tsx`**
- Imports `STAGE2_TRANSITION`, `MOUSE_WHEEL_ZOOM_SENSITIVITY`, `TRACKPAD_ZOOM_SENSITIVITY`
- Removed local `stage2Transition` definition
- Removed magic numbers `0.0015` and `0.015` for zoom sensitivity

### Benefits
✅ **Single source of truth** - All configuration in one place  
✅ **No circular dependencies** - Clean dependency graph  
✅ **Easy customization** - Change values in one file  
✅ **Self-documenting** - Comments explain purpose of each constant  
✅ **Type safety** - `as const` assertions preserve literal types  

### Migration Guide
```typescript
// Before
import { MAX_DIM_RATIO } from "~/components/canvas/wrapper";
const stage2Transition = { duration: 0.96, ease: [0.37, 0.1, 0.6, 1] };

// After
import { MAX_DIM_RATIO, STAGE2_TRANSITION } from "~/lib/constants";
```

---

## 2. Performance Provider

### Problem
`usePerformanceMode()` was called independently in multiple components:
- `canvas.tsx`
- `component.tsx`
- `navbar/index.tsx`
- Several promo components (`about`, `projects`, etc.)

Each call re-ran device detection logic (`isIOS()`, `isMobile()`, `prefersReducedMotion()`), causing:
- **Redundant computation**: Same checks executed 5+ times
- **Potential inconsistency**: Different components could theoretically get different results
- **Wasted resources**: DOM queries and navigator checks repeated unnecessarily

### Solution
Centralized performance detection with **React Context** at the app root.

### Changes Made

#### New File: `src/contexts/PerformanceContext.tsx`
```typescript
export interface PerformanceConfig {
  mode: "high" | "medium" | "low";
  isIOS: boolean;
  isMobile: boolean;
  prefersReducedMotion: boolean;
  enableComplexShadows: boolean;
}

export const PerformanceProvider: React.FC<{ children: ReactNode }>;
export const usePerformance: () => PerformanceConfig;
export const usePerformanceMode: () => PerformanceConfig; // Backward compat alias
```

**Features:**
- Runs device detection **once** on mount
- Subscribes to window resize to update mode based on width
- Provides context to all children
- Memoizes config to avoid unnecessary re-renders

#### Updated Files

**`hooks/usePerformanceMode.ts`**
```typescript
// Now just a re-export for backward compatibility
export { usePerformance, usePerformanceMode, ... } from "~/contexts/PerformanceContext";
```

**`pages/_app.tsx`**
```tsx
// Wrapped entire app in provider
<PerformanceProvider>
  <main>
    <Component {...pageProps} />
    <Toaster />
  </main>
</PerformanceProvider>
```

**All Components** (no code changes needed)
- `canvas.tsx`, `component.tsx`, `navbar/index.tsx` continue using `usePerformanceMode()`
- Now reads from context instead of re-running detection

### Performance Impact

**Before:**
```
5 components × (isIOS + isMobile + prefersReducedMotion + resize listener)
= 5 full device detection cycles
```

**After:**
```
1 provider × (isIOS + isMobile + prefersReducedMotion + resize listener)
= 1 device detection cycle (shared via context)
```

**Estimated savings:** ~80% reduction in performance-related DOM queries

### Benefits
✅ **Single detection point** - Run device checks once  
✅ **Consistent results** - All components see same performance mode  
✅ **Better performance** - No redundant navigator/DOM queries  
✅ **Easier testing** - Mock provider instead of hooks  
✅ **Backward compatible** - Existing `usePerformanceMode()` calls still work  

### Migration Guide (Optional)
```typescript
// Old way (still works)
import { usePerformanceMode } from "~/hooks/usePerformanceMode";
const { mode } = usePerformanceMode();

// New way (recommended)
import { usePerformance } from "~/contexts/PerformanceContext";
const { mode, isIOS, enableComplexShadows } = usePerformance();
```

---

## 3. Composable Intro Animation

### Problem
The intro animation was **hardcoded** with Hack Western branding:
- Hack Western logo and text baked into `wrapper.tsx`
- No way to customize timing without editing source
- Couldn't disable intro for development/testing
- Not library-ready (tightly coupled to app branding)

### Solution
Made intro animation **fully customizable** via props with sensible defaults.

### Changes Made

#### Updated: `src/components/canvas/wrapper.tsx`

**New Props:**
```typescript
interface CanvasWrapperProps {
  // ... existing props
  
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
```

**New Component:**
```typescript
const DefaultIntroContent = () => (
  // Hack Western logo + text (extracted from JSX)
);
```

**Key Implementation Details:**
1. **Skip Intro Logic**: If `skipIntro={true}`, renders children directly without animation
2. **Custom Content**: Accepts `introContent` ReactNode or uses `DefaultIntroContent`
3. **Customizable Text**: `loadingText` prop replaces hardcoded "LOADING CANVAS"
4. **Style Overrides**: Background and box gradients can be customized
5. **Timing Control**: `growTransition` and `blurTransition` override defaults
6. **Smart Defaults**: All props optional, falls back to current behavior

#### Updated: `src/components/canvas/canvas.tsx`

**New Props (passed through to wrapper):**
```typescript
interface Props {
  // ... existing props
  
  skipIntro?: boolean;
  introContent?: ReactNode;
  loadingText?: string;
  introBackgroundGradient?: string;
  canvasBoxGradient?: string;
  growTransition?: Transition;
  blurTransition?: Transition;
}
```

**Prop Forwarding:**
```tsx
<CanvasWrapper
  introProgress={introProgress}
  onIntroGrowComplete={startStage2}
  skipIntro={skipIntro}
  introContent={introContent}
  loadingText={loadingText}
  introBackgroundGradient={introBackgroundGradient}
  canvasBoxGradient={canvasBoxGradient}
  growTransition={growTransition}
  blurTransition={blurTransition}
>
```

### Usage Examples

#### 1. Skip Intro Entirely
```tsx
<Canvas homeCoordinates={coords.home} skipIntro>
  <Hero />
</Canvas>
```

#### 2. Custom Branding
```tsx
<Canvas
  homeCoordinates={coords.home}
  introContent={
    <div>
      <img src="/my-logo.svg" />
      <h1>My Hackathon</h1>
    </div>
  }
  loadingText="LOADING EXPERIENCE"
>
  <Hero />
</Canvas>
```

#### 3. Faster Animation
```tsx
<Canvas
  homeCoordinates={coords.home}
  growTransition={{
    duration: 0.5,
    ease: "easeOut"
  }}
>
  <Hero />
</Canvas>
```

#### 4. No Loading Text
```tsx
<Canvas
  homeCoordinates={coords.home}
  loadingText=""  // or null
>
  <Hero />
</Canvas>
```

#### 5. Custom Gradients
```tsx
<Canvas
  homeCoordinates={coords.home}
  introBackgroundGradient="linear-gradient(to bottom, #667eea 0%, #764ba2 100%)"
  canvasBoxGradient="radial-gradient(circle, #ff6b6b, #feca57)"
>
  <Hero />
</Canvas>
```

### Benefits
✅ **Library-ready** - No hardcoded branding  
✅ **Development friendly** - Skip intro with one prop  
✅ **Fully customizable** - Override any aspect of intro  
✅ **Backward compatible** - Zero changes needed to existing code  
✅ **TypeScript support** - All props typed with intellisense  
✅ **Performance** - Skip intro avoids unnecessary animations  

### Default Behavior (Unchanged)
When no props are passed, the intro works exactly as before:
- Shows Hack Western logo and text
- Uses original timing and gradients
- Same loading text and animation

---

## Testing Recommendations

### 1. Constants Consolidation
```bash
# Verify no compilation errors
npm run build

# Search for any remaining magic numbers
grep -r "0.0015\|0.015\|120\|2000" src/components/canvas/
```

### 2. Performance Provider
```tsx
// Test performance mode detection
const TestComponent = () => {
  const { mode, isIOS, isMobile } = usePerformance();
  return <div>{mode}</div>;
};

// Resize window and verify mode updates
window.resizeTo(400, 800); // Should trigger "low" mode
```

### 3. Composable Intro
```tsx
// Test skip intro
<Canvas skipIntro homeCoordinates={...}>...</Canvas>

// Test custom content
<Canvas introContent={<MyLoader />} homeCoordinates={...}>...</Canvas>

// Test faster animation
<Canvas growTransition={{ duration: 0.1 }} homeCoordinates={...}>...</Canvas>
```

---

## Breaking Changes

**None.** All changes are backward compatible:
- Constants are re-exported from their old locations
- `usePerformanceMode()` still works (aliased to `usePerformance()`)
- Intro animation has same defaults as before

---

## Future Improvements

### 1. Constants
- [ ] Extract app-specific values (section coordinates) from constants
- [ ] Create config builder/validator function
- [ ] Environment-based overrides (dev vs prod constants)

### 2. Performance
- [ ] Add performance metrics tracking
- [ ] Expose performance context to browser DevTools
- [ ] Adaptive quality based on frame rate

### 3. Intro Animation
- [ ] Preset intro animations (fade, slide, zoom, etc.)
- [ ] Callback props for animation stages (onGrowStart, onBlurComplete, etc.)
- [ ] Progress indicator component
- [ ] Preload resources during intro

---

## Files Changed Summary

| File | Lines Changed | Type |
|------|---------------|------|
| `src/lib/constants.ts` | +128 | New file |
| `src/contexts/PerformanceContext.tsx` | +86 | New file |
| `src/lib/canvas.ts` | ~30 | Refactor |
| `src/components/canvas/wrapper.tsx` | ~80 | Refactor |
| `src/components/canvas/canvas.tsx` | ~40 | Enhancement |
| `src/components/canvas/component.tsx` | ~10 | Refactor |
| `src/components/canvas/toolbar.tsx` | ~8 | Refactor |
| `src/components/canvas/navbar/index.tsx` | ~25 | Refactor |
| `src/hooks/usePerformanceMode.ts` | ~50 | Deprecation wrapper |
| `src/pages/_app.tsx` | +5 | Integration |

**Total:** ~460 lines changed across 10 files

---

## Impact Assessment

### Performance
- ⬆️ **Improved**: Reduced redundant device detection by ~80%
- ⬆️ **Improved**: Skip intro option eliminates 3+ seconds of animation overhead
- ➡️ **Neutral**: Constants consolidation has no runtime impact

### Maintainability
- ⬆️⬆️ **Significantly Improved**: Single file for all configuration
- ⬆️ **Improved**: No circular dependencies
- ⬆️ **Improved**: Self-documenting constants with JSDoc

### Developer Experience
- ⬆️⬆️ **Significantly Improved**: Intro customization without source edits
- ⬆️ **Improved**: Better TypeScript autocomplete
- ⬆️ **Improved**: Easier testing with `skipIntro`

### Library Extraction Readiness
- ⬆️⬆️ **Significantly Improved**: Constants can be overridden by library consumers
- ⬆️⬆️ **Significantly Improved**: Intro animation fully customizable (no hardcoded branding)
- ⬆️ **Improved**: Performance provider is app-agnostic

---

**Date:** January 10, 2026  
**Author:** AI Assistant  
**Reviewed By:** [Pending]
