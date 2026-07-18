import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeCpuProfile,
  summarizeHeapProfile,
  summarizeTrace,
} from "./profile-summary.ts";

test("summarizeCpuProfile attributes self and recursive inclusive time", () => {
  const profile = {
    startTime: 1_000,
    endTime: 21_000,
    nodes: [
      {
        id: 1,
        callFrame: { functionName: "(root)", url: "", lineNumber: -1 },
        children: [2, 3, 4],
      },
      {
        id: 2,
        callFrame: {
          functionName: "render",
          url: "http://localhost/app.js?v=123#hash",
          lineNumber: 9,
          columnNumber: 4,
        },
        children: [5],
      },
      {
        id: 5,
        callFrame: {
          functionName: "render",
          url: "http://localhost/app.js?v=456",
          lineNumber: 9,
          columnNumber: 4,
        },
      },
      {
        id: 3,
        callFrame: {
          functionName: "(garbage collector)",
          url: "",
          lineNumber: -1,
        },
      },
      {
        id: 4,
        callFrame: { functionName: "(idle)", url: "", lineNumber: -1 },
      },
    ],
    samples: [5, 2, 3, 4, 99, 2],
    timeDeltas: [1_000, 2_000, 3_000, -50, 4_000, 1_000],
  };

  const summary = summarizeCpuProfile(profile);
  const render = summary.topSelfTime.find(
    (entry) => entry.functionName === "render",
  );

  assert.equal(summary.durationMs, 20);
  assert.equal(summary.sampledTimeMs, 11);
  assert.equal(summary.sampleCount, 5);
  assert.equal(summary.sampleIntervalUs.p50, 2_000);
  assert.deepEqual(summary.timeBreakdownMs, {
    javascript: 4,
    gc: 3,
    idle: 0,
    program: 0,
    unattributed: 4,
  });
  assert.equal(render.url, "http://localhost/app.js");
  assert.equal(render.lineNumber, 10);
  assert.equal(render.columnNumber, 5);
  assert.equal(render.selfTimeMs, 4);
  assert.equal(render.inclusiveTimeMs, 4);
  assert.equal(render.selfSamples, 3);
  assert.equal(render.inclusiveSamples, 3);
  assert(
    summary.topSelfTime.every(
      (entry) => !entry.functionName.includes("garbage collector"),
    ),
  );
  assert(summary.warnings.some((warning) => warning.includes("negative")));
  assert(summary.warnings.some((warning) => warning.includes("unknown nodes")));
});

test("summarizeCpuProfile tolerates absent arrays", () => {
  const summary = summarizeCpuProfile({});
  assert.equal(summary.sampleCount, 0);
  assert.equal(summary.sampledTimeMs, 0);
  assert.equal(summary.topSelfTime.length, 0);
  assert.equal(summary.warnings.length, 3);
});

test("summarizeHeapProfile groups allocation sites", () => {
  const profile = {
    head: {
      id: 1,
      callFrame: { functionName: "(root)", url: "", lineNumber: -1 },
      selfSize: 0,
      children: [
        {
          id: 2,
          callFrame: {
            functionName: "createNode",
            url: "http://localhost/canvas.js?cache=1",
            lineNumber: 19,
            columnNumber: 2,
          },
          selfSize: 2_048,
          children: [],
        },
        {
          id: 3,
          callFrame: {
            functionName: "createNode",
            url: "http://localhost/canvas.js?cache=2",
            lineNumber: 19,
            columnNumber: 2,
          },
          selfSize: 1_024,
          children: [],
        },
        {
          id: 4,
          callFrame: {
            functionName: "layout",
            url: "http://localhost/layout.js",
            lineNumber: 4,
            columnNumber: 0,
          },
          selfSize: 512,
          children: [],
        },
      ],
    },
    samples: [
      { nodeId: 2, size: 1_024, ordinal: 1 },
      { nodeId: 2, size: 1_024, ordinal: 2 },
      { nodeId: 3, size: 1_024, ordinal: 3 },
      { nodeId: 99, size: 256, ordinal: 4 },
    ],
  };

  const summary = summarizeHeapProfile(profile);
  assert.equal(summary.nodeCount, 4);
  assert.equal(summary.totalSampledBytes, 3_584);
  assert.equal(summary.sampleEntryBytes, 3_328);
  assert.equal(summary.byteSource, "allocation-tree");
  assert.deepEqual(summary.topAllocationSites[0], {
    functionName: "createNode",
    url: "http://localhost/canvas.js",
    lineNumber: 20,
    columnNumber: 3,
    sampledBytes: 3_072,
    sampledPercent: 85.7143,
    sampleCount: 3,
  });
  assert(summary.warnings.some((warning) => warning.includes("unknown nodes")));
});

