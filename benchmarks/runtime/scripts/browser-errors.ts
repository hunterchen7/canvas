const BROWSER_ERROR_POLICY = "fail-on-any";

function normalizedLocation(location) {
  if (!location || typeof location !== "object") return null;
  const url = typeof location.url === "string" ? location.url : "";
  const lineNumber = Number.isInteger(location.lineNumber)
    ? location.lineNumber
    : null;
  const columnNumber = Number.isInteger(location.columnNumber)
    ? location.columnNumber
    : null;
  if (!url && lineNumber == null && columnNumber == null) return null;
  return { url, lineNumber, columnNumber };
}

function pageErrorEvent(error, sequence) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error?.message === "string"
        ? error.message
        : String(error);
  return {
    sequence,
    type: "pageerror",
    name:
      typeof error?.name === "string" && error.name.length > 0
        ? error.name
        : "Error",
    message,
    stack: typeof error?.stack === "string" ? error.stack : null,
    location: null,
  };
}

function consoleErrorEvent(message, sequence) {
  let location = null;
  try {
    location = normalizedLocation(message.location());
  } catch {
    // Some Playwright message implementations do not expose a location.
  }
  return {
    sequence,
    type: "console.error",
    name: null,
    message: message.text(),
    stack: null,
    location,
  };
}

export function emptyBrowserErrorProvenance() {
  return {
    policy: BROWSER_ERROR_POLICY,
    eventCount: 0,
    pageErrorCount: 0,
    consoleErrorCount: 0,
    events: [],
  };
}

function provenanceFor(events) {
  return {
    policy: BROWSER_ERROR_POLICY,
    eventCount: events.length,
    pageErrorCount: events.filter((event) => event.type === "pageerror").length,
    consoleErrorCount: events.filter((event) => event.type === "console.error")
      .length,
    events: events.map((event) => ({
      ...event,
      location: event.location ? { ...event.location } : null,
    })),
  };
}

export function createBrowserErrorCollector(
  page,
  { stderr = process.stderr }: any = {},
) {
  if (!page || typeof page.on !== "function" || typeof page.off !== "function") {
    throw new Error("createBrowserErrorCollector requires a Playwright Page");
  }
  const events = [];
  let stopped = false;

  const record = (event) => {
    if (stopped) return;
    events.push(event);
    const detail = event.stack ?? event.message;
    stderr?.write?.(`[${event.type}] ${detail}\n`);
  };
  const onPageError = (error) => {
    record(pageErrorEvent(error, events.length + 1));
  };
  const onConsole = (message) => {
    if (message.type() === "error") {
      record(consoleErrorEvent(message, events.length + 1));
    }
  };

  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  return {
    stop() {
      if (!stopped) {
        stopped = true;
        page.off("pageerror", onPageError);
        page.off("console", onConsole);
      }
      return provenanceFor(events);
    },
  };
}

export function browserErrorFailure(provenance) {
  const first = provenance?.events?.[0];
  const count = provenance?.eventCount ?? 0;
  const suffix = first ? `; first was ${first.type}: ${first.message}` : "";
  return new Error(
    `Browser emitted ${count} unhandled error event${count === 1 ? "" : "s"}${suffix}`,
  );
}

export function failResultForBrowserErrors(result, provenance) {
  if (!result || typeof result !== "object" || provenance.eventCount === 0) {
    return result;
  }
  const failure = browserErrorFailure(provenance).message;
  const errors = Array.isArray(result.errors) ? result.errors : [];
  return {
    ...result,
    status: "error",
    errors: errors.includes(failure) ? [...errors] : [...errors, failure],
  };
}

export function assertBrowserErrorFree(result) {
  const provenance = result?.execution?.browserErrors;
  if (
    !provenance ||
    provenance.policy !== BROWSER_ERROR_POLICY ||
    !Number.isSafeInteger(provenance.eventCount) ||
    !Number.isSafeInteger(provenance.pageErrorCount) ||
    !Number.isSafeInteger(provenance.consoleErrorCount) ||
    !Array.isArray(provenance.events)
  ) {
    throw new Error(
      "Runtime result is missing fail-closed execution.browserErrors provenance",
    );
  }
  if (provenance.eventCount !== provenance.events.length) {
    throw new Error(
      "Runtime result execution.browserErrors count does not match its events",
    );
  }
  const pageErrorCount = provenance.events.filter(
    (event) => event?.type === "pageerror",
  ).length;
  const consoleErrorCount = provenance.events.filter(
    (event) => event?.type === "console.error",
  ).length;
  if (
    provenance.pageErrorCount !== pageErrorCount ||
    provenance.consoleErrorCount !== consoleErrorCount ||
    provenance.eventCount !== pageErrorCount + consoleErrorCount
  ) {
    throw new Error(
      "Runtime result execution.browserErrors type counts do not match its events",
    );
  }
  if (provenance.eventCount > 0) {
    throw browserErrorFailure(provenance);
  }
  return true;
}
