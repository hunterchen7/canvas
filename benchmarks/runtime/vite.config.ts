import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
import tailwindcss from "tailwindcss";
import { resolveLibraryTarget } from "./scripts/library-target.mjs";

const runtimeRoot = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = path.resolve(runtimeRoot, "../..");
const productionBuildDirectory = process.env.CANVAS_BENCHMARK_BUILD_OUT_DIR;
const productionSourceMaps =
  process.env.CANVAS_BENCHMARK_BUILD_SOURCEMAP === "true";
const productionReactProfiling =
  process.env.CANVAS_BENCHMARK_REACT_PROFILING === "true";
const virtualLibraryId = "virtual:canvas-benchmark-target";
const resolvedVirtualLibraryId = `\0${virtualLibraryId}`;
const benchmarkOwnedPackages = [
  "react",
  "react-dom",
  "framer-motion",
  "clsx",
  "lucide-react",
  "tailwind-merge",
];
const benchmarkOptimizedEntries = [
  ...benchmarkOwnedPackages,
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom/client",
];
const library = await resolveLibraryTarget({
  repositoryRoot,
  libraryRoot: process.env.CANVAS_BENCHMARK_LIBRARY_ROOT,
  libraryLabel: process.env.CANVAS_BENCHMARK_LIBRARY_LABEL,
});
const dependencyAliases = [
  ...(productionReactProfiling
    ? [
        {
          find: /^react-dom\/client$/,
          replacement: path.join(
            repositoryRoot,
            "node_modules/react-dom/profiling.js",
          ),
        },
      ]
    : []),
  ...benchmarkOwnedPackages.map((packageName) => ({
    find: new RegExp(`^${packageName}(?=/|$)`),
    replacement: path.join(repositoryRoot, "node_modules", packageName),
  })),
];

export default defineConfig({
  root: runtimeRoot,
  cacheDir: process.env.CANVAS_BENCHMARK_VITE_CACHE_DIR || undefined,
  plugins: [
    {
      name: "canvas-benchmark-library-target",
      enforce: "pre",
      resolveId(id) {
        return id === virtualLibraryId ? resolvedVirtualLibraryId : null;
      },
      load(id) {
        if (id !== resolvedVirtualLibraryId) return null;
        return [
          `export * from ${JSON.stringify(library.sourceEntry)};`,
          `export const benchmarkLibraryIdentity = Object.freeze(${JSON.stringify(library.identity)});`,
        ].join("\n");
      },
    },
  ],
  resolve: {
    alias: dependencyAliases,
    dedupe: benchmarkOwnedPackages,
  },
  optimizeDeps: {
    include: benchmarkOptimizedEntries,
    noDiscovery: true,
  },
  esbuild: {
    jsx: "automatic",
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          content: [
            path.join(library.sourceDirectory, "**/*.{ts,tsx}"),
            path.join(runtimeRoot, "src/**/*.{ts,tsx}"),
          ],
          theme: {
            extend: {
              colors: {
                border: "hsl(var(--border))",
                "canvas-heavy": "var(--canvas-heavy)",
                "canvas-light": "var(--canvas-light)",
                "canvas-offwhite": "var(--canvas-offwhite)",
              },
            },
          },
        }),
      ],
    },
  },
  server: {
    fs: {
      allow: [...new Set([repositoryRoot, library.root])],
    },
  },
  build: {
    outDir: productionBuildDirectory || path.join(runtimeRoot, "dist"),
    emptyOutDir: true,
    sourcemap: productionSourceMaps,
  },
});
