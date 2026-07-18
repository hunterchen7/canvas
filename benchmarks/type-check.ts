#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const compiler = path.join(
  repositoryRoot,
  "node_modules/typescript/bin/tsc",
);
const projects = [
  "benchmarks/tsconfig.json",
  "benchmarks/bundle",
  "benchmarks/runtime",
  "benchmarks/runtime/scripts",
  "benchmarks/e2e",
  "benchmarks/e2e/tsconfig.scripts.json",
  "benchmarks/analyzer",
  "tests",
];

for (const project of projects) {
  console.log(`Type-checking ${project}`);
  execFileSync(process.execPath, [compiler, "-p", project], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
}
