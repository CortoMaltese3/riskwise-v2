import { describe, expect, it, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.resolve(here, "..", "..", "public", "dataPacks.js");

const { createRequire } = await import("node:module");
const requireCjs = createRequire(import.meta.url);
const { verifyPackSignature, scanAndImportPacks, PACK_EXTENSION, SIG_EXTENSION } =
  requireCjs(modulePath);

// Build a minisign-style keypair + sign function using crypto.generateKeyPairSync.
// Mirrors the helper in engineManifest.test.js so we exercise the same parsing
// path the production code uses, against a key we control.
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
      return `untrusted comment: signature\n${sigBlob.toString("base64")}\n`;
    },
  };
};

describe("verifyPackSignature", () => {
  it("accepts a correctly-signed pack and reports the matching key id", () => {
    const kp = buildFakeKeypair();
    const bytes = Buffer.from("simulated zip contents");
    const sigText = kp.sign(bytes);
    const result = verifyPackSignature(bytes, sigText, kp.pubKeyFile);
    expect(result.keyId).toBe(kp.keyId.toString("hex"));
  });

  it("rejects a pack whose bytes were tampered after signing", () => {
    const kp = buildFakeKeypair();
    const original = Buffer.from("original payload");
    const sigText = kp.sign(original);
    const tampered = Buffer.from("tampered payload");
    expect(() => verifyPackSignature(tampered, sigText, kp.pubKeyFile)).toThrow(
      /signature did not verify/
    );
  });

  it("rejects a pack signed with an unknown key", () => {
    const trusted = buildFakeKeypair();
    const attacker = buildFakeKeypair();
    const bytes = Buffer.from("payload");
    const sigText = attacker.sign(bytes);
    expect(() => verifyPackSignature(bytes, sigText, trusted.pubKeyFile)).toThrow(/unknown key/);
  });
});

describe("scanAndImportPacks", () => {
  let tmpRoot;
  let packsDir;
  let destRoot;
  let kp;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "riskwise-packs-"));
    packsDir = path.join(tmpRoot, "packs");
    destRoot = path.join(tmpRoot, "user-data");
    fs.mkdirSync(packsDir, { recursive: true });
    kp = buildFakeKeypair();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // Minimal in-memory ZIP encoder (store method, single file). Building
  // a real ZIP locally avoids two flaky paths in CI: Windows-bundled
  // `tar -a -c` mis-parses absolute paths starting with "C:" as remote
  // hosts ("Cannot connect to C: resolve failed"), and an extra
  // dependency just for tests would inflate the install graph.
  const crc32 = (buf) => {
    let crc = ~0 >>> 0;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return ~crc >>> 0;
  };

  const buildStoredZip = (filename, content) => {
    const data = Buffer.from(content);
    const nameBuf = Buffer.from(filename, "utf8");
    const crc = crc32(data);

    const lfh = Buffer.alloc(30 + nameBuf.length);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(0, 8); // method 0 = store
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0x21, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(data.length, 18);
    lfh.writeUInt32LE(data.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);
    nameBuf.copy(lfh, 30);

    const cdh = Buffer.alloc(46 + nameBuf.length);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(0, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0x21, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(data.length, 20);
    cdh.writeUInt32LE(data.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(0, 42);
    nameBuf.copy(cdh, 46);

    const lfhPlusData = Buffer.concat([lfh, data]);

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cdh.length, 12);
    eocd.writeUInt32LE(lfhPlusData.length, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([lfhPlusData, cdh, eocd]);
  };

  const writeMinimalPack = (name, payloadName, payloadContent) => {
    const packPath = path.join(packsDir, name);
    fs.writeFileSync(packPath, buildStoredZip(payloadName, payloadContent));
    return packPath;
  };

  it("extracts a correctly-signed pack into the user-data tree", () => {
    const packPath = writeMinimalPack(`valid${PACK_EXTENSION}`, "data.txt", "hello from the pack");
    const sigPath = `${packPath}${SIG_EXTENSION}`;
    fs.writeFileSync(sigPath, kp.sign(fs.readFileSync(packPath)));

    const results = scanAndImportPacks({
      packsDir,
      publicKeyText: kp.pubKeyFile,
      destRoot,
    });
    expect(results).toHaveLength(1);
    if (!results[0].ok) {
      throw new Error(`expected import to succeed but got: ${results[0].error}`);
    }
    expect(results[0].pack).toBe(`valid${PACK_EXTENSION}`);
    const extracted = path.join(destRoot, "valid", "data.txt");
    expect(fs.existsSync(extracted)).toBe(true);
    expect(fs.readFileSync(extracted, "utf8")).toBe("hello from the pack");
  });

  it("rejects a pack with a tampered signature without extracting it", () => {
    const packPath = writeMinimalPack(`bad${PACK_EXTENSION}`, "data.txt", "original");
    const sigPath = `${packPath}${SIG_EXTENSION}`;
    fs.writeFileSync(sigPath, kp.sign(Buffer.from("different bytes")));

    const results = scanAndImportPacks({
      packsDir,
      publicKeyText: kp.pubKeyFile,
      destRoot,
    });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toMatch(/did not verify/);
    expect(fs.existsSync(path.join(destRoot, "bad"))).toBe(false);
  });

  it("rejects a pack with no .minisig sidecar", () => {
    writeMinimalPack(`unsigned${PACK_EXTENSION}`, "data.txt", "x");
    const results = scanAndImportPacks({
      packsDir,
      publicKeyText: kp.pubKeyFile,
      destRoot,
    });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toMatch(/signature sidecar missing/);
  });

  it("returns an empty list when the packs directory does not exist", () => {
    const results = scanAndImportPacks({
      packsDir: path.join(tmpRoot, "nope"),
      publicKeyText: kp.pubKeyFile,
      destRoot,
    });
    expect(results).toEqual([]);
  });
});
