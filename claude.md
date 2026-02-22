# @hunterchen/canvas - Claude Code Guidelines

## Project Overview

This is a React-based canvas library for creating pannable, zoomable, and interactive canvas experiences. Originally developed for the Hack Western 12 Website.

**Package:** `@hunterchen/canvas` (npm)
**Version:** 0.6.0
**License:** MIT

### Key Features
- Pan & zoom with touch, trackpad, and mouse support
- Draggable elements
- Customizable intro animations
- Configurable navbar and toolbar
- Performance-optimized with adaptive rendering
- Pre-compiled Tailwind CSS (no configuration needed for consumers)

## Tech Stack

- **React 19** with TypeScript
- **Framer Motion** for animations and gestures
- **Tailwind CSS** for styling (pre-compiled for distribution)
- **Lucide React** for icons
- **clsx + tailwind-merge** for class utilities

## Project Structure

```
src/
├── components/
│   └── canvas/
│       ├── canvas.tsx          # Main Canvas component (pan/zoom logic)
│       ├── wrapper.tsx         # Intro animation wrapper
│       ├── component.tsx       # CanvasComponent with viewport culling
│       ├── backgrounds.tsx     # Customizable background components
│       ├── toolbar.tsx         # Coordinates/scale display
│       ├── draggable.tsx       # Draggable elements
│       └── navbar/
│           ├── index.tsx       # Navigation bar
│           └── single-button.tsx
├── contexts/
│   ├── CanvasContext.tsx       # Canvas state (x, y, scale, animationStage)
│   └── PerformanceContext.tsx  # Device capability detection
├── hooks/
│   ├── useWindowDimensions.ts  # Window size tracking
│   └── usePerformanceMode.ts   # Performance optimization hook
├── lib/
│   ├── canvas.ts               # Pan/zoom utilities
│   ├── constants.ts            # All configurable constants
│   └── utils.ts                # cn() class merging utility
├── utils/
│   └── performance.ts          # Device detection (iOS, mobile, reduced motion)
├── types/
│   └── index.ts                # TypeScript interfaces
└── index.ts                    # Public exports
```

## Architecture Patterns

### Canvas Coordinate System
- Canvas dimensions default to 6000x4000 pixels
- Origin (0,0) is at top-left of canvas
- `x`, `y`, `scale` are Framer Motion `MotionValue`s for smooth animations
- Components position themselves using `offset` prop (x, y, width, height)

### Animation Stages
1. **Stage 0**: Initial - intro box grows from center
2. **Stage 1**: Grow complete - transitioning to home
3. **Stage 2**: Interactive - user can pan/zoom

### Performance Modes
- **high**: Full animations, all components rendered
- **medium**: Reduced animations, viewport culling active
- **low**: Minimal animations (iOS, reduced motion, small screens)

## Code Conventions

### File Organization
- Components in `components/canvas/`
- Contexts in `contexts/`
- Hooks in `hooks/`
- Utility functions in `lib/` or `utils/`
- Types in `types/`

### Naming Conventions
- Components: PascalCase (`CanvasComponent`, `DefaultCanvasBackground`)
- Hooks: camelCase with `use` prefix (`useWindowDimensions`, `usePerformanceMode`)
- Constants: SCREAMING_SNAKE_CASE (`MAX_ZOOM`, `DEFAULT_CANVAS_WIDTH`)
- CSS variables: `--canvas-*` prefix for theming
- Tailwind classes: `canvas-*` prefix for custom utilities

### TypeScript
- Strict mode enabled
- Export interfaces from `types/index.ts`
- Use `React.FC` for function components
- Use `forwardRef` for components that need ref forwarding

## Vercel React Best Practices

This project follows Vercel's React performance guidelines:

### Critical Patterns Applied

1. **Viewport Culling** (component.tsx:164-193)
   - Components outside viewport + hysteresis buffer are not rendered
   - Reduces unnecessary DOM nodes and re-renders

2. **Motion Value Subscriptions** (component.tsx:101-133)
   - Uses `requestAnimationFrame` batched updates
   - Prevents excessive re-renders during pan/zoom

3. **Memoization** (canvas.tsx:155-173, CanvasContext.tsx:46-52)
   - `useMemo` for expensive calculations (coordinates, dimensions)
   - `React.memo` for CanvasProvider

4. **Lazy State Initialization** (hooks)
   - `useState(() => ...)` pattern for expensive initial values

5. **Functional setState** (canvas.tsx:174-193)
   - Callbacks in effects don't depend on state variables

### Performance Hooks Pattern
```tsx
// Good: Using functional updates
const [scale, setScale] = useState(1);
const handleZoom = useCallback((delta: number) => {
  setScale(s => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, s * delta)));
}, []); // No dependencies needed
```

### Avoiding Waterfalls
```tsx
// Good: Parallel promises
const [config, data] = await Promise.all([
  fetchConfig(),
  fetchData()
]);
```

