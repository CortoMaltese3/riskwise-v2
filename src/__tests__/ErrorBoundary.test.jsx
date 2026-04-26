import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

// Mock the logger module so we can assert ErrorBoundary routes diagnostics
// through it (issue #46 — Phase 1 Area 17). The mock has to be set up
// before the SUT is imported, so we import ErrorBoundary lazily below.
vi.mock("../lib/logger.ts", () => {
  const error = vi.fn();
  return {
    __esModule: true,
    default: { error },
    logger: { error },
  };
});

const Boom = () => {
  throw new Error("kaboom");
};

let ErrorBoundary;
let logger;

beforeEach(async () => {
  ({ default: ErrorBoundary } = await import("../components/errors/ErrorBoundary.jsx"));
  ({ default: logger } = await import("../lib/logger.ts"));
  logger.error.mockClear();
  // React logs the caught error to console.error itself; silence it so the
  // test output stays clean without disabling the boundary's own behavior.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("invokes the logger with errorId, error message, and component stack", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [message, context] = logger.error.mock.calls[0];
    expect(message).toBe("[ErrorBoundary] caught render error");
    expect(context).toEqual(
      expect.objectContaining({
        errorId: expect.any(String),
        error: "kaboom",
        componentStack: expect.any(String),
      })
    );
    expect(context.errorId.length).toBeGreaterThan(0);
    expect(context.componentStack).toContain("Boom");
  });
});
