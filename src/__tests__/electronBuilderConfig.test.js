import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(here, "..", "..", "electron-builder.cjs");

// The config is CommonJS; load it with require to match how electron-builder
// consumes it.
const { createRequire } = await import("node:module");
const requireCjs = createRequire(import.meta.url);
const config = requireCjs(configPath);

// The engine data trees the runtime provisions next to the downloaded engine.
const ENGINE_DATA_TREES = ["data", "countries", "requirements"];

describe("electron-builder asar packaging (#538)", () => {
  it("enables asar so the ~52k node_modules files collapse into one blob", () => {
    expect(config.asar).toBe(true);
  });

  it("unpacks native addons so they load from a real path, not inside asar", () => {
    expect(config.asarUnpack).toContain("**/*.node");
  });

  it("keeps the engine data trees OUT of `files` (fs.cpSync can't read them from asar)", () => {
    const files = config.files.join("\n");
    for (const tree of ENGINE_DATA_TREES) {
      // Neither `data/` nor `data/**/*` style entries should reference the trees.
      expect(files).not.toMatch(new RegExp(`(^|\\n)${tree}(/|$)`));
    }
  });

  it("ships the data trees + resources as real files via extraResources", () => {
    const targets = config.extraResources.map((entry) => entry.to);
    expect(targets).toEqual(expect.arrayContaining(["resources", ...ENGINE_DATA_TREES]));
  });
});
