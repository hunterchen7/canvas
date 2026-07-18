#!/usr/bin/env node

import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from "node:zlib";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, "../..");
const FIXTURE_DIR = path.join(SCRIPT_DIR, "fixtures");
const DIST_DIR = path.join(REPOSITORY_ROOT, "dist");

const FIXTURES = [
  ["Canvas", "canvas.mjs"],
  ["CanvasComponent", "canvas-component.mjs"],
  ["DefaultIntroContent", "default-intro-content.mjs"],
  ["Navbar", "navbar.mjs"],
  ["Draggable", "draggable.mjs"],
  ["isIOS", "is-ios.mjs"],
  ["getDistance", "get-distance.mjs"],
  ["cn", "cn.mjs"],
];

const PEER_PACKAGES = ["framer-motion", "react", "react-dom"];
const MODES = [
  ["externalPeers", isPeerImport],
  ["bundled", undefined],
];

function printUsage() {
  console.log(`Usage: node benchmarks/bundle/run.mjs [options]

Options:
  --baseline <file>                 Compare results with a JSON baseline
  --write-baseline <file>           Write current results as a JSON baseline
  --output <file>                   Write current results to a JSON file
  --byte-tolerance-percent <value>  Allowed byte growth (default: 0)
  --package-byte-tolerance-percent <value>
                                    Allowed npm package byte growth (default: byte tolerance)
  --module-tolerance <value>        Allowed module-count growth (default: 0)
  --file-tolerance <value>          Allowed package file-count growth (default: 0)
  --skip-build                      Reuse the existing dist directory
  --skip-pack                       Skip npm package-size measurement
  --help                            Show this help

The default run builds the library, bundles every fixture twice (with peer
dependencies external and fully bundled), measures CSS and npm package size,
then prints a compact table. Comparisons exit non-zero on regression.`);
}

