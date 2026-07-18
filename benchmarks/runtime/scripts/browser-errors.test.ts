import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  createBrowserErrorCollector,
  emptyBrowserErrorProvenance,
  failResultForBrowserErrors,
} from "./browser-errors.ts";

test("browser error collector records page and console errors until stopped", () => {
  const page = new EventEmitter();
  const stderr = [];
  const collector = createBrowserErrorCollector(page, {
    stderr: { write: (value) => Boolean(stderr.push(value)) },
  });

  page.emit("console", {
    type: () => "warning",
    text: () => "not fatal",
    location: () => ({}),
  });
  page.emit("pageerror", new TypeError("render exploded"));
  page.emit("console", {
    type: () => "error",
    text: () => "request failed",
    location: () => ({
      url: "http://127.0.0.1/app.tsx",
      lineNumber: 12,
      columnNumber: 4,
    }),
  });

  const provenance = collector.stop();
  assert.equal(provenance.policy, "fail-on-any");
  assert.equal(provenance.eventCount, 2);
  assert.equal(provenance.pageErrorCount, 1);
  assert.equal(provenance.consoleErrorCount, 1);
  assert.deepEqual(
    provenance.events.map(({ sequence, type, message }) => ({
      sequence,
      type,
      message,
    })),
    [
      { sequence: 1, type: "pageerror", message: "render exploded" },
      { sequence: 2, type: "console.error", message: "request failed" },
    ],
  );
  assert.deepEqual(provenance.events[1].location, {
    url: "http://127.0.0.1/app.tsx",
    lineNumber: 12,
    columnNumber: 4,
  });
  assert.match(stderr.join(""), /\[pageerror\].*render exploded/s);
  assert.match(stderr.join(""), /\[console\.error\] request failed/);

  page.emit("pageerror", new Error("too late"));
  assert.deepEqual(collector.stop(), provenance);
});

test("browser errors convert an otherwise complete benchmark to an error result", () => {
  const provenance = {
    ...emptyBrowserErrorProvenance(),
    eventCount: 1,
    consoleErrorCount: 1,
    events: [
      {
        sequence: 1,
        type: "console.error",
        name: null,
        message: "unexpected console failure",
        stack: null,
        location: null,
      },
    ],
  };
  const original = { status: "complete", errors: ["existing detail"] };
  const failed = failResultForBrowserErrors(original, provenance);

  assert.equal(original.status, "complete");
  assert.equal(failed.status, "error");
  assert.equal(failed.errors[0], "existing detail");
  assert.match(failed.errors[1], /1 unhandled error event/);
  assert.match(failed.errors[1], /unexpected console failure/);
});
