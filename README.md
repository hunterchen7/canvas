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
import { Canvas, CanvasProvider } from '@hunterchen/canvas';

function App() {
  return (
    <CanvasProvider>
      <Canvas>
        {/* Your canvas content here */}
      </Canvas>
    </CanvasProvider>
  );
}
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
- **Performance Optimized**: Adaptive rendering based on device capabilities
- **Responsive**: Works on desktop and mobile (desktop recommended)
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

### Contexts
- `CanvasProvider` - Canvas state context provider
- `useCanvasContext` - Hook to access canvas context
- `PerformanceProvider` - Performance optimization context
- `usePerformanceMode`, `usePerformance` - Performance-related hooks

### Hooks
- `useWindowDimensions` - Window size tracking
- `usePerformanceModeLegacy` - Legacy performance optimization

### Utilities
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
