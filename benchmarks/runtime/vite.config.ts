import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
import tailwindcss from "tailwindcss";

const runtimeRoot = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = path.resolve(runtimeRoot, "../..");

export default defineConfig({
  root: runtimeRoot,
  esbuild: {
    jsx: "automatic",
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          content: [
            path.join(repositoryRoot, "src/**/*.{ts,tsx}"),
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
      allow: [repositoryRoot],
    },
  },
  build: {
    outDir: path.join(runtimeRoot, "dist"),
    emptyOutDir: true,
  },
});
