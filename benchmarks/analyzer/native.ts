import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const analyzerRoot = path.dirname(fileURLToPath(import.meta.url));
const maximumOutputBytes = 64 * 1024 * 1024;

export async function compareNativeBatch(comparisons, {
  executable = "go",
  arguments: arguments_ = ["run", ".", "--batch"],
  cwd = analyzerRoot,
  timeoutMs = 300_000,
}: any = {}) {
  if (!Array.isArray(comparisons) || comparisons.length === 0) {
    throw new Error("Native analyzer requires at least one comparison");
  }
  const input = JSON.stringify({ comparisons });
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      fail(new Error(`Native analyzer exceeded ${timeoutMs}ms`));
    }, timeoutMs);
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(error);
    };
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maximumOutputBytes) {
        fail(new Error("Native analyzer stdout exceeded 64 MiB"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > maximumOutputBytes) {
        fail(new Error("Native analyzer stderr exceeded 64 MiB"));
        return;
      }
      stderr.push(chunk);
    });
    child.once("error", fail);
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const errorText = Buffer.concat(stderr).toString("utf8").trim();
      if (code !== 0) {
        reject(
          new Error(
            `Native analyzer exited with ${code ?? signal ?? "unknown status"}${errorText ? `: ${errorText}` : ""}`,
          ),
        );
        return;
      }
      try {
        const result = JSON.parse(Buffer.concat(stdout).toString("utf8"));
        if (!Array.isArray(result.comparisons)) {
          throw new Error("Native analyzer response is missing comparisons");
        }
        if (result.comparisons.length !== comparisons.length) {
          throw new Error(
            `Native analyzer returned ${result.comparisons.length} comparisons for ${comparisons.length} requests`,
          );
        }
        resolve(result.comparisons);
      } catch (error) {
        reject(new Error("Could not parse native analyzer output", { cause: error }));
      }
    });
    child.stdin.on("error", fail);
    child.stdin.end(input);
  });
}
