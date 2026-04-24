import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.resolve(here, "..", "..", "public", "engineManifest.js");

// The helper is CommonJS; load it with require to keep parity with how
// electron.js will consume it at runtime.
const { createRequire } = await import("node:module");
const requireCjs = createRequire(import.meta.url);
const {
  canonicalManifestBytes,
  channelFromVersion,
  compareVersions,
  isEngineVersionCompatible,
  resolveReleaseChannel,
  verifyEngineManifest,
} = requireCjs(modulePath);

// Re-read to make it explicit this test actually reads the source file.
readFileSync(modulePath);

// Build a minisign-format public key and signature pair at test time so we
// exercise the same verification path electron.js runs in production, with
// keys we control. Uses legacy `Ed` mode (signs raw content), which is the
// simpler of the two minisign modes and avoids a Blake2b dependency in
// test environments.
const buildFakeKeypair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const rawPublicKey = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const keyId = crypto.randomBytes(8);
  const pubKeyBlob = Buffer.concat([Buffer.from("Ed", "ascii"), keyId, rawPublicKey]);
  const pubKeyFile = `untrusted comment: test key\n${pubKeyBlob.toString("base64")}\n`;
  return {
    privateKey,
    keyId,
    pubKeyFile,
    sign: (message) => {
      const signature = crypto.sign(null, message, privateKey);
      const sigBlob = Buffer.concat([Buffer.from("Ed", "ascii"), keyId, signature]);
      return sigBlob.toString("base64");
    },
  };
};

const signManifest = (manifest, keypair) => {
  const { signature: _discard, ...rest } = manifest;
  const withoutSig = { ...rest, signature: "" };
  const canonical = canonicalManifestBytes(withoutSig);
  return { ...rest, signature: keypair.sign(canonical) };
};

describe("canonicalManifestBytes", () => {
  it("sorts keys alphabetically and excludes signature", () => {
    const bytes = canonicalManifestBytes({
      sha256: "abc",
      version: "1.0.0",
      download_url: "https://example/engine.exe",
      signature: "IGNORED",
      min_app_version: "1.0.0",
      max_app_version: "2.0.0",
    });
    const parsed = JSON.parse(bytes.toString("utf8"));
    expect(Object.keys(parsed)).toEqual([
      "download_url",
      "max_app_version",
      "min_app_version",
      "sha256",
      "version",
    ]);
    expect(parsed).not.toHaveProperty("signature");
  });

  it("produces identical bytes regardless of input key order", () => {
    const a = canonicalManifestBytes({ b: 1, a: 2, signature: "x" });
    const b = canonicalManifestBytes({ a: 2, signature: "y", b: 1 });
    expect(a.equals(b)).toBe(true);
  });
});

describe("verifyEngineManifest", () => {
  const baseManifest = {
    version: "2.0.1",
    sha256: "0".repeat(64),
    download_url: "https://example.com/riskwise-engine.exe",
    min_app_version: "2.0.0",
    max_app_version: "2.1.0",
  };

  it("accepts a correctly-signed manifest and returns the parsed object", () => {
    const kp = buildFakeKeypair();
    const signed = signManifest(baseManifest, kp);
    const parsed = verifyEngineManifest(JSON.stringify(signed), kp.pubKeyFile);
    expect(parsed.version).toBe("2.0.1");
    expect(parsed.sha256).toBe("0".repeat(64));
  });

  it("rejects a manifest whose content was tampered after signing", () => {
    const kp = buildFakeKeypair();
    const signed = signManifest(baseManifest, kp);
    const tampered = { ...signed, sha256: "1".repeat(64) };
    expect(() => verifyEngineManifest(JSON.stringify(tampered), kp.pubKeyFile)).toThrow(
      /signature did not verify/
    );
  });

  it("rejects a manifest signed with an unknown key", () => {
    const attacker = buildFakeKeypair();
    const trusted = buildFakeKeypair();
    const signed = signManifest(baseManifest, attacker);
    expect(() => verifyEngineManifest(JSON.stringify(signed), trusted.pubKeyFile)).toThrow(
      /unknown key/
    );
  });

  it("rejects a manifest missing required fields", () => {
    const kp = buildFakeKeypair();
    const incomplete = { version: "2.0.1", signature: "x" };
    expect(() => verifyEngineManifest(JSON.stringify(incomplete), kp.pubKeyFile)).toThrow(
      /missing required field/
    );
  });

  it("rejects non-JSON input", () => {
    const kp = buildFakeKeypair();
    expect(() => verifyEngineManifest("not json", kp.pubKeyFile)).toThrow(/not valid JSON/);
  });
});

describe("version helpers", () => {
  it("compareVersions orders major.minor.patch numerically", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.2.0", "1.10.0")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("v2.0.1", "2.0.0")).toBeGreaterThan(0);
    expect(compareVersions("2.0.1-beta.1", "2.0.1")).toBe(0);
  });

  it("isEngineVersionCompatible enforces inclusive min/max bounds", () => {
    const manifest = { min_app_version: "2.0.0", max_app_version: "2.1.0" };
    expect(isEngineVersionCompatible("2.0.0", manifest)).toBe(true);
    expect(isEngineVersionCompatible("2.0.5", manifest)).toBe(true);
    expect(isEngineVersionCompatible("2.1.0", manifest)).toBe(true);
    expect(isEngineVersionCompatible("1.9.0", manifest)).toBe(false);
    expect(isEngineVersionCompatible("2.2.0", manifest)).toBe(false);
    expect(isEngineVersionCompatible("2.0.0", {})).toBe(false);
  });
});

describe("channel detection", () => {
  it("channelFromVersion maps tag suffix → channel", () => {
    expect(channelFromVersion("2.0.1")).toBe("stable");
    expect(channelFromVersion("v2.0.1")).toBe("stable");
    expect(channelFromVersion("2.0.1-beta.1")).toBe("beta");
    expect(channelFromVersion("2.0.1-internal.3")).toBe("internal");
    expect(channelFromVersion("2.0.1-rc.1")).toBe("stable"); // unknown → stable
  });

  it("resolveReleaseChannel prefers the env override when valid", () => {
    expect(resolveReleaseChannel("beta", "2.0.1")).toBe("beta");
    expect(resolveReleaseChannel("bogus", "2.0.1-beta.1")).toBe("beta");
    expect(resolveReleaseChannel("", "2.0.1")).toBe("stable");
    expect(resolveReleaseChannel(undefined, "2.0.1-internal.2")).toBe("internal");
  });
});
