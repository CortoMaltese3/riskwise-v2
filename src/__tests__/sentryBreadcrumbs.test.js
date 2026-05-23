import { describe, it, expect, beforeEach, vi } from "vitest";
import electronLog from "electron-log";
import {
  createBreadcrumbTransport,
  resolveMinLevel,
  formatMessage,
  LEVEL_MAP,
} from "../../public/sentryBreadcrumbs.js";

const makeMessage = (level, data, date = new Date("2026-05-23T10:00:00Z")) => ({
  level,
  data,
  date,
});

let addBreadcrumb;
let sentry;
let isInit;

beforeEach(() => {
  addBreadcrumb = vi.fn();
  sentry = { addBreadcrumb };
  isInit = vi.fn(() => true);
});

describe("createBreadcrumbTransport", () => {
  it("forwards an info line as a breadcrumb with the mapped Sentry level", () => {
    const transport = createBreadcrumbTransport({
      isSentryInitialized: isInit,
      getSentry: () => sentry,
      minLevel: "info",
    });
    transport(makeMessage("info", ["hello world"]));
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    const crumb = addBreadcrumb.mock.calls[0][0];
    expect(crumb.category).toBe("log");
    expect(crumb.level).toBe("info");
    expect(crumb.message).toBe("hello world");
    expect(typeof crumb.timestamp).toBe("number");
  });

  it("maps electron-log levels to Sentry levels per acceptance criteria", () => {
    const transport = createBreadcrumbTransport({
      isSentryInitialized: isInit,
      getSentry: () => sentry,
      minLevel: "debug",
    });
    transport(makeMessage("debug", ["d"]));
    transport(makeMessage("info", ["i"]));
    transport(makeMessage("warn", ["w"]));
    transport(makeMessage("error", ["e"]));
    const levels = addBreadcrumb.mock.calls.map((c) => c[0].level);
    expect(levels).toEqual(["debug", "info", "warning", "error"]);
    // Sanity-check the public mapping table the issue specifies.
    expect(LEVEL_MAP.info).toBe("info");
    expect(LEVEL_MAP.warn).toBe("warning");
    expect(LEVEL_MAP.error).toBe("error");
    expect(LEVEL_MAP.debug).toBe("debug");
  });

  it("is a no-op when Sentry has not initialized", () => {
    isInit.mockReturnValue(false);
    const transport = createBreadcrumbTransport({
      isSentryInitialized: isInit,
      getSentry: () => sentry,
      minLevel: "info",
    });
    transport(makeMessage("error", ["boom"]));
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it("is a no-op when getSentry returns null (init_failed / no DSN)", () => {
    const transport = createBreadcrumbTransport({
      isSentryInitialized: isInit,
      getSentry: () => null,
      minLevel: "info",
    });
    transport(makeMessage("error", ["boom"]));
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it("drops records below the configured minimum level", () => {
    const transport = createBreadcrumbTransport({
      isSentryInitialized: isInit,
      getSentry: () => sentry,
      minLevel: "warn",
    });
    transport(makeMessage("debug", ["d"]));
    transport(makeMessage("info", ["i"]));
    transport(makeMessage("warn", ["w"]));
    transport(makeMessage("error", ["e"]));
    expect(addBreadcrumb).toHaveBeenCalledTimes(2);
    expect(addBreadcrumb.mock.calls.map((c) => c[0].level)).toEqual(["warning", "error"]);
  });

  it("defaults to INFO when minLevel is unset / unknown", () => {
    expect(resolveMinLevel(undefined)).toBe("info");
    expect(resolveMinLevel("")).toBe("info");
    expect(resolveMinLevel("nonsense")).toBe("info");
    expect(resolveMinLevel("WARN")).toBe("warn");
    expect(resolveMinLevel("warning")).toBe("warn");
  });

  it("never throws when Sentry.addBreadcrumb misbehaves", () => {
    sentry.addBreadcrumb = () => {
      throw new Error("network down");
    };
    const transport = createBreadcrumbTransport({
      isSentryInitialized: isInit,
      getSentry: () => sentry,
      minLevel: "info",
    });
    // Must not throw — the file/console transports still need to receive
    // this same line from electron-log's pipeline.
    expect(() => transport(makeMessage("info", ["ok"]))).not.toThrow();
  });

  it("renders objects, errors, and primitives in a single message string", () => {
    expect(formatMessage(["plain"])).toBe("plain");
    expect(formatMessage(["a", "b"])).toBe("a b");
    expect(formatMessage([{ k: 1 }])).toBe('{"k":1}');
    const err = new Error("boom");
    expect(formatMessage([err])).toMatch(/boom/);
    expect(formatMessage([null, undefined, 42])).toBe("null undefined 42");
  });

  it("sets transport.level for electron-log's pre-filter", () => {
    const transport = createBreadcrumbTransport({
      isSentryInitialized: isInit,
      getSentry: () => sentry,
      minLevel: "warn",
    });
    expect(transport.level).toBe("warn");
  });
});

describe("electron-log wired with the breadcrumb transport", () => {
  // Mirrors the production wiring in ``public/electron.js`` (see the
  // ``log.transports.sentry = createBreadcrumbTransport(...)`` block):
  // log.info from anywhere — including renderer lines that arrive via the
  // ``log:renderer`` IPC handler and get re-emitted with log[level](...) —
  // must reach Sentry.addBreadcrumb exactly once.
  it("forwards log.info / log.warn / log.error to Sentry breadcrumbs in one path", () => {
    const breadcrumbs = [];
    const fakeSentry = {
      addBreadcrumb: (b) => breadcrumbs.push(b),
    };
    // Silence the built-in transports so the test does not pollute stdout
    // or the cwd with rotated log files.
    electronLog.transports.console.level = false;
    electronLog.transports.file.level = false;
    electronLog.transports.sentry = createBreadcrumbTransport({
      isSentryInitialized: () => true,
      getSentry: () => fakeSentry,
      minLevel: "info",
    });

    electronLog.info("scenario.start", { jobId: "abc" });
    electronLog.warn("supervisor.slow");
    electronLog.error("backend.crashed");
    // Simulate the ``log:renderer`` IPC handler's re-emission path.
    electronLog.info("[renderer] click", { route: "/results" });

    const levels = breadcrumbs.map((b) => b.level);
    expect(levels).toEqual(["info", "warning", "error", "info"]);
    expect(breadcrumbs[0].message).toContain("scenario.start");
    expect(breadcrumbs[3].message).toContain("[renderer]");
    // Cleanup so other tests in this file get a clean slate.
    delete electronLog.transports.sentry;
  });
});
