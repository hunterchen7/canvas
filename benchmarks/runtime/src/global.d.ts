declare module "virtual:canvas-benchmark-target" {
  export const Canvas: typeof import("../../../src/index").Canvas;
  export const CanvasComponent: typeof import("../../../src/index").CanvasComponent;
  export const DefaultIntroContent: typeof import("../../../src/index").DefaultIntroContent;
  export const Draggable: typeof import("../../../src/index").Draggable;
  export const PerformanceProvider: typeof import("../../../src/index").PerformanceProvider;
  export const useCanvasContext: typeof import("../../../src/index").useCanvasContext;
  export const usePerformance: typeof import("../../../src/index").usePerformance;
  export type NavItem = import("../../../src/index").NavItem;
  export type SectionCoordinates = import("../../../src/index").SectionCoordinates;

  export interface CanvasBenchmarkLibraryIdentity {
    schemaVersion: string;
    label: string;
    package: {
      name: string;
      version: string | null;
    };
    root: string;
    sourceEntry: string;
    source: {
      algorithm: "sha256";
      hash: string;
      fileCount: number;
      bytes: number;
    };
    git: {
      available: boolean;
      worktreeRoot?: string;
      head: string | null;
      sourceTree: string | null;
      sourceDirty: boolean | null;
      sourceStatus: string[];
    };
    proof: string;
  }

  export const benchmarkLibraryIdentity: CanvasBenchmarkLibraryIdentity;
}

interface Window {
  __CANVAS_BENCHMARK__: import("./schema").BenchmarkPublicApi;
  __CANVAS_BENCHMARK_LIBRARY__: import("virtual:canvas-benchmark-target").CanvasBenchmarkLibraryIdentity;
}

interface Performance {
  memory?: {
    usedJSHeapSize: number;
  };
}

interface Navigator {
  deviceMemory?: number;
}
