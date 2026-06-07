import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(here, "..", "..", "electron-builder.cjs");

// The config is CommonJS; load it with require to match how electron-builder
// consumes it.
const { createRequire } = await import("node:module");
const requireCjs = createRequire(import.meta.url);
const config = requireCjs(configPath);

// electron-builder.cjs reads process.env at require-time, so to exercise the
// signed/unsigned branches we clear the require cache and reload under a
// controlled env.
const loadConfigWithEnv = (env) => {
  const saved = {};
  const keys = ["AZURE_CLIENT_ID", "AZURE_PUBLISHER_NAME"];
  for (const k of keys) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    delete requireCjs.cache[requireCjs.resolve(configPath)];
    return requireCjs(configPath);
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    delete requireCjs.cache[requireCjs.resolve(configPath)];
  }
};

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

// Auto-update signature gating: `publisherName` must only ship when the build
// is actually signed, otherwise the installed app rejects every (unsigned)
// update as "not signed by the application owner".
describe("electron-builder code-signing gating", () => {
  afterEach(() => {
    delete requireCjs.cache[requireCjs.resolve(configPath)];
  });

  it("omits publisherName on an unsigned build (no AZURE_CLIENT_ID)", () => {
    const cfg = loadConfigWithEnv({
      AZURE_CLIENT_ID: undefined,
      AZURE_PUBLISHER_NAME: "SWORD Services Greece",
    });
    expect(cfg.win.publisherName).toBeUndefined();
    expect(cfg.win.azureSignOptions).toBeUndefined();
  });

  it("embeds publisherName + azureSignOptions when signing is enabled", () => {
    const cfg = loadConfigWithEnv({
      AZURE_CLIENT_ID: "client-id",
      AZURE_PUBLISHER_NAME: "SWORD Services Greece",
    });
    expect(cfg.win.publisherName).toBe("SWORD Services Greece");
    expect(cfg.win.azureSignOptions).toMatchObject({
      publisherName: "SWORD Services Greece",
    });
  });
});