function parseNumberOption(rawValue, optionName) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${optionName} requires a non-negative number.`);
  }
  return value;
}

function parseArguments(argv) {
  const options = {
    baseline: undefined,
    writeBaseline: undefined,
    output: undefined,
    byteTolerancePercent: 0,
    packageByteTolerancePercent: undefined,
    moduleTolerance: 0,
    fileTolerance: 0,
    skipBuild: false,
    skipPack: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      index += 1;
      return value;
    };

    switch (argument) {
      case "--baseline":
        options.baseline = nextValue();
        break;
      case "--write-baseline":
        options.writeBaseline = nextValue();
        break;
      case "--output":
        options.output = nextValue();
        break;
      case "--byte-tolerance-percent":
        options.byteTolerancePercent = parseNumberOption(
          nextValue(),
          argument,
        );
        break;
      case "--package-byte-tolerance-percent":
        options.packageByteTolerancePercent = parseNumberOption(
          nextValue(),
          argument,
        );
        break;
      case "--module-tolerance":
        options.moduleTolerance = parseNumberOption(nextValue(), argument);
        break;
      case "--file-tolerance":
        options.fileTolerance = parseNumberOption(nextValue(), argument);
        break;
      case "--skip-build":
        options.skipBuild = true;
        break;
      case "--skip-pack":
        options.skipPack = true;
        break;
      case "--help":
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  options.packageByteTolerancePercent ??= options.byteTolerancePercent;

  return options;
}

function runCommand(command, commandArguments, commandOptions = {}) {
  const result = spawnSync(command, commandArguments, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    ...commandOptions,
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(
      `${command} ${commandArguments.join(" ")} failed with exit code ${result.status}.\n${output}`,
    );
  }

  return result;
}

function buildLibrary() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  runCommand(npmCommand, ["run", "build"], { stdio: "inherit" });
}

function isPeerImport(specifier) {
  return PEER_PACKAGES.some(
    (packageName) =>
      specifier === packageName || specifier.startsWith(`${packageName}/`),
  );
}

function byteMetrics(buffers) {
  return buffers.reduce(
    (metrics, buffer) => {
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

function packageNameFromModuleId(moduleId) {
  const normalized = moduleId.replaceAll("\\", "/");
  const marker = "/node_modules/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex === -1) return undefined;

  const segments = normalized.slice(markerIndex + marker.length).split("/");
  if (segments[0]?.startsWith("@")) {
    return segments.length > 1 ? `${segments[0]}/${segments[1]}` : segments[0];
  }
  return segments[0];
}

function moduleMetrics(outputChunks) {
  const moduleIds = new Set();
  for (const chunk of outputChunks) {
    for (const moduleId of Object.keys(chunk.modules)) moduleIds.add(moduleId);
  }

  const byPackage = new Map();
  let workspace = 0;
  let dependencies = 0;

  for (const moduleId of moduleIds) {
    const packageName = packageNameFromModuleId(moduleId);
    if (packageName) {
      dependencies += 1;
      byPackage.set(packageName, (byPackage.get(packageName) ?? 0) + 1);
    } else {
      workspace += 1;
    }
  }

  return {
    total: moduleIds.size,
    workspace,
    dependencies,
    byPackage: Object.fromEntries(
      [...byPackage.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
}

function deliveryMetrics(outputChunks) {
  return {
    bytes: byteMetrics(outputChunks.map((chunk) => Buffer.from(chunk.code))),
    chunks: outputChunks.length,
    modules: moduleMetrics(outputChunks),
  };
}

function partitionInitialChunks(outputChunks) {
  const chunksByFileName = new Map(
    outputChunks.map((chunk) => [chunk.fileName, chunk]),
  );
  const initialFileNames = new Set(
    outputChunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName),
  );
  const pendingFileNames = [...initialFileNames];

  while (pendingFileNames.length > 0) {
    const fileName = pendingFileNames.pop();
    const chunk = chunksByFileName.get(fileName);
    if (!chunk) continue;

    for (const importedFileName of chunk.imports) {
      if (
        chunksByFileName.has(importedFileName) &&
        !initialFileNames.has(importedFileName)
      ) {
        initialFileNames.add(importedFileName);
        pendingFileNames.push(importedFileName);
      }
    }
  }

  return {
    initial: outputChunks.filter((chunk) => initialFileNames.has(chunk.fileName)),
    async: outputChunks.filter((chunk) => !initialFileNames.has(chunk.fileName)),
  };
}

async function measureBundle(fixturePath, external) {
  const bundle = await rolldown({
    input: fixturePath,
    external,
  });

  try {
    const generated = await bundle.generate({
      chunkFileNames: "chunks/[name]-[hash].js",
      entryFileNames: "[name].js",
      format: "esm",
      minify: true,
      sourcemap: false,
    });
    const outputChunks = generated.output.filter(
      (output) => output.type === "chunk",
    );
    const delivery = partitionInitialChunks(outputChunks);

    return {
      bytes: byteMetrics(outputChunks.map((chunk) => Buffer.from(chunk.code))),
      chunks: outputChunks.length,
      modules: moduleMetrics(outputChunks),
      delivery: {
        initial: deliveryMetrics(delivery.initial),
        async: deliveryMetrics(delivery.async),
      },
    };
  } finally {
    await bundle.close();
  }
}

async function measureFixtures() {
  const results = {};
  for (const [fixtureName, fixtureFile] of FIXTURES) {
    const modes = {};
    for (const [modeName, external] of MODES) {
      modes[modeName] = await measureBundle(
        path.join(FIXTURE_DIR, fixtureFile),
        external,
      );
    }
    results[fixtureName] = modes;
  }
  return results;
}

function measureStyles() {
  const stylesheetPath = path.join(DIST_DIR, "styles.css");
  if (!existsSync(stylesheetPath)) {
    throw new Error(`Missing built stylesheet: ${stylesheetPath}`);
  }
  return byteMetrics([readFileSync(stylesheetPath)]);
}

function measurePackage() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const npmCache = path.join(tmpdir(), "canvas-bundle-benchmark-npm-cache");
  mkdirSync(npmCache, { recursive: true });

  const result = runCommand(
    npmCommand,
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    {
      env: {
        ...process.env,
        npm_config_cache: npmCache,
      },
    },
  );
  const jsonStart = result.stdout.indexOf("[");
  if (jsonStart === -1) {
    throw new Error(`npm pack did not return JSON.\n${result.stdout}`);
  }
  const [packageResult] = JSON.parse(result.stdout.slice(jsonStart));
  if (!packageResult) throw new Error("npm pack returned no package result.");

  return {
    packedBytes: packageResult.size,
    unpackedBytes: packageResult.unpackedSize,
    files: packageResult.entryCount,
  };
}

function readRolldownVersion() {
  const packagePath = path.join(
    REPOSITORY_ROOT,
    "node_modules",
    "rolldown",
    "package.json",
  );
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  return packageJson.version;
}

function writeJson(targetPath, value) {
  const resolvedPath = path.resolve(REPOSITORY_ROOT, targetPath);
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${JSON.stringify(value, null, 2)}\n`);
  console.log(`Wrote ${path.relative(REPOSITORY_ROOT, resolvedPath)}`);
}

