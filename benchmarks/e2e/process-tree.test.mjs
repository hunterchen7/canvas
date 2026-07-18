import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";
import test from "node:test";
import {
  processTreeIsRunning,
  stopChildProcessTree,
} from "./process-tree.mjs";

const testOptions = {
  skip:
    process.platform === "win32"
      ? "POSIX process-group behavior is tested on POSIX"
      : false,
};

test("process-tree cleanup escalates and awaits termination", testOptions, async () => {
  const child = spawn(
    process.execPath,
    [
      "-e",
      "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000);",
    ],
    {
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
    },
  );

  try {
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.stdout.once("data", resolve);
    });
    assert.equal(processTreeIsRunning(child), true);
    await stopChildProcessTree(child, {
      gracefulTimeoutMs: 100,
      forceTimeoutMs: 2_000,
    });
    assert.equal(processTreeIsRunning(child), false);
  } finally {
    if (processTreeIsRunning(child)) {
      process.kill(-child.pid, "SIGKILL");
    }
  }
});
