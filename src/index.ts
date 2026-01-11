// Components
export { default as Canvas, gradientBgImage } from './components/canvas/canvas';
export { CanvasComponent } from './components/canvas/component';
export { Draggable, DraggableImage } from './components/canvas/draggable';
export { CanvasWrapper, growTransition } from './components/canvas/wrapper';
export { default as CanvasToolbar } from './components/canvas/toolbar';
export { default as CanvasNavbar } from './components/canvas/navbar';

// Contexts
export { CanvasContext, CanvasProvider, useCanvasContext } from './contexts/CanvasContext';
export type { CanvasContextState } from './contexts/CanvasContext';
export { PerformanceProvider, usePerformanceMode, usePerformance } from './contexts/PerformanceContext';
export type { PerformanceMode, PerformanceConfig } from './contexts/PerformanceContext';

// Hooks
export { default as useWindowDimensions } from './hooks/useWindowDimensions';
export { usePerformanceMode as usePerformanceModeLegacy } from './hooks/usePerformanceMode';

// Utilities
export * from './lib/canvas';
export * from './lib/constants';
export * from './utils/performance';

// Types
export type { SectionCoordinates } from './types';
export { CanvasSection } from './types';
