import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "esm",
    sourcemap: true,
    // Preserve module structure for tree-shaking
    preserveModules: true,
    preserveModulesRoot: "src",
  },
  external: [
    // Peer dependencies - don't bundle these
    "react",
    "react-dom",
    "react/jsx-runtime",
    "framer-motion",
    // Dependencies that consumers should install
    "clsx",
    "lucide-react",
    "tailwind-merge",
  ],
  resolve: {
    alias: {
      "~": "./src",
    },
  },
});
