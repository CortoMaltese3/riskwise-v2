import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import logger, { newRequestId } from "../lib/logger.ts";

describe("newRequestId", () => {
  it("mints a UUID-shaped string per call and never repeats", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});

describe("logger", () => {
  beforeEach(() => {
    // Each test decides whether to expose a bridge; start clean so the
    // console fallback is the default.
    // eslint-disable-next-line no-undef
    delete window.logger;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards records to the bridge when available", () => {
    const log = vi.fn();
    // eslint-disable-next-line no-undef
    window.logger = { log };
    logger.info("hello", { request_id: "abc" });
    expect(log).toHaveBeenCalledWith({
      level: "info",
      message: "hello",
      context: { request_id: "abc" },
    });
  });

  it("supports debug/warn/error level channels", () => {
    const log = vi.fn();
    // eslint-disable-next-line no-undef
    window.logger = { log };
    logger.debug("d");
    logger.warn("w");
    logger.error("e");
    expect(log.mock.calls.map((c) => c[0].level)).toEqual(["debug", "warn", "error"]);
  });

  it("falls back to console when no bridge is present", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("no-bridge");
    expect(spy).toHaveBeenCalledWith("no-bridge");
  });

  it("falls back to console if the bridge throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // eslint-disable-next-line no-undef
    window.logger = {
      log: () => {
        throw new Error("boom");
      },
    };
    logger.error("bridge-down", { k: 1 });
    expect(spy).toHaveBeenCalledWith("bridge-down", { k: 1 });
  });
});
