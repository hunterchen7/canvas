import { readFileSync } from "node:fs";
import path from "node:path";
import type { AcceptedPlugin } from "postcss";
import type { Plugin } from "vite";
import tailwindcss3 from "tailwindcss-v3";
import tailwindcss4 from "@tailwindcss/postcss";

/**
 * Compiles a benchmark fixture with the Tailwind major of the library
 * worktree under test.
 *
 * The parity and runtime harnesses render a reference worktree and a
 * candidate worktree through the same fixture. A worktree still on Tailwind
 * v3 uses class names v4 removed (`flex-shrink-0`) or re-scaled (`rounded-sm`),
 * so both must be compiled with the Tailwind they were written for. The
 * fixture stylesheet marks where Tailwind is injected with
 * `@canvas-tailwind-target;` and this plugin replaces it per target:
 *
 * - v3: the `@tailwind` directives, with the fixture theme passed to the v3
 *   PostCSS plugin (the `tailwindcss-v3` alias package).
 * - v4: the library's own `src/styles.css` inlined (theme, preflight compat
 *   rules) with its `source()` pointed at the worktree, followed by `@source`
 *   entries and the fixture theme as `@theme`. The v3 mode never loads the
 *   library's `tailwind.config.ts`, so fixture themes must override any
 *   library theme value that differs from Tailwind's defaults and that the
 *   library source uses (currently the `rounded-*` radii).
 *
 * Reference worktrees have no `node_modules`, which is why the library
 * stylesheet is inlined rather than `@import`ed: `@import "tailwindcss"` must
 * resolve from this repository.
 */

export type TailwindMajor = 3 | 4;

export const TAILWIND_TARGET_MARKER = "@canvas-tailwind-target;";

export interface TailwindTargetTheme {
  colors: Record<string, string | Record<string, string>>;
  fontFamily?: Record<string, string[]>;
  borderRadius?: Record<string, string>;
}

export interface TailwindTargetOptions {
  /** Library worktree; its package manifest decides the Tailwind major. */
  libraryRoot: string;
  /** Absolute path of the fixture stylesheet containing the marker. */
  stylesheet: string;
  /** Directories scanned for utilities in addition to the library `src`. */
  sources: string[];
  /** Theme additions for the fixture, applied to both majors. */
  theme: TailwindTargetTheme;
}

export function detectTailwindMajor(libraryRoot: string): TailwindMajor {
  const manifest = JSON.parse(
    readFileSync(path.join(libraryRoot, "package.json"), "utf8"),
  );
  const range =
    manifest.devDependencies?.tailwindcss ?? manifest.dependencies?.tailwindcss;
  const major = Number(/(\d+)\./.exec(String(range ?? ""))?.[1]);
  if (major === 3 || major === 4) return major;
  throw new Error(
    `Cannot determine the Tailwind major for ${libraryRoot} (tailwindcss: ${range})`,
  );
}

function posix(filename: string): string {
  return filename.split(path.sep).join("/");
}

function themeToV4(theme: TailwindTargetTheme): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(theme.colors)) {
    if (typeof value === "string") {
      lines.push(`  --color-${name}: ${value};`);
    } else {
      for (const [shade, shadeValue] of Object.entries(value)) {
        lines.push(`  --color-${name}-${shade}: ${shadeValue};`);
      }
    }
  }
  for (const [name, stack] of Object.entries(theme.fontFamily ?? {})) {
    lines.push(`  --font-${name}: ${stack.join(", ")};`);
  }
  for (const [name, value] of Object.entries(theme.borderRadius ?? {})) {
    lines.push(`  --radius-${name}: ${value};`);
  }
  return `@theme {\n${lines.join("\n")}\n}`;
}

function libraryStylesheetForV4(libraryRoot: string): string {
  const stylesheet = path.join(libraryRoot, "src/styles.css");
  const css = readFileSync(stylesheet, "utf8");
  const importPattern = /@import\s+["']tailwindcss["'][^;]*;/;
  if (!importPattern.test(css)) {
    throw new Error(`${stylesheet} has no \`@import "tailwindcss"\` to retarget.`);
  }
  const source = posix(path.join(libraryRoot, "src"));
  return css.replace(
    importPattern,
    `@import "tailwindcss" source(${JSON.stringify(source)});`,
  );
}

export function tailwindTarget(options: TailwindTargetOptions): {
  major: TailwindMajor;
  plugin: Plugin;
  postcssPlugins: AcceptedPlugin[];
} {
  const { libraryRoot, stylesheet, sources, theme } = options;
  const major = detectTailwindMajor(libraryRoot);

  const replacement =
    major === 3
      ? "@tailwind base;\n@tailwind components;\n@tailwind utilities;"
      : [
          libraryStylesheetForV4(libraryRoot),
          ...sources.map(
            (directory) => `@source ${JSON.stringify(posix(directory))};`,
          ),
          themeToV4(theme),
        ].join("\n");

  const postcssPlugins: AcceptedPlugin[] =
    major === 3
      ? [
          tailwindcss3({
            content: [
              ...sources.map((directory) =>
                path.join(directory, "**/*.{html,ts,tsx}"),
              ),
              path.join(libraryRoot, "src/**/*.{ts,tsx}"),
            ],
            theme: { extend: theme },
          }) as AcceptedPlugin,
        ]
      : [tailwindcss4() as AcceptedPlugin];

  const plugin: Plugin = {
    name: "canvas-tailwind-target",
    enforce: "pre",
    transform(code, id) {
      if (id.split("?")[0] !== stylesheet) return null;
      if (!code.includes(TAILWIND_TARGET_MARKER)) {
        throw new Error(
          `${stylesheet} must contain the ${TAILWIND_TARGET_MARKER} marker.`,
        );
      }
      return { code: code.replace(TAILWIND_TARGET_MARKER, replacement), map: null };
    },
  };

  return { major, plugin, postcssPlugins };
}
