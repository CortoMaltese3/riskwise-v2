import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.resolve(here, "..", "..", "public", "appUpdates.js");
const requireCjs = createRequire(import.meta.url);
const { shouldSuppressUpdate } = requireCjs(modulePath);

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
