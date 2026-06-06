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
  parseMinisignPublicKey,
  parseMinisignSignatureBlob,
  resolveReleaseChannel,
  updaterChannelFor,
  verifyEngineManifest,
} = requireCjs(modulePath);

const { blake2b512 } = requireCjs(path.resolve(here, "..", "..", "public", "blake2b.js"));

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
    // Prehashed (`ED`) minisign: sign the BLAKE2b-512 digest, not the raw
    // bytes. Mirrors what real minisign produces by default and exercises the
    // BoringSSL-incompatible path. The digest here is computed with Node's
    // native blake2b512, giving an independent reference for the vendored impl
    // the verifier uses.
    signPrehashed: (message) => {
      const digest = crypto.createHash("blake2b512").update(message).digest();
      const signature = crypto.sign(null, digest, privateKey);
      const sigBlob = Buffer.concat([Buffer.from("ED", "ascii"), keyId, signature]);
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

const signManifestPrehashed = (manifest, keypair) => {
  const { signature: _discard, ...rest } = manifest;
  const canonical = canonicalManifestBytes({ ...rest, signature: "" });
  return { ...rest, signature: keypair.signPrehashed(canonical) };
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

  // Regression for the first-launch "Digest method not supported" crash:
  // production manifests are signed with prehashed minisign (`ED`), whose
  // verification needs BLAKE2b-512. This exercises that path with the vendored
  // hash — the path that runs in Electron's BoringSSL where the native
  // blake2b512 is missing.
  it("accepts a prehashed (ED) signed manifest", () => {
    const kp = buildFakeKeypair();
    const signed = signManifestPrehashed(baseManifest, kp);
    const parsed = verifyEngineManifest(JSON.stringify(signed), kp.pubKeyFile);
    expect(parsed.version).toBe("2.0.1");
  });

  it("rejects a prehashed (ED) manifest tampered after signing", () => {
    const kp = buildFakeKeypair();
    const signed = signManifestPrehashed(baseManifest, kp);
    const tampered = { ...signed, download_url: "https://evil.example/engine.exe" };
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

describe("blake2b512 (vendored, BoringSSL-safe)", () => {
  // Official BLAKE2b-512 test vectors (RFC 7693 Appendix A / the BLAKE2 site).
  it("matches the known digest for the empty input", () => {
    expect(blake2b512(Buffer.alloc(0)).toString("hex")).toBe(
      "786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419" +
        "d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce"
    );
  });

  it('matches the known digest for "abc"', () => {
    expect(blake2b512(Buffer.from("abc")).toString("hex")).toBe(
      "ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d1" +
        "7d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923"
    );
  });

  it("agrees with the native blake2b512 across block boundaries", () => {
    // Cover the < 128B, == 128B (one full block), and multi-block cases so a
    // padding/counter bug can't hide behind small inputs.
    for (const len of [0, 1, 64, 127, 128, 129, 256, 1000]) {
      const data = crypto.randomBytes(len);
      const native = crypto.createHash("blake2b512").update(data).digest("hex");
      expect(blake2b512(data).toString("hex")).toBe(native);
    }
  });
});

describe("minisign blob parsers", () => {
  it("parseMinisignPublicKey rejects an empty file", () => {
    expect(() => parseMinisignPublicKey("untrusted comment: only\n")).toThrow(/empty/);
  });

  it("parseMinisignPublicKey rejects a wrong-length blob", () => {
    const tooShort = Buffer.from("Ed", "ascii").toString("base64");
    expect(() => parseMinisignPublicKey(tooShort)).toThrow(/Invalid minisign public key length/);
  });

  it("parseMinisignPublicKey rejects an unsupported algorithm tag", () => {
    const blob = Buffer.concat([
      Buffer.from("XX", "ascii"),
      Buffer.alloc(8),
      Buffer.alloc(32),
    ]).toString("base64");
    expect(() => parseMinisignPublicKey(blob)).toThrow(/Unsupported signature algorithm/);
  });

  it("parseMinisignSignatureBlob rejects an empty file", () => {
    expect(() => parseMinisignSignatureBlob("untrusted comment: only\n")).toThrow(/empty/);
  });

  it("parseMinisignSignatureBlob rejects a wrong-length blob", () => {
    const tooShort = Buffer.from("Ed", "ascii").toString("base64");
    expect(() => parseMinisignSignatureBlob(tooShort)).toThrow(/Invalid minisign signature length/);
  });

  it("parseMinisignSignatureBlob rejects an unsupported algorithm tag", () => {
    const blob = Buffer.concat([
      Buffer.from("XX", "ascii"),
      Buffer.alloc(8),
      Buffer.alloc(64),
    ]).toString("base64");
    expect(() => parseMinisignSignatureBlob(blob)).toThrow(/Unsupported signature algorithm/);
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

  it("updaterChannelFor maps stable → latest, identity otherwise", () => {
    // electron-builder publishes the stable channel as `latest.yml`; asking
    // for `stable.yml` 404s on every check (#537).
    expect(updaterChannelFor("stable")).toBe("latest");
    expect(updaterChannelFor("beta")).toBe("beta");
    expect(updaterChannelFor("internal")).toBe("internal");
  });
});
