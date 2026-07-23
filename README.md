[![npm downloads](https://img.shields.io/npm/dt/@hunterchen/canvas.svg)](https://www.npmjs.com/package/@hunterchen/canvas)


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

When `navItems` is provided, the canvas will render a navbar with buttons to navigate between sections.

#### Using Icons

The `icon` property accepts either a Lucide icon name (string) or a custom React component:

```tsx
import { Heart } from 'lucide-react';

// Using Lucide icon names (strings)
const navItems: NavItem[] = [
  { id: "home", label: "Home", icon: "Home", ...coordinates.home, isHome: true },
  { id: "about", label: "About", icon: "Info", ...coordinates.about },
];

// Using custom icon components
const CustomIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10" />
  </svg>
);

const navItems: NavItem[] = [
  { id: "home", label: "Home", icon: Heart, ...coordinates.home, isHome: true },
  { id: "custom", label: "Custom", icon: CustomIcon, ...coordinates.custom },
];
```

For Lucide icons, use the PascalCase icon name as a string (e.g., `"Home"`, `"Settings"`, `"ChevronRight"`). See the [Lucide icons list](https://lucide.dev/icons) for available icons.

### Canvas Dimensions

By default, the canvas uses a size of 6000×4000 pixels. You can customize the canvas dimensions using the `canvasWidth` and `canvasHeight` props to create larger or smaller canvas spaces:

```tsx
<Canvas
  homeCoordinates={homeCoordinates}
  canvasWidth={8000}   // Custom width (default: 6000)
  canvasHeight={6000}  // Custom height (default: 4000)
>
  {/* ... */}
</Canvas>
```

**When to customize canvas dimensions:**
- **Larger canvases** (e.g., 10000×8000): When you have many sections spread across a wide area, or want more space for users to explore
- **Smaller canvases** (e.g., 4000×3000): For simpler layouts with fewer sections, reducing memory usage on lower-end devices
- **Custom aspect ratios**: Match your content layout needs (e.g., ultra-wide canvases for timeline-style layouts)

**Important considerations:**
- Canvas coordinates in `homeCoordinates`, `navItems`, and `CanvasComponent` offsets should be within your custom canvas bounds
- Larger canvases use more memory but provide more space for content
- The canvas automatically handles zoom limits based on your custom dimensions

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

Here's a complete example showing how to apply a custom theme with warm coral/lilac colors (used by [Hack Western](https://2025.hackwestern.com)):

```tsx
import {
  Canvas,
  DefaultCanvasBackground,
  DefaultIntroContent,
  DefaultWrapperBackground,
  canvasWidth,
  canvasHeight,
} from '@hunterchen/canvas';

// Hack Western theme colors (coral/lilac warm palette)
const CANVAS_GRADIENT = `radial-gradient(ellipse ${canvasWidth}px ${canvasHeight}px at ${canvasWidth / 2}px ${canvasHeight}px, #f7f1e5 0%, #d9c8e6 41%, #ffb5a7 59%, #f7f1e5 90%)`;
const INTRO_GRADIENT = "linear-gradient(to top, #ffb5a7 0%, #d9c8e6 50%, #f7f1e5 100%)";
const BOX_GRADIENT = "radial-gradient(130.38% 95% at 50.03% 97.25%, #ffb5a7 0%, #d9c8e6 48.09%, #f7f1e5 100%)";

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
          title="HACK WESTERN"
          titleClassName="text-[#513b7a]"
        />
      }
      loadingText="LOADING..."
      canvasBackground={
        <DefaultCanvasBackground
          gradientStyle={CANVAS_GRADIENT}
          dotColor="#c9a7db"
        />
      }
      wrapperBackground={
        <DefaultWrapperBackground gradient={INTRO_GRADIENT} />
      }
      navbarConfig={{
        buttonConfig: {
          activeClassName: "bg-[#f5f2f7]",
          hoverClassName: "bg-[#f5f2f7]",
        },
      }}
    >
      {/* Your canvas content */}
    </Canvas>
  );
}
```

#### Customizing CSS Variables

The library uses CSS variables for theming. You can override them in your CSS to customize colors globally:

```css
:root {
  /* Text colors */
  --canvas-heavy: #3c204c;      /* Darkest text */
  --canvas-emphasis: #513b7a;   /* Emphasized text */
  --canvas-active: #8f57ad;     /* Active/selected state */
  --canvas-medium: #776780;     /* Medium text */
  --canvas-light: #c3b8cb;      /* Light text */

  /* Background colors */
  --canvas-beige: #f7f1e5;      /* Warm beige */
  --canvas-coral: #ffb5a7;      /* Coral accent */
  --canvas-lilac: #d9c8e6;      /* Lilac accent */
  --canvas-salmon: #ffa585;     /* Salmon accent */
  --canvas-tinted: #c9a7db;     /* Tinted purple */
  --canvas-faint-lilac: #f5f2f7; /* Very light lilac */
  --canvas-offwhite: #fdfcfd;   /* Off-white */
  --canvas-highlight: #f5f2f7;  /* Highlight/hover */
}
```

### Toolbar Customization

The toolbar displays the current canvas coordinates and zoom level. You can customize its position, appearance, and behavior using the `toolbarConfig` prop.

```tsx
<Canvas
  homeCoordinates={homeCoordinates}
  toolbarConfig={{
    position: "top-right",
    className: "font-sans",
    style: { fontSize: "14px", color: "#525252" },
  }}
>
  {/* ... */}
</Canvas>
```

**ToolbarConfig options:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `hidden` | `boolean` | `false` | Hide the toolbar entirely |
| `display` | `'coordinates' \| 'scale' \| 'both'` | `'both'` | What to display |
| `position` | `'top-left' \| 'top-right' \| 'bottom-left' \| 'bottom-right'` | `'top-left'` | Preset position |
| `disableAutoHide` | `boolean` | `false` | Disable auto-hide when at home position |
| `className` | `string` | - | Additional CSS classes for the container |
| `coordinatesClassName` | `string` | - | CSS classes for coordinates text |
| `scaleClassName` | `string` | - | CSS classes for scale text |
| `separatorClassName` | `string` | - | CSS classes for the separator |
| `style` | `CSSProperties` | - | Inline styles for the container |
| `coordinatesStyle` | `CSSProperties` | - | Inline styles for coordinates |
| `scaleStyle` | `CSSProperties` | - | Inline styles for scale |
| `separator` | `string` | `'\|'` | Custom separator character |
| `separatorGap` | `number \| string` | - | Gap around the separator (e.g., `8` or `'0.5rem'`) |
| `coordinatesFormat` | `(x: number, y: number) => string` | - | Custom coordinates formatter |
| `scaleFormat` | `(scale: number) => string` | - | Custom scale formatter |

#### Toolbar Examples

```tsx
// Show only scale, positioned bottom-right
<Canvas
  toolbarConfig={{
    display: "scale",
    position: "bottom-right",
  }}
/>

// Custom styling with Tailwind
<Canvas
  toolbarConfig={{
    position: "top-right",
    className: "font-sans font-medium px-4",
    separatorGap: 8,
    style: {
      color: "#525252",
      backgroundColor: "#fafafa",
      borderColor: "#d4d4d4",
    },
  }}
/>

// Custom formatters
<Canvas
  toolbarConfig={{
    coordinatesFormat: (x, y) => `X: ${x} Y: ${y}`,
    scaleFormat: (s) => `${(s * 100).toFixed(0)}%`,
    separator: "•",
    separatorGap: 12,
  }}
/>

// Custom position using style
<Canvas
  toolbarConfig={{
    style: {
      top: "50%",
      left: "20px",
      transform: "translateY(-50%)",
    },
  }}
/>

// Hide toolbar
<Canvas toolbarConfig={{ hidden: true }} />
```

### Navbar Customization

The navbar provides navigation buttons to jump between canvas sections. You can customize its position, display mode, button styling, and tooltips using the `navbarConfig` prop.

```tsx
<Canvas
  homeCoordinates={homeCoordinates}
  navItems={navItems}
  navbarConfig={{
    position: "top",
    display: "icons-labels",
  }}
>
  {/* ... */}
</Canvas>
```

**NavbarConfig options:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `hidden` | `boolean` | `false` | Hide the navbar entirely |
| `display` | `'icons' \| 'labels' \| 'icons-labels' \| 'compact'` | `'icons'` | Display mode for items |
| `position` | `'top' \| 'bottom' \| 'left' \| 'right'` | `'bottom'` | Navbar position |
| `className` | `string` | - | Additional CSS classes for container |
| `style` | `CSSProperties` | - | Inline styles for container |
| `buttonConfig` | `NavbarButtonConfig` | - | Button styling options (see below) |
| `tooltipConfig` | `NavbarTooltipConfig` | - | Tooltip options (see below) |
| `gap` | `number` | `4` | Gap between buttons in pixels |
| `padding` | `number` | `4` | Padding inside navbar in pixels |

**NavbarButtonConfig options:**

| Prop | Type | Description |
|------|------|-------------|
| `className` | `string` | Additional classes for all buttons |
| `style` | `CSSProperties` | Inline styles for all buttons |
| `activeClassName` | `string` | Classes for active/pushed state |
| `activeStyle` | `CSSProperties` | Styles for active state |
| `hoverClassName` | `string` | Classes for hover state |
| `hoverStyle` | `CSSProperties` | Styles for hover state |
| `iconClassName` | `string` | Classes for icons |
| `iconSize` | `number` | Icon size in pixels (default: 20) |
| `labelClassName` | `string` | Classes for labels |
| `labelStyle` | `CSSProperties` | Styles for labels |

**NavbarTooltipConfig options:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `disabled` | `boolean` | `false` | Disable tooltips entirely |
| `className` | `string` | - | Additional classes for tooltip |
| `style` | `CSSProperties` | - | Inline styles for tooltip |
| `delay` | `number` | `100` | Delay before showing tooltip (ms) |

#### Display Modes

- **`icons`** (default): Shows icons only, expands to show label when active, tooltip on hover
- **`labels`**: Shows labels only, no icons
- **`icons-labels`**: Always shows both icon and label for all items
- **`compact`**: Icons only, no expansion on active, just highlights

#### Navbar Examples

```tsx
// Position at top
<Canvas navbarConfig={{ position: "top" }} />

// Labels only (no icons)
<Canvas navbarConfig={{ display: "labels" }} />

// Always show icons + labels
<Canvas navbarConfig={{ display: "icons-labels" }} />

// Compact mode (icons only, no expansion)
<Canvas navbarConfig={{ display: "compact" }} />

// Custom container styling
<Canvas
  navbarConfig={{
    className: "bg-black/80 backdrop-blur-md",
    style: { borderRadius: "20px" },
  }}
/>

// Custom button styling
<Canvas
  navbarConfig={{
    buttonConfig: {
      activeClassName: "bg-blue-500",
      activeStyle: { color: "white" },
      hoverClassName: "bg-gray-100",
      iconSize: 24,
    },
  }}
/>

// Disable tooltips
<Canvas navbarConfig={{ tooltipConfig: { disabled: true } }} />

// Vertical sidebar layout
<Canvas navbarConfig={{ position: "left" }} />

// Hide navbar entirely
<Canvas navbarConfig={{ hidden: true }} />
```

### Exported Constants

The library exports default gradient values you can use as a starting point:

```tsx
import {
  DEFAULT_CANVAS_GRADIENT,    // Default canvas background gradient
  DEFAULT_INTRO_GRADIENT,     // Default intro background gradient
  DEFAULT_CANVAS_BOX_GRADIENT, // Default blur mask gradient
  FADE_TRANSITION,            // Default scene fade-in transition
  STAGE2_TRANSITION,          // Default pan-to-home transition
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

### Types
- `ToolbarConfig` - Toolbar customization options
- `ToolbarPosition` - Preset toolbar positions
- `ToolbarDisplayMode` - Toolbar display modes
- `NavbarConfig` - Navbar customization options
- `NavbarPosition` - Preset navbar positions
- `NavbarDisplayMode` - Navbar display modes
- `NavbarButtonConfig` - Navbar button styling options
- `NavbarTooltipConfig` - Navbar tooltip options
- `NavItem` - Navigation item configuration
- `SectionCoordinates` - Section coordinate definition

## API Reference

### Canvas Props

The `Canvas` component accepts the following props:

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `homeCoordinates` | `SectionCoordinates` | Yes | - | Initial viewport position and home section |
| `children` | `ReactNode` | Yes | - | Canvas content (typically `CanvasComponent` elements) |
| `canvasWidth` | `number` | No | `6000` | Total canvas width in pixels |
| `canvasHeight` | `number` | No | `4000` | Total canvas height in pixels |
| `navItems` | `NavItem[]` | No | - | Navigation items for navbar |
| `skipIntro` | `boolean` | No | `false` | Skip all intro animations (starts at home position) |
| `introContent` | `ReactNode` | No | - | Custom intro content during loading |
| `loadingText` | `string` | No | - | Custom loading text |
| `introBackgroundGradient` | `string` | No | - | Background gradient for intro |
| `canvasBoxGradient` | `string` | No | - | Canvas box gradient during intro |
| `growTransition` | `Transition` | No | - | Custom grow transition (Framer Motion) |
| `blurTransition` | `Transition` | No | - | Custom blur transition (Framer Motion) |
| `panTransition` | `Transition` | No | - | Custom pan-to-home transition (Framer Motion) |
| `fadeTransition` | `Transition` | No | - | Custom scene fade-in transition (Framer Motion) |
| `canvasBackground` | `ReactNode` | No | `<DefaultCanvasBackground />` | Custom canvas background |
| `wrapperBackground` | `ReactNode` | No | - | Custom wrapper/intro background |
| `toolbarConfig` | `ToolbarConfig` | No | - | Toolbar customization options |
| `navbarConfig` | `NavbarConfig` | No | - | Navbar customization options |

### NavItem Props

Each item in the `navItems` array has the following properties:

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for this section |
| `label` | `string` | Yes | Display label shown in the navbar |
| `icon` | `string \| React.ComponentType` | Yes | Lucide icon name or custom component |
| `x` | `number` | Yes | X coordinate on the canvas |
| `y` | `number` | Yes | Y coordinate on the canvas |
| `width` | `number` | Yes | Section viewport width |
| `height` | `number` | Yes | Section viewport height |
| `isHome` | `boolean` | No | If true, clicking triggers reset/home behavior |

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