test("summarizeHeapProfile falls back to detailed sample sizes", () => {
  const summary = summarizeHeapProfile({
    head: {
      id: 1,
      callFrame: { functionName: "allocate", url: "app.js", lineNumber: 0 },
      selfSize: 0,
      children: [],
    },
    samples: [{ nodeId: 1, size: 4_096 }],
  });
  assert.equal(summary.byteSource, "samples");
  assert.equal(summary.totalSampledBytes, 4_096);
  assert.equal(summary.topAllocationSites[0].sampledBytes, 4_096);
});

test("summarizeTrace identifies renderer work, unions overlap, and finds phases", () => {
  const timeline = "devtools.timeline";
  const trace = {
    traceEvents: [
      {
        ph: "M",
        name: "thread_name",
        pid: 1,
        tid: 10,
        ts: 0,
        args: { name: "CrRendererMain" },
      },
      {
        ph: "X",
        name: "RunTask",
        cat: timeline,
        pid: 1,
        tid: 10,
        ts: 0,
        dur: 60_000,
      },
      {
        ph: "X",
        name: "FunctionCall",
        cat: timeline,
        pid: 1,
        tid: 10,
        ts: 5_000,
        dur: 20_000,
      },
      {
        ph: "B",
        name: "EventDispatch",
        cat: timeline,
        pid: 1,
        tid: 10,
        ts: 60_000,
      },
      {
        ph: "E",
        cat: timeline,
        pid: 1,
        tid: 10,
        ts: 65_000,
      },
      {
        ph: "X",
        name: "Layout",
        cat: timeline,
        pid: 1,
        tid: 10,
        ts: 10_000,
        dur: 10_000,
      },
      {
        ph: "X",
        name: "UpdateLayoutTree",
        cat: timeline,
        pid: 1,
        tid: 10,
        ts: 30_000,
        dur: 5_000,
      },
      {
        ph: "X",
        name: "MinorGC",
        cat: "v8",
        pid: 1,
        tid: 10,
        ts: 40_000,
        dur: 2_000,
      },
      {
        ph: "X",
        name: "RasterTask",
        cat: "cc",
        pid: 1,
        tid: 11,
        ts: 20_000,
        dur: 12_000,
      },
      {
        ph: "X",
        name: "RasterTask",
        cat: "cc",
        pid: 1,
        tid: 12,
        ts: 25_000,
        dur: 5_000,
      },
      {
        ph: "X",
        name: "DrawFrame",
        cat: "cc",
        pid: 1,
        tid: 11,
        ts: 50_000,
        dur: 5_000,
      },
      {
        ph: "b",
        name: "canvas:phase:zoom",
        cat: "blink.user_timing",
        pid: 1,
        tid: 10,
        ts: 0,
        id2: { local: "zoom-1" },
      },
      {
        ph: "e",
        name: "canvas:phase:zoom",
        cat: "blink.user_timing",
        pid: 1,
        tid: 10,
        ts: 60_000,
        id2: { local: "zoom-1" },
      },
      {
        ph: "I",
        name: "canvas:phase:drag:start",
        cat: "blink.user_timing",
        pid: 1,
        tid: 10,
        ts: 70_000,
      },
      {
        ph: "I",
        name: "canvas:phase:drag:end",
        cat: "blink.user_timing",
        pid: 1,
        tid: 10,
        ts: 80_000,
      },
      {
        ph: "I",
        name: "--render-start-Canvas",
        cat: "blink.user_timing",
        pid: 1,
        tid: 10,
        ts: 22_000,
      },
    ],
  };

  const summary = summarizeTrace(trace);
  assert.deepEqual(summary.mainThread, {
    pid: 1,
    tid: 10,
    name: "CrRendererMain",
    selection: "metadata",
    activeTimeMs: 65,
  });
  assert.equal(summary.tasks.eventCount, 1);
  assert.equal(summary.tasks.activeTimeMs, 60);
  assert.equal(summary.tasks.countOver50Ms, 1);
  assert.equal(summary.tasks.blockingTimeOver50Ms, 10);
  assert.equal(summary.mainThreadActivity.javascript.eventCount, 2);
  assert.equal(summary.mainThreadActivity.javascript.activeTimeMs, 25);
  assert.equal(summary.mainThreadActivity.layout.activeTimeMs, 10);
  assert.equal(summary.mainThreadActivity.style.activeTimeMs, 5);
  assert.equal(summary.mainThreadActivity.gc.activeTimeMs, 2);
  assert.equal(summary.crossThreadActivity.raster.threadActiveTimeMs, 17);
  assert.equal(summary.crossThreadActivity.raster.wallTimeMs, 12);
  assert.equal(summary.crossThreadActivity.compositor.wallTimeMs, 5);
  assert.equal(summary.phases.zoom.totalMs, 60);
  assert.equal(summary.phases.zoom.tasks.activeTimeMs, 60);
  assert.equal(summary.phases.zoom.tasks.countOver50Ms, 1);
  assert.equal(
    summary.phases.zoom.mainThreadActivity.javascript.activeTimeMs,
    20,
  );
  assert.equal(summary.phases.zoom.mainThreadActivity.layout.activeTimeMs, 10);
  assert.equal(
    summary.phases.zoom.crossThreadActivity.raster.threadActiveTimeMs,
    17,
  );
  assert.equal(summary.phases.zoom.crossThreadActivity.raster.wallTimeMs, 12);
  assert.equal(summary.phases.zoom.crossThreadActivity.compositor.wallTimeMs, 5);
  assert.equal(summary.phases.drag.totalMs, 10);
  assert.equal(summary.phases.drag.tasks.activeTimeMs, 0);
  assert.equal(summary.phases.drag.crossThreadActivity.raster.wallTimeMs, 0);
  assert.equal(summary.react.detected, true);
  assert.equal(summary.react.rawEventCount, 1);
  assert.equal(summary.durationMs, 80);
});

