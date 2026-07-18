import { spawn } from "node:child_process";
import process from "node:process";

export function processTreeIsRunning(child) {
  if (!child?.pid) return false;
  if (process.platform === "win32") {
    return child.exitCode == null && child.signalCode == null;
  }
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

async function waitForProcessTreeExit(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (processTreeIsRunning(child)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

async function taskkillProcessTree(child, force = false) {
  if (!child?.pid) return;
  await new Promise((resolve) => {
    const arguments_ = ["/PID", String(child.pid), "/T"];
    if (force) arguments_.push("/F");
    const killer = spawn("taskkill", arguments_, {
      stdio: "ignore",
      windowsHide: true,
    });
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    killer.once("error", () => {
      try {
        child.kill(force ? "SIGKILL" : "SIGTERM");
      } catch {
        // The direct child may already have exited.
      }
      settle();
    });
    killer.once("close", settle);
  });
}

export async function stopChildProcessTree(
  child,
  { gracefulTimeoutMs = 2_000, forceTimeoutMs = 1_000 } = {},
) {
  if (!child?.pid || !processTreeIsRunning(child)) return;
  if (process.platform === "win32") {
    await taskkillProcessTree(child);
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
  if (await waitForProcessTreeExit(child, gracefulTimeoutMs)) return;
  if (process.platform === "win32") {
    await taskkillProcessTree(child, true);
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
  if (!(await waitForProcessTreeExit(child, forceTimeoutMs))) {
    throw new Error(`Could not stop Vite process tree ${child.pid}`);
  }
}
