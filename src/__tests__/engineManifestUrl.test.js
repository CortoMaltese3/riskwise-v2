import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.resolve(here, "..", "..", "public", "engineManifest.js");

// The helper is CommonJS; load it with require to keep parity with how
// electron.js consumes it at runtime.
const { createRequire } = await import("node:module");
const requireCjs = createRequire(import.meta.url);
const {
  DEFAULT_ENGINE_RELEASE_TAG,
  ENGINE_RELEASE_TAG_ENV,
  engineManifestUrl,
  resolveEngineReleaseTag,
} = requireCjs(modulePath);

const OWNER = "CortoMaltese3";
const REPO = "riskwise-v2";

describe("resolveEngineReleaseTag", () => {
  it("defaults to engine-stable when no env override is present", () => {
    expect(DEFAULT_ENGINE_RELEASE_TAG).toBe("engine-stable");
    expect(resolveEngineReleaseTag({})).toBe("engine-stable");
    expect(resolveEngineReleaseTag()).toBe("engine-stable");
  });

  it("honours the env override when set", () => {
    const env = { [ENGINE_RELEASE_TAG_ENV]: "engine-staging" };
    expect(resolveEngineReleaseTag(env)).toBe("engine-staging");
  });

  it("trims surrounding whitespace from the override", () => {
    const env = { [ENGINE_RELEASE_TAG_ENV]: "  engine-rc1  " };
    expect(resolveEngineReleaseTag(env)).toBe("engine-rc1");
  });

  it("falls back to the default for blank or whitespace-only overrides", () => {
    expect(resolveEngineReleaseTag({ [ENGINE_RELEASE_TAG_ENV]: "" })).toBe("engine-stable");
    expect(resolveEngineReleaseTag({ [ENGINE_RELEASE_TAG_ENV]: "   " })).toBe("engine-stable");
  });
});

describe("engineManifestUrl", () => {
  it("pins the URL to the given release tag, never 'latest'", () => {
    const url = engineManifestUrl(OWNER, REPO, DEFAULT_ENGINE_RELEASE_TAG);
    expect(url).toBe(
      "https://github.com/CortoMaltese3/riskwise-v2/releases/download/engine-stable/engine-manifest.json"
    );
    expect(url).not.toContain("/latest/");
  });

  it("reflects a custom tag in the path", () => {
    expect(engineManifestUrl(OWNER, REPO, "engine-staging")).toBe(
      "https://github.com/CortoMaltese3/riskwise-v2/releases/download/engine-staging/engine-manifest.json"
    );
  });

  it("composes with resolveEngineReleaseTag for the end-to-end resolution", () => {
    const env = { [ENGINE_RELEASE_TAG_ENV]: "engine-rc1" };
    const url = engineManifestUrl(OWNER, REPO, resolveEngineReleaseTag(env));
    expect(url).toBe(
      "https://github.com/CortoMaltese3/riskwise-v2/releases/download/engine-rc1/engine-manifest.json"
    );
  });
});
