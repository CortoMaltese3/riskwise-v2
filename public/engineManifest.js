// Engine-manifest signing & verification helpers (issue #115, Area 13).
//
// The release pipeline publishes `engine-manifest.json` alongside
// `riskwise-engine.exe`. The manifest is signed with an offline minisign
// Ed25519 key whose public half ships in the app bundle
// (`resources/engine-manifest.pub`). Trusting the embedded `sha256` before
// verifying the signature would let a release-account compromise push a
// malicious engine to every user — verify first, hash second.
//
// This module is pure Node (no Electron APIs) so it can be unit-tested
// from vitest without a full Electron harness.

const crypto = require("node:crypto");

const ED25519_SPKI_DER_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const MINISIGN_PUBKEY_LEN = 42; // 2-byte alg + 8-byte keyId + 32-byte pubkey
const MINISIGN_SIG_LEN = 74; // 2-byte alg + 8-byte keyId + 64-byte signature

const REQUIRED_MANIFEST_FIELDS = [
  "version",
  "sha256",
  "download_url",
  "min_app_version",
  "max_app_version",
  "signature",
];

const parseMinisignPublicKey = (pubKeyFileText) => {
  const lines = pubKeyFileText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("untrusted comment:"));
  if (lines.length === 0) {
    throw new Error("Public key file is empty");
  }
  const blob = Buffer.from(lines[lines.length - 1], "base64");
  if (blob.length !== MINISIGN_PUBKEY_LEN) {
    throw new Error(`Invalid minisign public key length: ${blob.length}`);
  }
  const sigAlg = blob.subarray(0, 2).toString("ascii");
  if (sigAlg !== "Ed" && sigAlg !== "ED") {
    throw new Error(`Unsupported signature algorithm: ${sigAlg}`);
  }
  return {
    sigAlg,
    keyId: blob.subarray(2, 10),
    publicKey: blob.subarray(10, 42),
  };
};

const parseMinisignSignatureBlob = (base64OrFileText) => {
  // Accept either the raw base64 signature line or the full .minisig file
  // (which has an untrusted-comment line, a base64 signature, a trusted
  // comment, and a global signature — we only need the first signature).
  const lines = base64OrFileText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("untrusted comment:") && !line.startsWith("trusted comment:"));
  if (lines.length === 0) {
    throw new Error("Signature blob is empty");
  }
  const blob = Buffer.from(lines[0], "base64");
  if (blob.length !== MINISIGN_SIG_LEN) {
    throw new Error(`Invalid minisign signature length: ${blob.length}`);
  }
  const sigAlg = blob.subarray(0, 2).toString("ascii");
  if (sigAlg !== "Ed" && sigAlg !== "ED") {
    throw new Error(`Unsupported signature algorithm: ${sigAlg}`);
  }
  return {
    sigAlg,
    keyId: blob.subarray(2, 10),
    signature: blob.subarray(10, 74),
  };
};

const ed25519PublicKeyFromRaw = (rawKey) =>
  crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_DER_PREFIX, rawKey]),
    format: "der",
    type: "spki",
  });

// Verify a parsed minisign signature against arbitrary bytes. Used by
// both the engine-manifest (canonical-JSON bytes) and signed data-pack
// (raw file bytes) verifiers — extracting the shared core keeps the
// `Ed` vs prehashed branch in one place.
const verifyMinisignSignature = (messageBytes, sigText, publicKeyFileText) => {
  const pubKey = parseMinisignPublicKey(publicKeyFileText);
  const sig = parseMinisignSignatureBlob(sigText);
  if (!sig.keyId.equals(pubKey.keyId)) {
    throw new Error("Signed with an unknown key");
  }
  const toVerify =
    sig.sigAlg === "Ed"
      ? messageBytes
      : crypto.createHash("blake2b512").update(messageBytes).digest();
  const keyObj = ed25519PublicKeyFromRaw(pubKey.publicKey);
  const ok = crypto.verify(null, toVerify, keyObj, sig.signature);
  if (!ok) {
    throw new Error("Signature did not verify");
  }
  return { keyId: pubKey.keyId.toString("hex") };
};

// Canonical serialization: keys sorted alphabetically, no whitespace, no
// signature field. Signing and verifying must use the same representation
// — a single whitespace difference invalidates the signature.
const canonicalManifestBytes = (manifest) => {
  const entries = Object.entries(manifest)
    .filter(([key]) => key !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonical = {};
  for (const [key, value] of entries) {
    canonical[key] = value;
  }
  return Buffer.from(JSON.stringify(canonical), "utf8");
};

const verifyEngineManifest = (manifestText, publicKeyFileText) => {
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (err) {
    throw new Error(`Manifest is not valid JSON: ${err.message}`);
  }
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!(field in manifest)) {
      throw new Error(`Manifest is missing required field: ${field}`);
    }
  }
  try {
    verifyMinisignSignature(canonicalManifestBytes(manifest), manifest.signature, publicKeyFileText);
  } catch (err) {
    if (/unknown key/i.test(err.message)) {
      throw new Error("Manifest was signed with an unknown key");
    }
    if (/did not verify/i.test(err.message)) {
      throw new Error("Manifest signature did not verify");
    }
    throw err;
  }
  return manifest;
};

// SemVer-lite comparator sufficient for engine-version gating. Strips a
// leading `v`, drops prerelease tags, then compares major/minor/patch
// numerically. Returns -1/0/1 like Array.prototype.sort.
const compareVersions = (a, b) => {
  const parse = (v) =>
    String(v)
      .trim()
      .replace(/^v/, "")
      .split("-")[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj < bMaj ? -1 : 1;
  if (aMin !== bMin) return aMin < bMin ? -1 : 1;
  if (aPat !== bPat) return aPat < bPat ? -1 : 1;
  return 0;
};

const isEngineVersionCompatible = (appVersion, manifest) => {
  if (!manifest || !manifest.min_app_version || !manifest.max_app_version) {
    return false;
  }
  return (
    compareVersions(appVersion, manifest.min_app_version) >= 0 &&
    compareVersions(appVersion, manifest.max_app_version) <= 0
  );
};

// Derive the release channel from either an explicit env var (set by the
// release workflow after parsing the git tag) or the app's own version
// string. `v2.0.1-beta.1` → beta, `v2.0.1-internal.1` → internal, else
// stable. Keep the allowlist small — electron-builder refuses to publish
// to channels it doesn't know.
const ALLOWED_CHANNELS = ["stable", "beta", "internal"];

const channelFromVersion = (version) => {
  const v = String(version || "").toLowerCase();
  const match = v.match(/-([a-z]+)(?:\.\d+)?$/);
  if (!match) return "stable";
  const tag = match[1];
  return ALLOWED_CHANNELS.includes(tag) ? tag : "stable";
};

const resolveReleaseChannel = (envChannel, appVersion) => {
  if (envChannel && ALLOWED_CHANNELS.includes(envChannel)) {
    return envChannel;
  }
  return channelFromVersion(appVersion);
};

module.exports = {
  ALLOWED_CHANNELS,
  ED25519_SPKI_DER_PREFIX,
  canonicalManifestBytes,
  channelFromVersion,
  compareVersions,
  ed25519PublicKeyFromRaw,
  isEngineVersionCompatible,
  parseMinisignPublicKey,
  parseMinisignSignatureBlob,
  resolveReleaseChannel,
  verifyEngineManifest,
  verifyMinisignSignature,
};
