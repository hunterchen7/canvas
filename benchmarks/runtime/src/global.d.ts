import type { BenchmarkPublicApi } from "./schema";

declare global {
  interface Window {
    __CANVAS_BENCHMARK__: BenchmarkPublicApi;
  }

  interface Performance {
    memory?: {
      usedJSHeapSize: number;
    };
  }

  interface Navigator {
    deviceMemory?: number;
  }
}

export {};