test("summarizeTrace falls back to the busiest timeline thread", () => {
  const summary = summarizeTrace([
    {
      ph: "X",
      name: "RunTask",
      cat: "devtools.timeline",
      pid: 8,
      tid: 1,
      ts: 0,
      dur: 1_000,
    },
    {
      ph: "X",
      name: "RunTask",
      cat: "devtools.timeline",
      pid: 8,
      tid: 2,
      ts: 0,
      dur: 9_000,
    },
  ]);
  assert.equal(summary.mainThread.tid, 2);
  assert.equal(summary.mainThread.selection, "timeline-duration");
  assert.equal(summary.tasks.activeTimeMs, 9);
});

test("summarizeTrace reports malformed input without throwing", () => {
  const summary = summarizeTrace({ nope: [] });
  assert.equal(summary.eventCount, 0);
  assert.equal(summary.mainThread, null);
  assert.equal(summary.warnings.length, 2);
});

test("summarizeTrace handles production-sized event lists", () => {
  const traceEvents = Array.from({ length: 120_000 }, (_, index) => ({
    ph: "I",
    name: "tick",
    cat: "test",
    pid: 1,
    tid: 1,
    ts: index,
  }));
  const summary = summarizeTrace({ traceEvents });
  assert.equal(summary.eventCount, 120_000);
  assert.equal(summary.traceStartUs, 0);
  assert.equal(summary.traceEndUs, 119_999);
  assert.equal(summary.durationMs, 119.999);
});
