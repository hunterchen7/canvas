# Canvas Library - Dependency Graph

This document maps the import relationships between all canvas-related files to aid in library extraction.

## Dependency Legend

```
→ imports from
⇢ app-specific import (needs removal/replacement)
```

---

## Core Components

### `canvas.tsx` (Main Entry)

```
canvas.tsx
  → framer-motion (motion, MotionValue, Point, useMotionValue, animate, useTransform)
  → react (useState, useRef, PointerEvent, FC, useEffect, useCallback, useMemo)
  → contexts/CanvasContext.tsx (CanvasProvider)
  ⇢ hooks/use-toast.ts (useToast) — REMOVE for library
  → lib/canvas.ts (calcInitialBoxWidth, canvasHeight, canvasWidth, getDistance, 
                   getMidpoint, getScreenSizeEnum, getSectionPanCoordinates,
                   INTERACTIVE_SELECTOR, MAX_ZOOM, MIN_ZOOMS, panToOffsetScene, ZOOM_BOUND)
  → hooks/useWindowDimensions.ts (useWindowDimensions)
  → ./navbar (Navbar)
  → ./toolbar.tsx (Toolbar)
  → constants/canvas.ts (CanvasSection, SectionCoordinates)
  → ./wrapper.tsx (CanvasWrapper)
  → hooks/usePerformanceMode.ts (usePerformanceMode)
```

### `component.tsx` (Viewport Culling Wrapper)

```
component.tsx
  → react (FC, useEffect, useState)
  → constants/canvas.ts (SectionCoordinates, coordinatesToSection)
  → contexts/CanvasContext.tsx (useCanvasContext)
  ⇢ next/image (Image) — REPLACE for library
  → hooks/useWindowDimensions.ts (useWindowDimensions)
  → hooks/usePerformanceMode.ts (usePerformanceMode)
```

### `wrapper.tsx` (Intro Animation)

```
wrapper.tsx
  → framer-motion (Easing, motion, MotionValue)
  → react (useState, useEffect, useRef)
  ⇢ next/image (Image) — REPLACE for library (Hack Western logo)
```

### `draggable.tsx` (Draggable Components)

```
draggable.tsx
  → react (useRef, useEffect, forwardRef, useState, useCallback)
  → framer-motion (animate, motion, useAnimationControls, useMotionValue, 
                   HTMLMotionProps, PanInfo)
  → contexts/CanvasContext.tsx (useCanvasContext)
```

### `cursor.tsx` (Custom Cursor)

```
cursor.tsx
  → react (useEffect, useState)
  (No other internal dependencies - self-contained)
```

### `toolbar.tsx` (Position Display)

```
toolbar.tsx
  → framer-motion (Point, useTransform, motion)
  → react (useEffect, useState)
  → contexts/CanvasContext.tsx (useCanvasContext)
```

### `reset.tsx` (Reset Button)

```
reset.tsx
  ⇢ next/image (Image) — REPLACE for library
```

### `offset.tsx` (Simple Offset Wrapper)

```
offset.tsx
  → framer-motion (motion, Point)
  (Minimal component - basically a styled wrapper)
```

---

## Navbar Components

### `navbar/index.tsx`

```
navbar/index.tsx
  → framer-motion (motion, useMotionValueEvent)
  → react (useState, useRef, useEffect, useCallback)
  → ./single-button.tsx (SingleButton)
  → constants/canvas.ts (CanvasSection, coordinates)
  → contexts/CanvasContext.tsx (useCanvasContext)
  → hooks/useWindowDimensions.ts (useWindowDimensions)
  → hooks/usePerformanceMode.ts (usePerformanceMode)
  → lib/canvas.ts (ScreenSizeEnum, getScreenSizeEnum, getSectionPanCoordinates)
```

### `navbar/single-button.tsx`

```
navbar/single-button.tsx
  → react (useState, useEffect)
  → lucide-react (icons) — MAKE PLUGGABLE for library
  → framer-motion (AnimatePresence, motion)
  ⇢ hooks/use-toast.ts (useToast) — REMOVE for library
  ⇢ lib/copy.ts (copyText) — INLINE or remove
```

---

## Context

### `contexts/CanvasContext.tsx`

```
CanvasContext.tsx
  → react (createContext, useContext, ReactNode)
  → framer-motion (MotionValue)
  → constants/canvas.ts (CanvasSection)
```

---

## Libraries (Pure Utilities)

### `lib/canvas.ts`

```
lib/canvas.ts
  → framer-motion (animate, MotionValue, Point)
  → react (useMemo)
  → components/canvas/wrapper.tsx (MAX_DIM_RATIO) — CIRCULAR, move constant
```

### `lib/copy.ts`

```
lib/copy.ts
  (No dependencies - pure utility)
```

---

## Hooks

### `hooks/useWindowDimensions.ts`

```
useWindowDimensions.ts
  → react (useEffect, useState)
  (No other dependencies - pure utility)
```

### `hooks/usePerformanceMode.ts`

```
usePerformanceMode.ts
  → react (useState, useEffect)
  → utils/performance.ts (isIOS, isMobile, prefersReducedMotion)
  → hooks/useWindowDimensions.ts (useWindowDimensions)
```

