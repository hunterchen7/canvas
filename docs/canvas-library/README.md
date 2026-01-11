# Canvas Library

A React-based infinite canvas library for creating pannable, zoomable, and interactive canvas experiences. Built with **Framer Motion** for smooth animations and gestures.

## Overview

This library provides a comprehensive solution for building infinite canvas UIs where users can:
- Pan and zoom the canvas with mouse, trackpad, or touch gestures
- Navigate to specific sections programmatically
- Place and drag elements freely on the canvas
- Optimize rendering based on viewport visibility

Originally developed for [Hack Western 12](https://hackwestern.com), this library powers a fully interactive hackathon landing page where users explore content like a creative workspace.

---

## Features

- **Infinite Canvas**: Large pannable/zoomable scene (default 6000×4000px)
- **Gesture Support**: Mouse pan, trackpad scroll/pinch, touch pinch-to-zoom
- **Animated Navigation**: Smooth spring-based transitions between sections
- **Performance Optimization**: Viewport culling, hysteresis visibility, device detection
- **Intro Animation**: Cinematic "grow" intro with staged reveal
- **Context System**: Shared state for canvas position, scale, and z-index management
- **Draggable Components**: Drag-and-drop elements with alpha-hit detection for images

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Canvas                              │
│  (Main orchestrator - handles gestures, state, animations) │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │                 CanvasWrapper                       │    │
│  │     (Intro animation, loading state, gradient)     │    │
│  │                                                     │    │
│  │  ┌─────────────────────────────────────────────┐   │    │
│  │  │              CanvasProvider                  │   │    │
│  │  │   (React Context for shared canvas state)   │   │    │
│  │  │                                              │   │    │
│  │  │  ┌──────────────────────────────────────┐   │   │    │
│  │  │  │         Scene (motion.div)           │   │   │    │
│  │  │  │   x, y, scale motion values          │   │   │    │
│  │  │  │                                      │   │   │    │
│  │  │  │  ┌─────────────────────────────────┐│   │   │    │
│  │  │  │  │     CanvasComponent(s)         ││   │   │    │
│  │  │  │  │  (Viewport-culled sections)    ││   │   │    │
│  │  │  │  │                                 ││   │   │    │
│  │  │  │  │  ┌─────────────────────────┐   ││   │   │    │
│  │  │  │  │  │   Draggable / Content   │   ││   │   │    │
│  │  │  │  │  │                         │   ││   │   │    │
│  │  │  │  │  └─────────────────────────┘   ││   │   │    │
│  │  │  │  └─────────────────────────────────┘│   │   │    │
│  │  │  └──────────────────────────────────────┘   │   │    │
│  │  └─────────────────────────────────────────────┘   │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │   Toolbar   │  │   Navbar    │  │      Cursor      │   │
│  │ (Position)  │  │ (Navigate)  │  │  (Custom pointer)│   │
│  └─────────────┘  └─────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### `Canvas`
The main component that orchestrates everything. Handles:
- Pan/zoom gestures (mouse, touch, trackpad)
- Animation stages (intro grow → pan to home → interactive)
- Coordinate system management
- Scene rendering with motion values

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `homeCoordinates` | `SectionCoordinates` | Initial section to focus after intro |
| `children` | `ReactNode` | Content to render inside the canvas |

### `CanvasComponent`
Wrapper for content sections with viewport culling optimization.

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `offset` | `SectionCoordinates` | Position and size on canvas |
| `children` | `ReactNode` | Section content |
| `imageFallback?` | `string` | Static image to show during intro |

### `CanvasWrapper`
Handles the intro animation sequence with loading state.

### `CanvasContext` / `CanvasProvider`
React context providing shared canvas state:
- `x`, `y`, `scale` (MotionValue<number>)
- `isResetting`, `maxZIndex`, `animationStage`
- `nextTargetSection` (for predictive rendering)

### `Draggable`
Generic draggable wrapper that respects canvas scale.

### `DraggableImage`
Image variant with alpha-hit detection (only drags on opaque pixels).

### `Navbar`
Bottom navigation bar for section jumping.

### `Toolbar`
Position/scale indicator overlay.

### `Cursor`
Custom cursor component.

---

## Utility Functions (`lib/canvas.ts`)

| Function | Description |
|----------|-------------|
| `canvasWidth` / `canvasHeight` | Canvas dimensions (6000×4000) |
| `getSectionPanCoordinates()` | Calculate pan offset to center a section |
| `panToOffsetScene()` | Animate to specific coordinates with spring |
| `calcInitialBoxWidth()` | Compute initial scale for intro animation |
| `getDistance()` / `getMidpoint()` | Pinch gesture helpers |
| `getScreenSizeEnum()` | Responsive breakpoint detection |

---

## Constants (`constants/canvas.ts`)

### `CanvasSection` (enum)
Defines named sections: `About`, `Projects`, `Home`, `FAQ`, `Sponsors`, `Team`

### `coordinates`
Map of `CanvasSection` → `SectionCoordinates` with `{ x, y, width, height }`

### `SectionCoordinates` (interface)
```typescript
interface SectionCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `framer-motion` | Animation, gestures, motion values |
| `react` | UI framework |
| `lucide-react` | Icons (Navbar) |
| `next/image` | Image optimization (Next.js specific) |

---

## Installation & Setup

### 1. Install the package

```bash
npm install @canvas/core
```

### 2. Install peer dependencies

```bash
npm install framer-motion react react-dom
```

### 3. Configure Tailwind CSS

The canvas library uses Tailwind CSS for styling. You must add the library's source files to your Tailwind config's `content` array so that the classes are included in your CSS bundle:

```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    // Include @canvas/core components
    "./node_modules/@canvas/core/src/**/*.{ts,tsx}",
    // Or if using a monorepo with file: linking:
    // "../canvas/src/**/*.{ts,tsx}",
  ],
  // ... rest of config
};

