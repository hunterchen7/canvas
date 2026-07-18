import { lstat, mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

export async function portIsAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      if (error?.code === "EADDRINUSE") resolve(false);
      else reject(error);
    });
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve(true);
      });
    });
  });
}

export async function allocateEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Could not resolve an ephemeral port")),
        );
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

export async function assertFreshOutputFile(filename) {
  try {
    await lstat(filename);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(
    `Output file already exists; refusing to overwrite a prior capture: ${filename}`,
  );
}

export async function claimFreshDirectory(
  directory,
  description = "Artifact directory",
) {
  await mkdir(path.dirname(directory), { recursive: true });
  try {
    await mkdir(directory);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(
        `${description} already exists; refusing to mix captures: ${directory}`,
      );
    }
    throw error;
  }
}

function containsPath(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

export function assertSeparateArtifactPaths(outputFile, profileDirectory) {
  if (!outputFile || !profileDirectory) return;
  const output = path.resolve(outputFile);
  const profile = path.resolve(profileDirectory);
  if (containsPath(output, profile) || containsPath(profile, output)) {
    throw new Error(
      `Result output and profile directory must not overlap: ${output} and ${profile}`,
    );
  }
}

export async function writeFileExclusive(filename, contents) {
  await mkdir(path.dirname(filename), { recursive: true });
  try {
    await writeFile(filename, contents, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(
        `Output file appeared during capture; refusing to overwrite it: ${filename}`,
      );
    }
    throw error;
  }
}
