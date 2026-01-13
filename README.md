# @hunterchen/canvas

A React-based canvas library for creating pannable, zoomable, and interactive canvas experiences. Originally developed (by me) for the [Hack Western 12 Website](https://github.com/hackwestern/hackwestern/tree/2025).

## Installation

Install the package via npm:

```bash
npm install @hunterchen/canvas
```

### Required Peer Dependencies

This library requires the following peer dependencies:

```bash
npm install react react-dom framer-motion
```

### Important: Import Styles

**You must import the compiled CSS file in your application's entry point.** The library uses pre-compiled Tailwind CSS, so you don't need to install or configure Tailwind yourself.

> **Note:** The library uses the `canvas-` prefix for all custom CSS classes and variables to minimize conflicts with your project. Custom colors like `canvas-heavy`, `canvas-medium`, `canvas-offwhite`, fonts like `canvas-figtree`, and utilities like `canvas-backface-hidden` are scoped to avoid naming collisions. You can safely use Tailwind CSS in your own project alongside this library.

In your main application file (e.g., `App.tsx`, `_app.tsx`, `main.tsx`, or `index.tsx`):

```typescript
import '@hunterchen/canvas/styles.css';
```

For Next.js:
```typescript
// pages/_app.tsx
import '@hunterchen/canvas/styles.css';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
```

For Vite/React:
```typescript
// main.tsx or App.tsx
import '@hunterchen/canvas/styles.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

## Quick Start

```tsx
import { Canvas, CanvasComponent } from '@hunterchen/canvas';

const homeCoordinates = { x: 0, y: 0, width: 1920, height: 1080 };

function App() {
  return (
    <Canvas homeCoordinates={homeCoordinates}>
      <CanvasComponent offset={homeCoordinates}>
        {/* Your section content here */}
      </CanvasComponent>
    </Canvas>
  );
}
```

The `Canvas` component requires `homeCoordinates` to define the initial viewport position. Use `CanvasComponent` to wrap your content sections and position them at specific coordinates on the canvas.

## Configuration

### Home Coordinates

The `homeCoordinates` prop defines where the canvas initially centers when it loads. This is a required prop that specifies the starting section's position and dimensions:

```tsx
const homeCoordinates: SectionCoordinates = {
  x: 2867,      // X position in canvas space
  y: 1200,      // Y position in canvas space
  width: 264,   // Section width
  height: 800   // Section height
};

<Canvas homeCoordinates={homeCoordinates}>
  {/* ... */}
</Canvas>
```

### Navigation Items

The `navItems` prop is optional and defines sections that appear in the canvas navbar. Each navigation item specifies a section with its coordinates, label, icon, and whether it's the home section:

```tsx
import type { NavItem } from '@hunterchen/canvas';

const navItems: NavItem[] = [
  {
    id: "home",
    label: "Home",
    icon: "Home",           // Lucide icon name or custom component
    x: 2867,
    y: 1200,
    width: 264,
    height: 800,
    isHome: true            // Marks this as the home section
  },
  {
    id: "about",
    label: "About",
    icon: "Info",
    x: 1400,
    y: 400,
    width: 1013,
    height: 800
  },
  // ... more sections
];

<Canvas homeCoordinates={homeCoordinates} navItems={navItems}>
  {/* ... */}
</Canvas>
```

When `navItems` is provided, the canvas will render a navbar with buttons to navigate between sections. The navbar uses Lucide icons, so make sure the icon names match available Lucide icons.

## Customization

### Background Customization

The canvas comes with neutral gray default backgrounds. You can fully customize the canvas background, intro/wrapper background, and intro content.

#### Canvas Background

The canvas background consists of a gradient, dot pattern, and noise filter. Customize it by passing a `canvasBackground` prop:

```tsx
import { Canvas, DefaultCanvasBackground } from '@hunterchen/canvas';

// Option 1: Use the default component with custom props
<Canvas
  homeCoordinates={homeCoordinates}
  canvasBackground={
    <DefaultCanvasBackground
      gradientStyle="radial-gradient(circle, #ff6b6b 0%, #4ecdc4 100%)"
      dotColor="#333333"
      dotOpacity={0.5}
      showFilter={false}
    />
  }
>
  {/* ... */}
</Canvas>

// Option 2: Pass your own custom background component
<Canvas
  homeCoordinates={homeCoordinates}
  canvasBackground={<MyCustomBackground />}
>
  {/* ... */}
</Canvas>
```

**DefaultCanvasBackground props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `gradientStyle` | `string` | neutral gray gradient | CSS gradient string |
| `showDots` | `boolean` | `true` | Show dot pattern overlay |
| `dotColor` | `string` | `#888888` | Dot pattern color |
| `dotSize` | `number` | `1.5` | Dot size in pixels |
| `dotSpacing` | `number` | `22` | Dot spacing in pixels |
| `dotOpacity` | `number` | `0.35` | Dot pattern opacity (0-1) |
| `showFilter` | `boolean` | `true` | Show noise filter |
| `filterOpacity` | `number` | `0.6` | Noise filter opacity (0-1) |

#### Intro/Wrapper Background

Customize the background shown during the intro animation:

```tsx
import { Canvas, DefaultWrapperBackground } from '@hunterchen/canvas';

// Option 1: Simple gradient string
<Canvas
  homeCoordinates={homeCoordinates}
  introBackgroundGradient="linear-gradient(to bottom, #667eea 0%, #764ba2 100%)"
>
  {/* ... */}
</Canvas>

// Option 2: Custom wrapper background component
<Canvas
  homeCoordinates={homeCoordinates}
  wrapperBackground={
    <DefaultWrapperBackground
      gradient="linear-gradient(to top, #FEB6AF 0%, #EAD2DF 50%)"
    />
  }
>
  {/* ... */}
</Canvas>
```

#### Intro Content

Customize the logo and title shown during loading:

```tsx
import { Canvas, DefaultIntroContent } from '@hunterchen/canvas';

<Canvas
  homeCoordinates={homeCoordinates}
  introContent={
    <DefaultIntroContent
      logoSrc="/my-logo.svg"
      logoAlt="My App Logo"
      logoWidth={80}
      logoHeight={80}
      title="MY APP"
      titleClassName="text-blue-600"
    />
  }
  loadingText="Loading..."
>
  {/* ... */}
</Canvas>
```

#### Complete Theming Example (Hack Western Style)

Here's a complete example showing how to apply a custom theme:

```tsx
import {
  Canvas,
  DefaultCanvasBackground,
  DefaultIntroContent,
  DefaultWrapperBackground,
  canvasWidth,
  canvasHeight,
} from '@hunterchen/canvas';

// Define your theme colors
const CANVAS_GRADIENT = `radial-gradient(ellipse ${canvasWidth}px ${canvasHeight}px at ${canvasWidth / 2}px ${canvasHeight}px, var(--coral) 0%, var(--salmon) 41%, var(--lilac) 59%, var(--beige) 90%)`;
const INTRO_GRADIENT = "linear-gradient(to top, #FEB6AF 0%, #EAD2DF 15%, #EFE3E1 50%)";
const BOX_GRADIENT = "radial-gradient(130.38% 95% at 50.03% 97.25%, #EFB8A0 0%, #EAD2DF 48.09%, #EFE3E1 100%)";

function App() {
  return (
    <Canvas
      homeCoordinates={homeCoordinates}
      navItems={navItems}
      introBackgroundGradient={INTRO_GRADIENT}
      canvasBoxGradient={BOX_GRADIENT}
      introContent={
        <DefaultIntroContent
          logoSrc="/logo.svg"
          logoAlt="Logo"
          title="MY BRAND"
        />
      }
      loadingText="LOADING..."
      canvasBackground={
        <DefaultCanvasBackground
          gradientStyle={CANVAS_GRADIENT}
          dotColor="#776780"
        />
      }
      wrapperBackground={
        <DefaultWrapperBackground gradient={INTRO_GRADIENT} />
      }
    >
      {/* Your canvas content */}
    </Canvas>
  );
}
```

### Exported Constants

The library exports default gradient values you can use as a starting point:

```tsx
import {
  DEFAULT_CANVAS_GRADIENT,    // Default canvas background gradient
  DEFAULT_INTRO_GRADIENT,     // Default intro background gradient
  DEFAULT_CANVAS_BOX_GRADIENT // Default blur mask gradient
} from '@hunterchen/canvas';
```

## Usage Examples

### Basic Canvas with Draggable Elements

```tsx
import {
  Canvas,
  CanvasProvider,
  Draggable,
  CanvasToolbar,
  CanvasNavbar
} from '@hunterchen/canvas';

function MyCanvas() {
  return (
    <CanvasProvider>
      <Canvas>
        <CanvasToolbar />
        <CanvasNavbar />
        <Draggable initialX={100} initialY={100}>
          <div>Drag me!</div>
        </Draggable>
      </Canvas>
    </CanvasProvider>
  );
}
```

## Development

To build the library from source:

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Run type checking
npm run type-check
```

## Key Features

- **Pan & Zoom**: Click and drag to pan, pinch/scroll to zoom
- **Draggable Elements**: Built-in support for draggable components
- **Performance Optimized (more to do)**: Adaptive rendering based on device capabilities
- **Pre-compiled CSS**: No Tailwind configuration needed in your project
- **TypeScript Support**: Full type definitions included

## Available Exports

### Components
- `Canvas` - Main canvas component with pan/zoom functionality
- `CanvasWrapper` - Animated wrapper for canvas initialization
- `CanvasComponent` - Canvas component renderer with visibility optimization
- `Draggable`, `DraggableImage` - Draggable elements
- `CanvasToolbar` - Coordinate/zoom display toolbar
- `CanvasNavbar` - Navigation buttons

### Background Components
- `DefaultCanvasBackground` - Customizable canvas background with gradient, dots, and filter
- `DefaultWrapperBackground` - Customizable intro/wrapper background
- `DefaultIntroContent` - Customizable intro logo and title
- `DefaultCanvasBlurMask` - Reference component for blur mask styling
- `DEFAULT_CANVAS_GRADIENT` - Default canvas gradient constant
- `DEFAULT_INTRO_GRADIENT` - Default intro gradient constant
- `DEFAULT_CANVAS_BOX_GRADIENT` - Default blur mask gradient constant

### Contexts
- `CanvasProvider` - Canvas state context provider
- `useCanvasContext` - Hook to access canvas context
- `PerformanceProvider` - Performance optimization context
- `usePerformanceMode`, `usePerformance` - Performance-related hooks

### Hooks
- `useWindowDimensions` - Window size tracking
- `usePerformanceModeLegacy` - Legacy performance optimization

### Utilities
- `cn` - Tailwind class merging utility (uses `clsx` + `tailwind-merge`)
- Canvas utility functions (pan, zoom, coordinates)
- Performance detection utilities
- Constants and types

## API Reference

### Canvas Props

The `Canvas` component accepts standard React props and renders an interactive canvas with pan/zoom capabilities.

### Draggable Props

```tsx
interface DraggableProps {
  initialX?: number;
  initialY?: number;
  children: React.ReactNode;
}
```

### CanvasContext

Access canvas state using `useCanvasContext()`:
```tsx
const { x, y, scale } = useCanvasContext();
```

## Library Structure

```
@hunterchen/canvas/
├── dist/
│   ├── styles.css          # Pre-compiled Tailwind CSS (import this!)
│   ├── index.js            # Main entry point
│   ├── index.d.ts          # TypeScript definitions
│   ├── components/         # Canvas components
│   ├── contexts/           # React contexts
│   ├── hooks/              # Custom hooks
│   └── lib/                # Utility functions
└── src/
    ├── components/
    ├── contexts/
    ├── hooks/
    ├── lib/
    └── styles.css          # Source CSS file
```

## Troubleshooting

### Styles Not Working

Make sure you've imported the CSS file:
```typescript
import '@hunterchen/canvas/styles.css';
```

### TypeScript Errors

Ensure you have the required peer dependencies installed:
```bash
npm install react react-dom framer-motion
```

### Missing Types

The library includes full TypeScript definitions. If you're having issues, make sure your `tsconfig.json` includes:
```json
{
  "compilerOptions": {
    "moduleResolution": "node"
  }
}
```

## License

MIT

## Contributing

This library was extracted from the [Hack Western 12 Website](https://github.com/hackwestern/hackwestern). Contributions are welcome!