## Key Components

### Canvas (canvas.tsx)
Main orchestrating component handling:
- Pan/zoom gestures (pointer events, wheel)
- Animation stage management
- Coordinate transformations

**Props of note:**
- `homeCoordinates`: Required initial viewport position
- `navItems`: Optional navigation items
- `skipIntro`: Skip all intro animations (starts directly at home position)
- `growTransition`, `blurTransition`, `panTransition`, `fadeTransition`: Animation timing overrides
- `toolbarConfig`, `navbarConfig`: Customization objects

### CanvasComponent (component.tsx)
Renders content at specific canvas coordinates with:
- Viewport visibility optimization
- Hysteresis buffer to prevent flicker
- Image fallback for mobile during intro

### CanvasWrapper (wrapper.tsx)
Handles intro animation:
- Box grows from center to full screen
- Blur mask fades out
- Custom intro content support

## Constants Reference (lib/constants.ts)

| Constant | Default | Description |
|----------|---------|-------------|
| `DEFAULT_CANVAS_WIDTH` | 6000 | Canvas width in pixels |
| `DEFAULT_CANVAS_HEIGHT` | 4000 | Canvas height in pixels |
| `MAX_ZOOM` | 3 | Maximum zoom level |
| `ZOOM_BOUND` | 1.05 | Prevent zooming past edges |
| `VIEWPORT_HYSTERESIS_BUFFER` | 120 | Buffer for visibility detection |
| `FADE_TRANSITION` | `{ duration: 0.3, ease: "easeIn" }` | Scene fade-in transition |
| `STAGE2_TRANSITION` | `{ duration: 0.96, ease: [...] }` | Pan-to-home transition |

## Build & Development

```bash
# Install dependencies
npm install

# Build library (CSS + TypeScript)
npm run build

# Type checking only
npm run type-check

# Clean dist folder
npm run clean
```

### Build Process
1. `build:css` - Tailwind compiles `src/styles.css` to `dist/styles.css`
2. `build:ts` - TypeScript compiles to `dist/` with declarations

## Testing Changes

When making changes:
1. Run `npm run type-check` to verify TypeScript
2. Run `npm run build` to ensure compilation succeeds
3. Test in the `examples/demo` folder if available

## Common Tasks

### Adding a New Component
1. Create in `src/components/canvas/`
2. Export from `src/index.ts`
3. Add types to `src/types/index.ts` if needed

### Modifying Animation Timing
- Constants in `lib/constants.ts` (`GROW_TRANSITION`, `BLUR_TRANSITION`, etc.)
- Individual component props can override defaults

### Adding New CSS Variables
1. Add to `tailwind.config.ts` under `extend.colors`
2. Use `canvas-*` prefix for namespacing
3. Document in README.md customization section

## Performance Considerations

### Do
- Use `MotionValue` for frequently changing values (x, y, scale)
- Batch state updates with `requestAnimationFrame`
- Implement viewport culling for off-screen components
- Use `useMemo`/`useCallback` for expensive computations
- Check `animationStage >= 2` before allowing user interactions

### Don't
- Subscribe to motion values without batching
- Create new objects/functions in render without memoization
- Use `will-change: transform` permanently (memory issues on iOS)
- Block the main thread during intro animations

## Release Process

This project uses **release-please** for automated releases:
1. Commits to `main` trigger release-please workflow
2. Creates/updates release PR with changelog
3. Merging release PR triggers npm publish

## Exports Summary

### Components
`Canvas`, `CanvasComponent`, `CanvasWrapper`, `Draggable`, `DraggableImage`, `CanvasToolbar`, `CanvasNavbar`, `DefaultCanvasBackground`, `DefaultWrapperBackground`, `DefaultIntroContent`

### Contexts
`CanvasContext`, `CanvasProvider`, `useCanvasContext`, `PerformanceProvider`, `usePerformance`, `usePerformanceMode`

### Hooks
`useWindowDimensions`, `usePerformanceModeLegacy`

### Utilities
`cn`, `getSectionPanCoordinates`, `panToOffsetScene`, `getScreenSizeEnum`, `isIOS`, `isMobile`, `prefersReducedMotion`

### Constants
`DEFAULT_CANVAS_WIDTH`, `DEFAULT_CANVAS_HEIGHT`, `MAX_ZOOM`, `MIN_ZOOMS`, `canvasWidth`, `canvasHeight`, `DEFAULT_CANVAS_GRADIENT`, `DEFAULT_INTRO_GRADIENT`, `DEFAULT_CANVAS_BOX_GRADIENT`, `FADE_TRANSITION`, `STAGE2_TRANSITION`

### Types
`SectionCoordinates`, `NavItem`, `CanvasSection`, `ToolbarConfig`, `NavbarConfig`, `PerformanceMode`, `PerformanceConfig`
