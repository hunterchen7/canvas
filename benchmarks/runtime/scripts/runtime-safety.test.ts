import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  allocateEphemeralPort,
  assertFreshOutputFile,
  assertSeparateArtifactPaths,
  claimFreshDirectory,
  portIsAvailable,
  writeFileExclusive,
} from "./runtime-safety.ts";

test("runtime artifacts are claimed without overwriting stale paths", async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "canvas-runtime-safety-"),
  );
  try {
    const output = path.join(temporary, "result.json");
    await assertFreshOutputFile(output);
    await writeFileExclusive(output, "first\n");
    assert.equal(await readFile(output, "utf8"), "first\n");
    await assert.rejects(assertFreshOutputFile(output), /refusing to overwrite/);
    await assert.rejects(
      writeFileExclusive(output, "second\n"),
      /refusing to overwrite/,
    );
    assert.equal(await readFile(output, "utf8"), "first\n");

    const profile = path.join(temporary, "profile");
    await claimFreshDirectory(profile, "Profile directory");
    await assert.rejects(
      claimFreshDirectory(profile, "Profile directory"),
      /refusing to mix captures/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("result and profile artifact paths cannot overlap", () => {
  assert.doesNotThrow(() =>
    assertSeparateArtifactPaths("/tmp/result.json", "/tmp/profile"),
  );
  assert.throws(
    () => assertSeparateArtifactPaths("/tmp/profile/result.json", "/tmp/profile"),
    /must not overlap/,
  );
  assert.throws(
    () => assertSeparateArtifactPaths("/tmp/artifact", "/tmp/artifact"),
    /must not overlap/,
  );
});

test(
  "OS-assigned runtime port is valid and released for Vite",
  async (context) => {
    let port;
    try {
      port = await allocateEphemeralPort();
    } catch (error) {
      if (error?.code === "EPERM") {
        context.skip("sandbox does not permit binding a loopback test socket");
        return;
      }
      throw error;
    }
    assert.equal(Number.isSafeInteger(port), true);
    assert.equal(port > 0 && port <= 65_535, true);
    assert.equal(await portIsAvailable(port), true);
  },
);
