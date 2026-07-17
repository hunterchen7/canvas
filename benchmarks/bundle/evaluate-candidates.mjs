#!/usr/bin/env node

import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, "../..");
const DIST_DIR = path.join(REPOSITORY_ROOT, "dist");
const BASELINE = JSON.parse(
  readFileSync(path.join(SCRIPT_DIR, "baseline.json"), "utf8"),
);

const PEERS = ["framer-motion", "react", "react-dom"];
const MODES = ["externalPeers", "bundled"];
const ROOT_ENTRIES = {
  Canvas: 'export { Canvas as benchmark } from "@hunterchen/canvas";',
  CanvasComponent:
    'export { CanvasComponent as benchmark } from "@hunterchen/canvas";',
  Navbar:
    'export { CanvasNavbar as benchmark } from "@hunterchen/canvas";',
  Draggable: 'export { Draggable as benchmark } from "@hunterchen/canvas";',
  isIOS: 'export { isIOS as benchmark } from "@hunterchen/canvas";',
  getDistance:
    'export { getDistance as benchmark } from "@hunterchen/canvas";',
  cn: 'export { cn as benchmark } from "@hunterchen/canvas";',
};

const DIRECT_ENTRIES = {
  Canvas: directDefault("components/canvas/canvas.js"),
  CanvasComponent: directNamed(
    "components/canvas/component.js",
    "CanvasComponent",
  ),
  Navbar: directDefault("components/canvas/navbar/index.js"),
  Draggable: directNamed("components/canvas/draggable.js", "Draggable"),
  isIOS: directNamed("utils/performance.js", "isIOS"),
  getDistance: directNamed("lib/canvas.js", "getDistance"),
  cn: directNamed("lib/utils.js", "cn"),
};

const LUCIDE_IMPORT = 'import * as LucideIcons from "lucide-react";';
const LUCIDE_RESOLUTION =
  'const IconComponent = typeof icon === "string" ? LucideIcons[icon] : icon;';
const ICON_VALIDATION =
  'if (showIcon && !IconComponent) throw new Error("A valid \'icon\' prop is required (Lucide icon name or custom icon component).");';

function directDefault(relativePath) {
  return `export { default as benchmark } from ${JSON.stringify(path.join(DIST_DIR, relativePath))};`;
}

function directNamed(relativePath, exportName) {
  return `export { ${exportName} as benchmark } from ${JSON.stringify(path.join(DIST_DIR, relativePath))};`;
}

function isPeerImport(specifier) {
  return PEERS.some(
    (packageName) =>
      specifier === packageName || specifier.startsWith(`${packageName}/`),
  );
}

function isPackageJavaScript(moduleId) {
  const relative = path.relative(DIST_DIR, moduleId);
  return (
    relative !== "" &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative) &&
    moduleId.endsWith(".js")
  );
}

function byteMetrics(chunks) {
  return chunks.reduce(
    (metrics, chunk) => {
      const buffer = Buffer.from(chunk.code);
      metrics.raw += buffer.byteLength;
      metrics.gzip += gzipSync(buffer, { level: 9 }).byteLength;
      metrics.brotli += brotliCompressSync(buffer, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
        },
      }).byteLength;
      return metrics;
    },
    { raw: 0, gzip: 0, brotli: 0 },
  );
}

function packageName(moduleId) {
  const normalized = moduleId.replaceAll("\\", "/");
  const marker = "/node_modules/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex === -1) return undefined;
  const segments = normalized.slice(markerIndex + marker.length).split("/");
  return segments[0]?.startsWith("@")
    ? `${segments[0]}/${segments[1]}`
    : segments[0];
}

function moduleMetrics(chunks) {
  const moduleIds = new Set(
    chunks.flatMap((chunk) => Object.keys(chunk.modules)),
  );
  const packages = {};
  for (const moduleId of moduleIds) {
    const dependency = packageName(moduleId);
    if (dependency) packages[dependency] = (packages[dependency] ?? 0) + 1;
  }
  return {
    total: moduleIds.size,
    lucide: packages["lucide-react"] ?? 0,
  };
}

function partitionDelivery(chunks) {
  const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const initialNames = new Set(
    chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName),
  );
  const pending = [...initialNames];
  while (pending.length > 0) {
    const chunk = byFileName.get(pending.pop());
    if (!chunk) continue;
    for (const importedFileName of chunk.imports) {
      if (byFileName.has(importedFileName) && !initialNames.has(importedFileName)) {
        initialNames.add(importedFileName);
        pending.push(importedFileName);
      }
    }
  }
  return {
    initial: chunks.filter((chunk) => initialNames.has(chunk.fileName)),
    async: chunks.filter((chunk) => !initialNames.has(chunk.fileName)),
  };
}

function iconTransform(mode) {
  if (mode === "current") return undefined;
  return {
    name: `candidate-icons-${mode}`,
    transform(code, moduleId) {
      if (!moduleId.endsWith("/components/canvas/navbar/single-button.js")) {
        return undefined;
      }
      if (!code.includes(LUCIDE_IMPORT) || !code.includes(LUCIDE_RESOLUTION)) {
        throw new Error("The Lucide prototype transform no longer matches dist.");
      }

      if (mode === "component-only") {
        return code
          .replace(`${LUCIDE_IMPORT}\n`, "")
          .replace(LUCIDE_RESOLUTION, "const IconComponent = icon;");
      }

      const dynamicResolution = `const [LegacyIconComponent, setLegacyIconComponent] = useState();
\tuseEffect(() => {
\t\tlet cancelled = false;
\t\tif (typeof icon === "string") void import("lucide-react").then((icons) => {
\t\t\tif (!cancelled) setLegacyIconComponent(() => icons[icon]);
\t\t});
\t\treturn () => { cancelled = true; };
\t}, [icon]);
\tconst IconComponent = typeof icon === "string" ? LegacyIconComponent : icon;`;
      return code
        .replace(`${LUCIDE_IMPORT}\n`, "")
        .replace(LUCIDE_RESOLUTION, dynamicResolution)
        .replace(
          ICON_VALIDATION,
          `${ICON_VALIDATION.slice(0, ICON_VALIDATION.indexOf("!IconComponent"))}!IconComponent && typeof icon !== "string") throw new Error("A valid 'icon' prop is required (Lucide icon name or custom icon component).");`,
        );
    },
  };
}