export default config;
```

### 4. Required CSS Variables

The library uses the following CSS custom properties. Add them to your global CSS:

```css
:root {
  --border: 220 13% 91%;
  --coral: #f4a89a;
  --salmon: #f8b4a8;
  --lilac: #e8d5e0;
  --beige: #f5ebe0;
}
```

---

## Usage Example

```tsx
import Canvas from './canvas/canvas';
import { CanvasComponent } from './canvas/component';
import { coordinates, CanvasSection } from '../constants/canvas';

function App() {
  return (
    <Canvas homeCoordinates={coordinates[CanvasSection.Home]}>
      <CanvasComponent offset={coordinates[CanvasSection.Home]}>
        <h1>Welcome!</h1>
      </CanvasComponent>
      
      <CanvasComponent offset={coordinates[CanvasSection.About]}>
        <AboutSection />
      </CanvasComponent>
      
      <CanvasComponent offset={coordinates[CanvasSection.Projects]}>
        <ProjectsSection />
      </CanvasComponent>
    </Canvas>
  );
}
```

---

## File Structure

```
src/
├── components/canvas/
│   ├── canvas.tsx          # Main canvas orchestrator (675 lines)
│   ├── component.tsx       # CanvasComponent with viewport culling
│   ├── wrapper.tsx         # Intro animation wrapper
│   ├── draggable.tsx       # Draggable + DraggableImage
│   ├── cursor.tsx          # Custom cursor
│   ├── toolbar.tsx         # Position/scale display
│   ├── reset.tsx           # Reset button
│   ├── offset.tsx          # Simple offset wrapper
│   └── navbar/
│       ├── index.tsx       # Navigation bar
│       └── single-button.tsx
│
├── contexts/
│   └── CanvasContext.tsx   # Canvas state context
│
├── constants/
│   └── canvas.ts           # Section coordinates & enums
│
├── lib/
│   └── canvas.ts           # Canvas utilities
│
├── hooks/
│   ├── useWindowDimensions.ts
│   └── usePerformanceMode.ts
│
└── utils/
    └── performance.ts      # Device detection utilities
```

---

## Performance Considerations

1. **Viewport Culling**: `CanvasComponent` only renders children when visible (+ buffer)
2. **Hysteresis**: Visibility uses a buffer zone to prevent flicker at edges
3. **Performance Mode**: Detects iOS/mobile for reduced animations
4. **will-change**: Applied only during active animations
5. **Predictive Rendering**: `nextTargetSection` pre-renders navigation targets

---

## Extracting as a Library

To extract this as a standalone library, the following changes are needed:

1. **Remove Next.js dependencies**: Replace `next/image` with standard `<img>` or make it pluggable
2. **Extract app-specific constants**: `CanvasSection` and `coordinates` should be user-defined
3. **Make hooks optional**: `useToast` and app-specific toast system
4. **Bundle with Rollup/Vite**: Compile to ESM/CJS with TypeScript declarations
5. **Peer dependencies**: `react`, `react-dom`, `framer-motion`

See [llms.txt](./llms.txt) for AI-optimized context.
