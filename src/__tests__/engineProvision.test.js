import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.resolve(here, "..", "..", "public", "engineProvision.js");

// The helper is CommonJS; load it with require to match how electron.js
// consumes it at runtime.
const { createRequire } = await import("node:module");
const requireCjs = createRequire(import.meta.url);
const { provisionEngineData, ENGINE_DATA_TREES, EngineDataProvisionError } = requireCjs(modulePath);

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "engine-provision-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

// Build a fake bundled-app root with one marker file per shipped tree.
const makeBundle = (root, trees = ENGINE_DATA_TREES) => {
  for (const tree of trees) {
    const dir = path.join(root, tree);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${tree}.txt`), tree);
  }
};

describe("provisionEngineData", () => {
  it("copies every shipped tree into an empty engine dir", () => {
    const bundle = path.join(tmp, "bundle");
    const engine = path.join(tmp, "engine");
    makeBundle(bundle);
    fs.mkdirSync(engine, { recursive: true });

    const result = provisionEngineData(bundle, engine);

    expect(result.copied.sort()).toEqual([...ENGINE_DATA_TREES].sort());
    expect(result.skipped).toEqual([]);
    for (const tree of ENGINE_DATA_TREES) {
      expect(fs.readFileSync(path.join(engine, tree, `${tree}.txt`), "utf8")).toBe(tree);
    }
  });

  it("is idempotent and never wipes a tree the user already has", () => {
    const bundle = path.join(tmp, "bundle");
    const engine = path.join(tmp, "engine");
    makeBundle(bundle);
    // Simulate a prior install / engine-only update: data already present with
    // a user-visible marker that must survive re-provisioning.
    fs.mkdirSync(path.join(engine, "data"), { recursive: true });
    fs.writeFileSync(path.join(engine, "data", "keep.txt"), "keep");

    const result = provisionEngineData(bundle, engine);

    expect(result.skipped).toContain("data");
    expect(result.copied.sort()).toEqual(["countries", "requirements"]);
    // Existing data tree left untouched — not clobbered by the bundled copy.
    expect(fs.readFileSync(path.join(engine, "data", "keep.txt"), "utf8")).toBe("keep");
    expect(fs.existsSync(path.join(engine, "data", "data.txt"))).toBe(false);
  });

  it("throws a clear error naming a missing source tree", () => {
    const bundle = path.join(tmp, "bundle");
    const engine = path.join(tmp, "engine");
    // Bundle everything except `countries/`.
    makeBundle(
      bundle,
      ENGINE_DATA_TREES.filter((t) => t !== "countries")
    );
    fs.mkdirSync(engine, { recursive: true });

    expect(() => provisionEngineData(bundle, engine)).toThrow(EngineDataProvisionError);
    expect(() => provisionEngineData(bundle, engine)).toThrow(/countries/);
  });
});
