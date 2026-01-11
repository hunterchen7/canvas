# Canvas Demo - Setup Instructions

This project contains the interactive canvas component cloned from the [Hack Western 12 Website](https://github.com/hackwestern/hackwestern) (I built this so I didn't steal anything)

### 1. Core Canvas Components
Copy all files from `hackwestern/src/components/canvas/` to `canvas/src/components/canvas/`:
- `canvas.tsx` - Main canvas component with pan/zoom functionality
- `wrapper.tsx` - Animated wrapper for canvas initialization  ß
- `component.tsx` - Canvas component renderer with visibility optimization
- `draggable.tsx` - Draggable elements (images and generic)
- `toolbar.tsx` - Coordinate/zoom display toolbar
- `navbar/index.tsx` - Navigation buttons
- `navbar/single-button.tsx` - Individual nav button component
- `offest.tsx` - Offset positioning component
- `reset.tsx` - Reset view button

### 2. Context & State Management
Copy from `hackwestern/src/contexts/`:
- `CanvasContext.tsx` - Canvas state context provider

### 3. Utility Libraries
Copy from `hackwestern/src/lib/`:
- `canvas.ts` - Canvas utility functions (pan, zoom, coordinates)
- `utils.ts` - General utility functions (cn, etc.)
- `copy.ts` - Clipboard copy utility

### 4. Custom Hooks
Copy from `hackwestern/src/hooks/`:
- `useWindowDimensions.ts` - Window size tracking
- `usePerformanceMode.ts` - Performance optimization

### 5. Utils
Copy from `hackwestern/src/utils/`:
- `performance.ts` - Performance detection utilities

### 6. Constants
Copy from `hackwestern/src/constants/`:
- `canvas.ts` - Canvas section coordinates and enums

### 7. Assets (Public folder)
Copy from `hackwestern/public/` to `canvas/public/`:
- `horse.svg` - Logo
- `customcursor.svg` - Custom cursor
- `dragme.svg` - Drag indicator
- `hackwesterntitle.svg` - Title graphic

### 8. Styles
Copy from `hackwestern/src/`:
- Create `globals.css` with necessary CSS variables and styles

## Installation Steps

1. Navigate to the canvas folder:
```bash
cd /Users/hunterchen/Documents/GitHub/canvas
```

2. Install dependencies:
```bash
npm install
```

3. Copy all files listed above from hackwestern to canvas, maintaining the directory structure

4. Update import paths in all copied files:
   - Change `~/` to `@/`
   - Update any absolute imports to relative imports as needed

## Required Dependencies

Already included in package.json:
- `next` - Next.js framework
- `react` & `react-dom` - React library
- `framer-motion` - Animation library
- `lucide-react` - Icons

Additional dependencies you may need to install:
```bash
npm install @radix-ui/react-slot class-variance-authority clsx tailwindcss-merge
```

For toast functionality:
```bash
npm install @radix-ui/react-toast
```

## Tailwind CSS Setup

1. Install Tailwind:
```bash
npm install -D tailwindcss autoprefixer
npx tailwindcss init -p
```

2. Update `tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        beige: "var(--beige)",
        coral: "var(--coral)",
        lilac: "var(--lilac)",
        salmon: "var(--salmon)",
        heavy: "var(--heavy)",
        emphasis: "var(--emphasis)",
        medium: "var(--medium)",
        light: "var(--light)",
        offwhite: "var(--offwhite)",
        highlight: "var(--highlight)",
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'monospace'],
        'sans': ['Figtree', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

3. Create `src/styles/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --beige: #f7f1e5;
  --coral: #ffb5a7;
  --lilac: #d9c8e6;
  --salmon: #ffa585;
  --heavy: #3c204c;
  --emphasis: #513b7a;
  --medium: #776780;
  --light: #c3b8cb;
  --offwhite: #fdfcfd;
  --highlight: #f5f2f7;
}

body {
  margin: 0;
  padding: 0;
  font-family: 'Figtree', sans-serif;
}

.bg-hw-radial-gradient {
  /* Add any custom backgrounds */
}

.bg-noise {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='4' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
}
```

4. Import globals.css in `src/pages/_app.tsx`:
```typescript
import '@/styles/globals.css'
import type { AppProps } from 'next/app'

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
```

## Running the Project

1. Start the development server:
```bash
npm run dev
```

2. Open [http://localhost:3000](http://localhost:3000) in your browser

## Key Features

- **Pan & Zoom**: Click and drag to pan, pinch/scroll to zoom
- **Draggable Elements**: Drag the logo and other elements around
- **Performance Optimized**: Adaptive rendering based on device capabilities
- **Responsive**: Works on desktop and mobile (desktop recommended)

## Troubleshooting

If you encounter errors:

1. **Missing modules**: Install any missing dependencies with `npm install <package>`
2. **Import errors**: Update import paths to use `@/` alias
3. **Type errors**: Ensure TypeScript is properly configured
4. **Style issues**: Verify Tailwind CSS is configured and CSS variables are defined

## File Structure

```
canvas/
├── public/
│   ├── horse.svg
│   ├── customcursor.svg
│   ├── dragme.svg
│   └── hackwesterntitle.svg
├── src/
│   ├── components/
│   │   └── canvas/
│   │       ├── canvas.tsx
│   │       ├── wrapper.tsx
│   │       ├── component.tsx
│   │       ├── draggable.tsx
│   │       ├── toolbar.tsx
│   │       └── navbar/
│   ├── contexts/
│   │   └── CanvasContext.tsx
│   ├── hooks/
│   │   ├── useWindowDimensions.ts
│   │   ├── usePerformanceMode.ts
│   │   └── use-toast.ts
│   ├── lib/
│   │   ├── canvas.ts
│   │   ├── utils.ts
│   │   └── copy.ts
│   ├── constants/
│   │   └── canvas.ts
│   ├── pages/
│   │   ├── _app.tsx
│   │   └── index.tsx
│   └── styles/
│       └── globals.css
├── package.json
├── tsconfig.json
├── next.config.js
└── tailwind.config.js
```

## Notes

- The canvas uses framer-motion for animations
- Performance mode automatically adjusts based on device capabilities
- All coordinates and configurations are in `constants/canvas.ts`
- The canvas size is 6000x4000px with configurable sections
