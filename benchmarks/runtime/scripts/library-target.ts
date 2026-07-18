import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
  realpath,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const IDENTITY_SCHEMA_VERSION = "1.0.0";

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function requireDirectory(
  directory,
  description,
  { allowSymbolicLink = true } = {},
) {
  let details;
  try {
    details = allowSymbolicLink ? await stat(directory) : await lstat(directory);
  } catch (error) {
    throw new Error(`${description} does not exist: ${directory}`, {
      cause: error,
    });
  }
  if (!details.isDirectory()) {
    throw new Error(`${description} is not a directory: ${directory}`);
  }
}

async function requireRegularFile(filename, description) {
  let details;
  try {
    details = await lstat(filename);
  } catch (error) {
    throw new Error(`${description} does not exist: ${filename}`, {
      cause: error,
    });
  }
  if (!details.isFile()) {
    throw new Error(`${description} is not a regular file: ${filename}`);
  }
}

async function sourceFiles(sourceDirectory) {
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path
        .relative(sourceDirectory, absolutePath)
        .split(path.sep)
        .join("/");
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Library src contains a symbolic link, which cannot be hashed safely: ${relativePath}`,
        );
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        files.push({ absolutePath, relativePath });
      } else {
        const details = await lstat(absolutePath);
        throw new Error(
          `Library src contains an unsupported filesystem entry (${details.mode.toString(8)}): ${relativePath}`,
        );
      }
    }
  }

  await visit(sourceDirectory);
  return files;
}

async function hashSourceTree(sourceDirectory) {
  const files = await sourceFiles(sourceDirectory);
  const digest = createHash("sha256");
  let bytes = 0;
  for (const file of files) {
    const contents = await readFile(file.absolutePath);
    const relativePath = Buffer.from(file.relativePath, "utf8");
    const header = Buffer.allocUnsafe(8);
    header.writeUInt32BE(relativePath.length, 0);
    header.writeUInt32BE(contents.length, 4);
    digest.update(header);
    digest.update(relativePath);
    digest.update(contents);
    bytes += contents.length;
  }
  return {
    algorithm: "sha256",
    hash: digest.digest("hex"),
    fileCount: files.length,
    bytes,
  };
}

async function gitOutput(root, arguments_, { optional = false } = {}) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, ...arguments_], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout.trimEnd();
  } catch (error) {
    if (optional) return null;
    throw error;
  }
}

async function gitIdentity(root) {
  const repository = await gitOutput(root, ["rev-parse", "--show-toplevel"], {
    optional: true,
  });
  if (!repository) {
    return {
      available: false,
      head: null,
      sourceTree: null,
      sourceDirty: null,
      sourceStatus: [],
    };
  }

  const repositoryRoot = await realpath(repository);
  const relativeRoot = path.relative(repositoryRoot, root).split(path.sep).join("/");
  if (relativeRoot === ".." || relativeRoot.startsWith("../")) {
    throw new Error(`Library root is outside its reported Git worktree: ${root}`);
  }
  const sourcePath = relativeRoot ? `${relativeRoot}/src` : "src";
  const [head, sourceTree, statusOutput] = await Promise.all([
    gitOutput(root, ["rev-parse", "HEAD"]),
    gitOutput(root, ["rev-parse", `HEAD:${sourcePath}`], { optional: true }),
    gitOutput(root, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      "src",
    ]),
  ]);
  const sourceStatus = statusOutput ? statusOutput.split("\n") : [];
  return {
    available: true,
    worktreeRoot: repositoryRoot,
    head,
    sourceTree,
    sourceDirty: sourceStatus.length > 0,
    sourceStatus,
  };
}

/**
 * Resolves and fingerprints a Canvas source checkout for the runtime fixture.
 * The fingerprint deliberately covers only package identity plus src contents;
 * benchmark files and installed dependencies are owned by the invoking checkout.
 */
export async function resolveLibraryTarget({
  repositoryRoot,
  libraryRoot,
  libraryLabel,
}) {
  if (typeof repositoryRoot !== "string" || repositoryRoot.trim() === "") {
    throw new Error("repositoryRoot must be a non-empty path");
  }
  if (
    libraryRoot != null &&
    (typeof libraryRoot !== "string" || libraryRoot.trim() === "")
  ) {
    throw new Error("libraryRoot must be a non-empty path when supplied");
  }
  if (
    libraryLabel != null &&
    (typeof libraryLabel !== "string" || libraryLabel.trim() === "")
  ) {
    throw new Error("libraryLabel must be a non-empty string when supplied");
  }

  const requestedRoot = path.resolve(libraryRoot ?? repositoryRoot);
  await requireDirectory(requestedRoot, "Library root");
  const root = await realpath(requestedRoot);
  const packagePath = path.join(root, "package.json");
  const sourceDirectory = path.join(root, "src");
  const sourceEntry = path.join(sourceDirectory, "index.ts");
  await requireRegularFile(packagePath, "Library package.json");
  await requireDirectory(sourceDirectory, "Library src directory", {
    allowSymbolicLink: false,
  });
  await requireRegularFile(sourceEntry, "Library source entry src/index.ts");

  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  } catch (error) {
    throw new Error(`Library package.json is not valid JSON: ${packagePath}`, {
      cause: error,
    });
  }
  if (!packageJson || typeof packageJson !== "object") {
    throw new Error(
      `Library package.json must contain an object: ${packagePath}`,
    );
  }
  if (typeof packageJson.name !== "string" || packageJson.name.trim() === "") {
    throw new Error(
      `Library package.json must contain a non-empty name: ${packagePath}`,
    );
  }

  const [source, git] = await Promise.all([
    hashSourceTree(sourceDirectory),
    gitIdentity(root),
  ]);
  const identityWithoutProof = {
    schemaVersion: IDENTITY_SCHEMA_VERSION,
    label: libraryLabel?.trim() || packageJson.name,
    package: {
      name: packageJson.name,
      version:
        typeof packageJson.version === "string" ? packageJson.version : null,
    },
    root,
    sourceEntry,
    source,
    git,
  };
  const proof = createHash("sha256")
    .update(canonicalJson(identityWithoutProof))
    .digest("hex");
  const identity = Object.freeze({ ...identityWithoutProof, proof });

  return Object.freeze({
    root,
    packagePath,
    sourceDirectory,
    sourceEntry,
    identity,
  });
}

export function assertMatchingLibraryIdentity(expected, observed) {
  if (!observed || typeof observed !== "object") {
    throw new Error("Benchmark page did not expose its library source identity");
  }
  if (typeof observed.proof !== "string" || observed.proof === "") {
    throw new Error("Benchmark page exposed an invalid library source proof");
  }
  if (expected && canonicalJson(expected) !== canonicalJson(observed)) {
    throw new Error(
      `Benchmark loaded the wrong library source (expected ${expected.label} ${expected.proof}, received ${observed.label ?? "unlabelled"} ${observed.proof})`,
    );
  }
  return observed;
}
