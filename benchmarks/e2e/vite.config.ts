import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tailwindTarget } from "../tailwind-target.ts";

const e2eRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(e2eRoot, "../..");
const fixtureRoot = path.join(e2eRoot, "fixture");
const libraryRoot = path.resolve(
  process.env.CANVAS_LIBRARY_ROOT || repositoryRoot,
);
const serverId = process.env.CANVAS_E2E_SERVER_ID || "local";
const libraryIdentity = JSON.parse(
  process.env.CANVAS_LIBRARY_IDENTITY_JSON || "null",
);
const tailwind = tailwindTarget({
  libraryRoot,
  stylesheet: path.join(fixtureRoot, "styles.css"),
  sources: [fixtureRoot],
  theme: {
    colors: {
      border: "hsl(var(--canvas-border-light))",
      "canvas-heavy": "var(--canvas-heavy)",
      "canvas-light": "var(--canvas-light)",
      "canvas-offwhite": "var(--canvas-offwhite)",
      // Tailwind v3 values for the palette shades the fixture uses, so a v4
      // target (oklch palette) renders them identically to a v3 target.
      white: "#fff",
      zinc: {
        50: "#fafafa",
        100: "#f4f4f5",
        200: "#e4e4e7",
        300: "#d4d4d8",
        500: "#71717a",
        600: "#52525b",
        800: "#27272a",
        900: "#18181b",
      },
      orange: { 50: "#fff7ed", 300: "#fdba74" },
      emerald: { 50: "#ecfdf5", 950: "#022c22" },
    },
    fontFamily: {
      "canvas-figtree": ["Arial", "sans-serif"],
    },
    // Tailwind defaults, so a v4 target does not carry the library's
    // `--radius`-based overrides that the v3 target never loads.
    borderRadius: { sm: "0.125rem", md: "0.375rem", lg: "0.5rem" },
  },
});
const virtualLibraryIdentityId = "virtual:canvas-library-identity";
const resolvedVirtualLibraryIdentityId = `\0${virtualLibraryIdentityId}`;

export default defineConfig({
  root: fixtureRoot,
  publicDir: path.join(fixtureRoot, "public"),
  cacheDir: path.join(os.tmpdir(), `canvas-e2e-vite-${serverId}`),
  esbuild: {
    jsx: "automatic",
  },
  plugins: [
    tailwind.plugin,
    {
      name: "canvas-library-identity",
      resolveId(source) {
        return source === virtualLibraryIdentityId
          ? resolvedVirtualLibraryIdentityId
          : null;
      },
      load(id) {
        return id === resolvedVirtualLibraryIdentityId
          ? `export default ${JSON.stringify(libraryIdentity)};`
          : null;
      },
    },
  ],
  resolve: {
    alias: {
      "@canvas-source": path.join(libraryRoot, "src/index.ts"),
      // Reference worktrees intentionally do not need their own node_modules.
      // Resolve the library's runtime dependencies from the benchmark worktree
      // so a clean historical checkout can be compared directly.
      clsx: path.join(repositoryRoot, "node_modules/clsx"),
      "lucide-react": path.join(repositoryRoot, "node_modules/lucide-react"),
      "tailwind-merge": path.join(repositoryRoot, "node_modules/tailwind-merge"),
    },
    dedupe: ["react", "react-dom", "framer-motion"],
  },
  css: {
    postcss: {
      plugins: tailwind.postcssPlugins,
    },
  },
  server: {
    host: "127.0.0.1",
    fs: {
      allow: [repositoryRoot, libraryRoot],
    },
  },
  build: {
    outDir: path.join(os.tmpdir(), `canvas-e2e-build-${serverId}`),
    emptyOutDir: true,
  },
});