function packageSideEffectsTransform(enabled) {
  if (!enabled) return undefined;
  return {
    name: "candidate-package-side-effects",
    transform(code, moduleId) {
      if (!isPackageJavaScript(moduleId)) return undefined;
      return {
        code,
        moduleSideEffects: false,
      };
    },
  };
}

function typeOnlyReactTransform(enabled) {
  if (!enabled) return undefined;
  const affectedModules = [
    "/components/canvas/backgrounds.js",
    "/components/canvas/canvas.js",
    "/components/canvas/draggable.js",
    "/contexts/PerformanceContext.js",
  ];
  return {
    name: "candidate-type-only-react-imports",
    transform(code, moduleId) {
      if (!affectedModules.some((suffix) => moduleId.endsWith(suffix))) {
        return undefined;
      }
      return code
        .replace('import React from "react";\n', "")
        .replace('import React, {', 'import {');
    },
  };
}

async function build(entrySource, options = {}) {
  const virtualId = "\0canvas-candidate-entry";
  const plugins = [
    {
      name: "candidate-entry",
      resolveId(specifier) {
        return specifier === "canvas:candidate" ? virtualId : undefined;
      },
      load(moduleId) {
        return moduleId === virtualId ? entrySource : undefined;
      },
    },
    iconTransform(options.iconMode ?? "current"),
    packageSideEffectsTransform(options.sideEffectsFree),
    typeOnlyReactTransform(options.typeOnlyCleanup),
  ].filter(Boolean);

  const bundle = await rolldown({
    input: "canvas:candidate",
    external: options.mode === "bundled" ? undefined : isPeerImport,
    plugins,
  });

  try {
    const generated = await bundle.generate({
      chunkFileNames: "chunks/[name]-[hash].js",
      entryFileNames: "candidate.js",
      format: "esm",
      minify: true,
      sourcemap: false,
    });
    const chunks = generated.output.filter((output) => output.type === "chunk");
    const delivery = partitionDelivery(chunks);
    return {
      bytes: byteMetrics(chunks),
      initial: byteMetrics(delivery.initial),
      async: byteMetrics(delivery.async),
      chunks: chunks.length,
      modules: moduleMetrics(chunks),
    };
  } finally {
    await bundle.close();
  }
}

function baselineMeasurement(fixtureName, mode) {
  const measurement = BASELINE.bundles[fixtureName][mode];
  return {
    bytes: measurement.bytes,
    initial: measurement.delivery.initial.bytes,
    async: measurement.delivery.async.bytes,
    chunks: measurement.chunks,
    modules: {
      total: measurement.modules.total,
      lucide: measurement.modules.byPackage["lucide-react"] ?? 0,
    },
  };
}

function percentageDelta(current, baseline) {
  if (baseline === 0) return current === 0 ? "0.0%" : "+new";
  const delta = ((current - baseline) / baseline) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

function printRow(mode, label, current, baseline) {
  console.log(
    [
      mode.padEnd(13),
      label.padEnd(35),
      String(current.bytes.gzip).padStart(9),
      percentageDelta(current.bytes.gzip, baseline.bytes.gzip).padStart(8),
      String(current.initial.gzip).padStart(9),
      String(current.async.gzip).padStart(9),
      String(current.modules.total).padStart(8),
      String(current.modules.lucide).padStart(7),
      String(current.chunks).padStart(6),
    ].join(" "),
  );
}

console.log(
  "Mode          Candidate                              Gzip    Delta  InitGzip AsyncGzip  Modules Lucide Chunks",
);
console.log("-".repeat(114));

for (const mode of MODES) {
  for (const [fixtureName, entrySource] of Object.entries(ROOT_ENTRIES)) {
    const baseline = baselineMeasurement(fixtureName, mode);
    printRow(
      mode,
      `sideEffects metadata / ${fixtureName}`,
      await build(entrySource, { mode, sideEffectsFree: true }),
      baseline,
    );
  }

  for (const [fixtureName, entrySource] of Object.entries(DIRECT_ENTRIES)) {
    const baseline = baselineMeasurement(fixtureName, mode);
    printRow(
      mode,
      `direct subpath / ${fixtureName}`,
      await build(entrySource, { mode }),
      baseline,
    );
  }

  for (const [fixtureName, entrySource] of Object.entries(ROOT_ENTRIES)) {
    const baseline = baselineMeasurement(fixtureName, mode);
    printRow(
      mode,
      `type-only cleanup / ${fixtureName}`,
      await build(entrySource, { mode, typeOnlyCleanup: true }),
      baseline,
    );
  }

  for (const fixtureName of ["Canvas", "Navbar"]) {
    const baseline = baselineMeasurement(fixtureName, mode);
    printRow(
      mode,
      `component-only icons / ${fixtureName}`,
      await build(DIRECT_ENTRIES[fixtureName], {
        iconMode: "component-only",
        mode,
      }),
      baseline,
    );
    printRow(
      mode,
      `dynamic legacy icons / ${fixtureName}`,
      await build(DIRECT_ENTRIES[fixtureName], {
        iconMode: "dynamic-legacy",
        mode,
      }),
      baseline,
    );
  }
}
