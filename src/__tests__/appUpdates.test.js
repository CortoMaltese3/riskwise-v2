import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.resolve(here, "..", "..", "public", "appUpdates.js");
const requireCjs = createRequire(import.meta.url);
const { shouldSuppressUpdate, shouldBlockCloseForDownload, resolveDowngradeTarget } =
  requireCjs(modulePath);

// Build a history entry with an installer that "exists" by default. Tests opt
// into a missing installer via `installerPath` pointing at a path the injected
// `fileExists` reports false for.
const entry = (version, overrides = {}) => ({
  version,
  installerPath: `C:/cache/${version}.exe`,
  channel: "stable",
  downloadedAt: `2025-01-01T00:00:00.000Z`,
  ...overrides,
});

// Default injected existence check: every installerPath exists unless the test
// passes a specific set of "missing" paths.
const existsExcept = (missing = []) => {
  const missingSet = new Set(missing);
  return (p) => !missingSet.has(p);
};

describe("shouldSuppressUpdate (issue #424)", () => {
  it("passes through when nothing is skipped", () => {
    expect(shouldSuppressUpdate("2.0.0", null)).toEqual({
      suppress: false,
      clearSkip: false,
    });
    expect(shouldSuppressUpdate("2.0.0", "")).toEqual({
      suppress: false,
      clearSkip: false,
    });
  });

  it("suppresses when incoming version equals the skipped version", () => {
    expect(shouldSuppressUpdate("2.0.0", "2.0.0")).toEqual({
      suppress: true,
      clearSkip: false,
    });
  });

  it("clears the skip and proceeds when incoming version is higher", () => {
    expect(shouldSuppressUpdate("2.0.1", "2.0.0")).toEqual({
      suppress: false,
      clearSkip: true,
    });
  });

  it("does not suppress when incoming version is lower than the skip", () => {
    expect(shouldSuppressUpdate("1.9.0", "2.0.0")).toEqual({
      suppress: false,
      clearSkip: false,
    });
  });

  it("ignores a leading v on either side", () => {
    expect(shouldSuppressUpdate("v2.0.0", "2.0.0")).toEqual({
      suppress: true,
      clearSkip: false,
    });
    expect(shouldSuppressUpdate("2.0.1", "v2.0.0")).toEqual({
      suppress: false,
      clearSkip: true,
    });
  });
});

describe("shouldBlockCloseForDownload", () => {
  it("does not block when no download is in progress", () => {
    expect(shouldBlockCloseForDownload(false, false)).toBe(false);
  });

  it("blocks the first close while a download is in progress", () => {
    expect(shouldBlockCloseForDownload(true, false)).toBe(true);
  });

  it("lets the close through once the user confirmed Quit anyway", () => {
    expect(shouldBlockCloseForDownload(true, true)).toBe(false);
  });
});

describe("resolveDowngradeTarget (issue #564)", () => {
  const fileExists = existsExcept();

  it("returns null for empty history", () => {
    expect(resolveDowngradeTarget([], "2.1.0", { fileExists })).toBeNull();
  });

  it("returns null when given a non-array history", () => {
    expect(resolveDowngradeTarget(null, "2.1.0", { fileExists })).toBeNull();
    expect(resolveDowngradeTarget(undefined, "2.1.0", { fileExists })).toBeNull();
  });

  it("returns null when every entry is newer than or equal to the current version", () => {
    const history = [entry("2.1.0"), entry("2.2.0")];
    expect(resolveDowngradeTarget(history, "2.1.0", { fileExists })).toBeNull();
  });

  it("returns the single older entry when only one qualifies", () => {
    const target = entry("2.0.0");
    const result = resolveDowngradeTarget([target, entry("2.3.0")], "2.1.0", { fileExists });
    expect(result).toEqual(target);
  });

  it("returns the highest older version when multiple qualify, regardless of order", () => {
    const history = [entry("1.9.0"), entry("2.0.5"), entry("1.5.0")];
    const result = resolveDowngradeTarget(history, "2.1.0", { fileExists });
    expect(result.version).toBe("2.0.5");
  });

  it("skips an older entry whose installer file is missing", () => {
    const present = entry("1.9.0");
    const missing = entry("2.0.5"); // higher, but its file is gone
    const result = resolveDowngradeTarget([present, missing], "2.1.0", {
      fileExists: existsExcept([missing.installerPath]),
    });
    expect(result).toEqual(present);
  });

  it("returns null when the only older entry's installer is missing", () => {
    const missing = entry("2.0.0");
    const result = resolveDowngradeTarget([missing], "2.1.0", {
      fileExists: existsExcept([missing.installerPath]),
    });
    expect(result).toBeNull();
  });

  it("ignores entries on a different channel when a channel is given", () => {
    const beta = entry("2.0.5", { channel: "beta" });
    const stable = entry("2.0.0", { channel: "stable" });
    const result = resolveDowngradeTarget([beta, stable], "2.1.0", {
      channel: "stable",
      fileExists,
    });
    expect(result).toEqual(stable);
  });

  it("skips entries missing version or installerPath", () => {
    const history = [{ version: "2.0.0" }, { installerPath: "C:/cache/x.exe" }, entry("1.9.0")];
    const result = resolveDowngradeTarget(history, "2.1.0", { fileExists });
    expect(result.version).toBe("1.9.0");
  });
});