function readJson(targetPath) {
  const resolvedPath = path.resolve(REPOSITORY_ROOT, targetPath);
  return JSON.parse(readFileSync(resolvedPath, "utf8"));
}

function formatBytes(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function printResults(results) {
  const headings = [
    ["Fixture", 17],
    ["Mode", 14],
    ["Raw", 11],
    ["Gzip", 10],
    ["Brotli", 10],
    ["InitGzip", 10],
    ["AsyncGzip", 10],
    ["Modules", 8],
    ["Lucide", 7],
    ["Chunks", 6],
  ];
  const row = (values) =>
    values
      .map((value, index) => String(value).padEnd(headings[index][1]))
      .join(" ")
      .trimEnd();

  console.log(row(headings.map(([heading]) => heading)));
  console.log(row(headings.map(([, width]) => "-".repeat(width))));

  for (const [fixtureName, modes] of Object.entries(results.bundles)) {
    for (const [modeName, measurement] of Object.entries(modes)) {
      console.log(
        row([
          fixtureName,
          modeName,
          formatBytes(measurement.bytes.raw),
          formatBytes(measurement.bytes.gzip),
          formatBytes(measurement.bytes.brotli),
          formatBytes(measurement.delivery.initial.bytes.gzip),
          formatBytes(measurement.delivery.async.bytes.gzip),
          measurement.modules.total,
          measurement.modules.byPackage["lucide-react"] ?? 0,
          measurement.chunks,
        ]),
      );
    }
  }

  console.log(
    `\nCSS: ${formatBytes(results.assets.styles.raw)} raw / ${formatBytes(results.assets.styles.gzip)} gzip / ${formatBytes(results.assets.styles.brotli)} brotli`,
  );
  if (results.package) {
    console.log(
      `Package: ${formatBytes(results.package.packedBytes)} packed / ${formatBytes(results.package.unpackedBytes)} unpacked / ${results.package.files} files`,
    );
  }
}

function allowedByteValue(baseline, tolerancePercent) {
  return Math.floor(baseline * (1 + tolerancePercent / 100));
}

function compareMetric(regressions, label, current, baseline, allowed) {
  if (current > allowed) {
    regressions.push(
      `${label}: ${formatBytes(current)} > ${formatBytes(allowed)} allowed (baseline ${formatBytes(baseline)})`,
    );
  }
}

function compareByteMetrics(
  regressions,
  label,
  current,
  baseline,
  tolerancePercent,
) {
  for (const metric of ["raw", "gzip", "brotli"]) {
    compareMetric(
      regressions,
      `${label}.${metric}`,
      current[metric],
      baseline[metric],
      allowedByteValue(baseline[metric], tolerancePercent),
    );
  }
}

function compareModuleMetrics(
  regressions,
  label,
  current,
  baseline,
  moduleTolerance,
) {
  for (const metric of ["total", "workspace", "dependencies"]) {
    compareMetric(
      regressions,
      `${label}.${metric}`,
      current[metric],
      baseline[metric],
      baseline[metric] + moduleTolerance,
    );
  }

  const packageNames = new Set([
    ...Object.keys(baseline.byPackage),
    ...Object.keys(current.byPackage),
  ]);
  for (const packageName of packageNames) {
    const baselineCount = baseline.byPackage[packageName] ?? 0;
    const currentCount = current.byPackage[packageName] ?? 0;
    compareMetric(
      regressions,
      `${label}.byPackage.${packageName}`,
      currentCount,
      baselineCount,
      baselineCount + moduleTolerance,
    );
  }
}

function compareResults(current, baseline, options) {
  if (baseline.schemaVersion !== current.schemaVersion) {
    throw new Error(
      `Baseline schema ${baseline.schemaVersion} does not match current schema ${current.schemaVersion}.`,
    );
  }

  if (baseline.toolchain.node !== current.toolchain.node) {
    throw new Error(
      `Node.js version mismatch: baseline ${baseline.toolchain.node}, current ${current.toolchain.node}.`,
    );
  }

  if (baseline.toolchain.rolldown !== current.toolchain.rolldown) {
    throw new Error(
      `Rolldown version mismatch: baseline ${baseline.toolchain.rolldown}, current ${current.toolchain.rolldown}.`,
    );
  }

  if (
    JSON.stringify(baseline.configuration) !==
    JSON.stringify(current.configuration)
  ) {
    throw new Error(
      "Baseline configuration does not match the current benchmark configuration.",
    );
  }

  const regressions = [];
  for (const fixtureName of Object.keys(current.bundles)) {
    if (!baseline.bundles[fixtureName]) {
      regressions.push(
        `${fixtureName}: fixture is missing from the baseline; update it intentionally`,
      );
    }
  }
  for (const [fixtureName, modes] of Object.entries(baseline.bundles)) {
    const currentFixture = current.bundles[fixtureName];
    if (!currentFixture) {
      regressions.push(`${fixtureName}: fixture is missing from current results`);
      continue;
    }

    for (const modeName of Object.keys(currentFixture)) {
      if (!modes[modeName]) {
        regressions.push(
          `${fixtureName}.${modeName}: mode is missing from the baseline`,
        );
      }
    }

    for (const [modeName, baselineMeasurement] of Object.entries(modes)) {
      const currentMeasurement = currentFixture[modeName];
      if (!currentMeasurement) {
        regressions.push(
          `${fixtureName}.${modeName}: mode is missing from current results`,
        );
        continue;
      }

      const label = `${fixtureName}.${modeName}`;
      compareByteMetrics(
        regressions,
        `${label}.bytes`,
        currentMeasurement.bytes,
        baselineMeasurement.bytes,
        options.byteTolerancePercent,
      );
      compareModuleMetrics(
        regressions,
        `${label}.modules`,
        currentMeasurement.modules,
        baselineMeasurement.modules,
        options.moduleTolerance,
      );

      compareMetric(
        regressions,
        `${label}.chunks`,
        currentMeasurement.chunks,
        baselineMeasurement.chunks,
        baselineMeasurement.chunks + options.moduleTolerance,
      );

      for (const deliveryType of ["initial", "async"]) {
        const currentDelivery = currentMeasurement.delivery[deliveryType];
        const baselineDelivery = baselineMeasurement.delivery[deliveryType];
        const deliveryLabel = `${label}.delivery.${deliveryType}`;
        compareByteMetrics(
          regressions,
          `${deliveryLabel}.bytes`,
          currentDelivery.bytes,
          baselineDelivery.bytes,
          options.byteTolerancePercent,
        );
        compareMetric(
          regressions,
          `${deliveryLabel}.chunks`,
          currentDelivery.chunks,
          baselineDelivery.chunks,
          baselineDelivery.chunks + options.moduleTolerance,
        );
        compareModuleMetrics(
          regressions,
          `${deliveryLabel}.modules`,
          currentDelivery.modules,
          baselineDelivery.modules,
          options.moduleTolerance,
        );
      }
    }
  }

  compareByteMetrics(
    regressions,
    "assets.styles",
    current.assets.styles,
    baseline.assets.styles,
    options.byteTolerancePercent,
  );

  if (baseline.package && current.package) {
    for (const metric of ["packedBytes", "unpackedBytes"]) {
      compareMetric(
        regressions,
        `package.${metric}`,
        current.package[metric],
        baseline.package[metric],
        allowedByteValue(
          baseline.package[metric],
          options.packageByteTolerancePercent,
        ),
      );
    }
    compareMetric(
      regressions,
      "package.files",
      current.package.files,
      baseline.package.files,
      baseline.package.files + options.fileTolerance,
    );
  } else if (Boolean(baseline.package) !== Boolean(current.package)) {
    regressions.push(
      "Package measurement must be enabled or disabled consistently with the baseline.",
    );
  }

  return regressions;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.skipBuild) buildLibrary();
  if (!existsSync(path.join(DIST_DIR, "index.js"))) {
    throw new Error("dist/index.js is missing. Run without --skip-build first.");
  }

  const results = {
    schemaVersion: 2,
    toolchain: {
      node: process.versions.node,
      rolldown: readRolldownVersion(),
    },
    configuration: {
      minified: true,
      peerPackages: PEER_PACKAGES,
      compression: {
        gzipLevel: 9,
        brotliQuality: 11,
      },
    },
    bundles: await measureFixtures(),
    assets: {
      styles: measureStyles(),
    },
    package: options.skipPack ? undefined : measurePackage(),
  };

  printResults(results);
  if (options.output) writeJson(options.output, results);
  if (options.writeBaseline) writeJson(options.writeBaseline, results);

  if (options.baseline) {
    const baseline = readJson(options.baseline);
    const regressions = compareResults(results, baseline, options);
    if (regressions.length > 0) {
      console.error(`\n${regressions.length} bundle benchmark regression(s):`);
      for (const regression of regressions) console.error(`- ${regression}`);
      process.exitCode = 1;
    } else {
      console.log("\nBundle benchmark comparison passed.");
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
