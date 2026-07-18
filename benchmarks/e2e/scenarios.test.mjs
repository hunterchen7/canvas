import assert from "node:assert/strict";
import test from "node:test";
import {
  collectForcedGcLiveHeap,
  summarizeForcedGcLiveHeap,
} from "./scenarios.mjs";

test("forced-GC live heap collects before reading and preserves byte fields", async () => {
  const commands = [];
  const cdp = {
    async send(command) {
      commands.push(command);
      if (command === "Runtime.getHeapUsage") {
        return {
          usedSize: 120,
          totalSize: 500,
          embedderHeapUsedSize: 40,
          backingStorageSize: 20,
        };
      }
      return {};
    },
  };

  const result = await collectForcedGcLiveHeap(cdp, "test-checkpoint");

  assert.deepEqual(commands, [
    "HeapProfiler.collectGarbage",
    "Runtime.getHeapUsage",
  ]);
  assert.deepEqual(result, {
    usedSizeBytes: 120,
    totalSizeBytes: 500,
    embedderHeapUsedSizeBytes: 40,
    backingStorageSizeBytes: 20,
  });
});

test("forced-GC live heap summary reports before, after, and signed delta", () => {
  const before = {
    usedSizeBytes: 120,
    totalSizeBytes: 500,
    embedderHeapUsedSizeBytes: 40,
    backingStorageSizeBytes: 20,
  };
  const after = {
    usedSizeBytes: 150,
    totalSizeBytes: 480,
    embedderHeapUsedSizeBytes: 48,
    backingStorageSizeBytes: 16,
  };

  assert.deepEqual(summarizeForcedGcLiveHeap(before, after), {
    source: "Runtime.getHeapUsage after HeapProfiler.collectGarbage",
    unit: "bytes",
    before,
    after,
    delta: {
      usedSizeBytes: 30,
      totalSizeBytes: -20,
      embedderHeapUsedSizeBytes: 8,
      backingStorageSizeBytes: -4,
    },
  });
});

test("forced-GC live heap rejects incomplete protocol responses", async () => {
  const cdp = {
    async send(command) {
      return command === "Runtime.getHeapUsage" ? { usedSize: 120 } : {};
    },
  };

  await assert.rejects(
    collectForcedGcLiveHeap(cdp, "test-checkpoint"),
    /invalid totalSizeBytes at test-checkpoint/u,
  );
});
