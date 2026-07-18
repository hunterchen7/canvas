import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "tailwindcss";

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
      plugins: [
        tailwindcss({
          content: [
            path.join(fixtureRoot, "**/*.{html,ts,tsx}"),
            path.join(libraryRoot, "src/**/*.{ts,tsx}"),
          ],
          theme: {
            extend: {
              colors: {
                border: "hsl(var(--canvas-border-light))",
                "canvas-heavy": "var(--canvas-heavy)",
                "canvas-light": "var(--canvas-light)",
                "canvas-offwhite": "var(--canvas-offwhite)",
              },
              fontFamily: {
                "canvas-figtree": ["Arial", "sans-serif"],
              },
            },
          },
        }),
      ],
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
