import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stopChildProcessTree } from "../e2e/process-tree.ts";

const analyzerRoot = path.dirname(fileURLToPath(import.meta.url));
const maximumOutputBytes = 64 * 1024 * 1024;

export async function compareNativeBatch(comparisons, {
  executable = "go",
  arguments: arguments_ = ["run", ".", "--batch"],
  cwd = analyzerRoot,
  timeoutMs = 300_000,
  signal = null,
  env = process.env,
}: any = {}) {
  if (!Array.isArray(comparisons) || comparisons.length === 0) {
    throw new Error("Native analyzer requires at least one comparison");
  }
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Native analyzer was aborted");
  }
  const input = JSON.stringify({ comparisons });
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, {
      cwd,
      detached: process.platform !== "win32",
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timer = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      void stopChildProcessTree(child).then(
        () => {
          child.stdin.destroy();
          child.stdout.destroy();
          child.stderr.destroy();
          reject(error);
        },
        (stopError) =>
          reject(
            new AggregateError(
              [error, stopError],
              "Native analyzer failed and its process tree could not be stopped",
            ),
          ),
      );
    };
    const abort = () => {
      fail(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error("Native analyzer was aborted"),
      );
    };
    timer = setTimeout(() => {
      fail(new Error(`Native analyzer exceeded ${timeoutMs}ms`));
    }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => {
      if (settled) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > maximumOutputBytes) {
        fail(new Error("Native analyzer stdout exceeded 64 MiB"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (settled) return;
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
      cleanup();
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

function comparisonWork(entry) {
  const pairSlots = Math.max(
    entry.baseline?.length ?? 0,
    entry.candidate?.length ?? 0,
    1,
  );
  const requestedIterations = entry.options?.bootstrapIterations;
  const iterations = Number.isSafeInteger(requestedIterations)
    ? Math.max(1, requestedIterations)
    : 10_000;
  return pairSlots * iterations;
}

export async function compareNativeBatches(comparisons, {
  maximumBatchWork = 100_000_000,
  maximumBatchBytes = 8 * 1024 * 1024,
  maximumBatchComparisons = 5_000,
  timeoutMs = 300_000,
  ...processOptions
}: any = {}) {
  if (!Array.isArray(comparisons) || comparisons.length === 0) {
    throw new Error("Native analyzer requires at least one comparison");
  }
  for (const [name, value] of Object.entries({
    maximumBatchWork,
    maximumBatchBytes,
    maximumBatchComparisons,
  })) {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new Error(`${name} must be a positive safe integer`);
    }
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeoutMs must be a positive finite number");
  }
  const batches = [];
  let current = [];
  let currentWork = 0;
  let currentBytes = 18;
  for (const entry of comparisons) {
    const work = comparisonWork(entry);
    const bytes = Buffer.byteLength(JSON.stringify(entry)) + 1;
    if (work > maximumBatchWork) {
      throw new Error(
        `Native analyzer comparison work ${work} exceeds maximumBatchWork ${maximumBatchWork}`,
      );
    }
    if (18 + bytes > maximumBatchBytes) {
      throw new Error(
        `Native analyzer comparison size ${18 + bytes} exceeds maximumBatchBytes ${maximumBatchBytes}`,
      );
    }
    if (
      current.length > 0 &&
      (currentWork + work > maximumBatchWork ||
        currentBytes + bytes > maximumBatchBytes ||
        current.length >= maximumBatchComparisons)
    ) {
      batches.push(current);
      current = [];
      currentWork = 0;
      currentBytes = 18;
    }
    current.push(entry);
    currentWork += work;
    currentBytes += bytes;
  }
  if (current.length > 0) batches.push(current);

  const startedAt = Date.now();
  const results = [];
  for (const batch of batches) {
    const remainingTimeoutMs = timeoutMs - (Date.now() - startedAt);
    if (remainingTimeoutMs <= 0) {
      throw new Error(`Native analyzer batches exceeded ${timeoutMs}ms`);
    }
    const batchResults: any = await compareNativeBatch(batch, {
      ...processOptions,
      timeoutMs: remainingTimeoutMs,
    });
    results.push(...batchResults);
  }
  return { comparisons: results, batchCount: batches.length };
}
