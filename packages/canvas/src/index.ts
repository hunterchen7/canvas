// Components
export { default as Canvas, gradientBgImage } from './components/canvas/canvas';
export { CanvasComponent } from './components/canvas/component';
export { Draggable, DraggableImage } from './components/canvas/draggable';
export { CanvasWrapper, growTransition } from './components/canvas/wrapper';
export { default as CanvasCursor } from './components/canvas/cursor';
export { default as CanvasToolbar } from './components/canvas/toolbar';
export { default as CanvasNavbar } from './components/canvas/navbar';

// UI Components
export { Button } from './components/ui/button';
export { Label } from './components/ui/label';
export { default as FolderIcon } from './components/ui/FolderIcon';
export { Toaster } from './components/ui/toaster';
export { Toast, ToastAction, ToastClose, ToastTitle, ToastDescription, ToastViewport } from './components/ui/toast';

// Contexts
export { CanvasContext, CanvasProvider, useCanvasContext } from './contexts/CanvasContext';
export type { CanvasContextState } from './contexts/CanvasContext';
export { PerformanceProvider, usePerformanceMode, usePerformance } from './contexts/PerformanceContext';
export type { PerformanceMode, PerformanceConfig } from './contexts/PerformanceContext';

// Hooks
export { default as useWindowDimensions } from './hooks/useWindowDimensions';
export { usePerformanceMode as usePerformanceModeLegacy } from './hooks/usePerformanceMode';
export { useToast, toast } from './hooks/use-toast';

// Utilities
export * from './lib/canvas';
export * from './lib/constants';
export * from './utils/performance';
export { copyText } from './lib/copy';

// Types
export type { SectionCoordinates } from './types';
export { CanvasSection } from './types';