### `hooks/use-toast.ts`

```
use-toast.ts
  → react
  ⇢ components/ui/toast.tsx — APP-SPECIFIC, exclude from library
```

---

## Utils

### `utils/performance.ts`

```
performance.ts
  (No dependencies - pure utility functions)
  Exports: isIOS, isMobile, prefersReducedMotion, getWillChange
```

---

## Constants

### `constants/canvas.ts`

```
canvas.ts
  (No dependencies)
  
  Exports:
    - CanvasSection (enum)
    - SectionCoordinates (interface)
    - coordinates (Record<CanvasSection, SectionCoordinates>)
    - coordinatesToSection (function)
  
  ⚠️ This file is APP-SPECIFIC and should be user-defined in the library
```

---

## Dependency Matrix

| File | framer-motion | react | next/image | lucide | Internal |
|------|:-------------:|:-----:|:----------:|:------:|:--------:|
| canvas.tsx | ✓ | ✓ | - | - | 8 files |
| component.tsx | ✓ | ✓ | ✓ | - | 4 files |
| wrapper.tsx | ✓ | ✓ | ✓ | - | 0 files |
| draggable.tsx | ✓ | ✓ | - | - | 1 file |
| cursor.tsx | - | ✓ | - | - | 0 files |
| toolbar.tsx | ✓ | ✓ | - | - | 1 file |
| reset.tsx | - | - | ✓ | - | 0 files |
| offset.tsx | ✓ | - | - | - | 0 files |
| navbar/index.tsx | ✓ | ✓ | - | - | 5 files |
| navbar/single-button.tsx | ✓ | ✓ | - | ✓ | 2 files |
| CanvasContext.tsx | ✓ | ✓ | - | - | 1 file |
| lib/canvas.ts | ✓ | ✓ | - | - | 1 file |
| useWindowDimensions.ts | - | ✓ | - | - | 0 files |
| usePerformanceMode.ts | - | ✓ | - | - | 2 files |
| performance.ts | - | - | - | - | 0 files |

---

## Circular Dependencies

⚠️ **Identified Circular Import:**
```
lib/canvas.ts → components/canvas/wrapper.tsx (MAX_DIM_RATIO)
                ↓
wrapper.tsx uses lib/canvas.ts indirectly via Canvas
```

**Resolution:** Move `MAX_DIM_RATIO` to `lib/canvas.ts` or a shared constants file.

---

## Extraction Order

Based on dependencies, extract in this order:

### Tier 1: No internal dependencies
1. `utils/performance.ts`
2. `hooks/useWindowDimensions.ts`
3. `cursor.tsx`

### Tier 2: Minimal dependencies  
4. `hooks/usePerformanceMode.ts` (needs Tier 1)
5. `lib/canvas.ts` (move MAX_DIM_RATIO here)
6. `offset.tsx`

### Tier 3: Context layer
7. `contexts/CanvasContext.tsx` (types only, no coordinates)

### Tier 4: Components
8. `draggable.tsx`
9. `toolbar.tsx`
10. `wrapper.tsx` (remove branding)
11. `component.tsx` (remove next/image)

### Tier 5: Navigation (optional)
12. `navbar/single-button.tsx` (make icons pluggable)
13. `navbar/index.tsx` (make sections generic)
14. `reset.tsx`

### Tier 6: Main entry
15. `canvas.tsx` (remove toast, wire everything)

---

## Files to NOT Include in Library

| File | Reason |
|------|--------|
| `constants/canvas.ts` | App-specific section definitions |
| `hooks/use-toast.ts` | App UI system |
| `lib/copy.ts` | Navbar-specific utility |
| `components/ui/*` | General UI, not canvas-specific |
| `pages/*` | App pages |
| `components/promo/*` | App content |
| `components/footer.tsx` | App component |

---

## Import Graph Visualization

```
                    ┌─────────────────┐
                    │   canvas.tsx    │
                    └────────┬────────┘
           ┌─────────────────┼─────────────────┐
           ↓                 ↓                 ↓
    ┌──────────┐      ┌──────────┐      ┌──────────┐
    │ wrapper  │      │  navbar  │      │ toolbar  │
    └────┬─────┘      └────┬─────┘      └────┬─────┘
         │                 │                 │
         │                 ↓                 │
         │          ┌──────────────┐        │
         │          │single-button │        │
         │          └──────────────┘        │
         │                                   │
         └──────────────┬───────────────────┘
                        ↓
              ┌─────────────────┐
              │ CanvasContext   │
              └────────┬────────┘
                       ↓
              ┌─────────────────┐
              │   lib/canvas    │←──────────────┐
              └────────┬────────┘               │
    ┌──────────────────┼──────────────────┐     │
    ↓                  ↓                  ↓     │
┌────────┐      ┌──────────────┐    ┌─────────┐│
│draggable│     │usePerformance│    │component││
└────────┘      └──────┬───────┘    └─────────┘│
                       ↓                        │
              ┌─────────────────┐               │
              │ utils/perform.  │               │
              └─────────────────┘               │
                                                │
              ┌─────────────────┐               │
              │useWindowDimens. │───────────────┘
              └─────────────────┘
```
