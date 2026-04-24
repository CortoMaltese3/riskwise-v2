// Signed data-pack import. Verifies a `.riskwise-pack` (ZIP) against
// its sidecar `.minisig` using the engine-manifest public key, then
// extracts to `userData/user-data/<pack-stem>/`. Verifying before
// extraction matters: trusting the ZIP first would let anyone with
// file-system write access ship arbitrary trees into user-data.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const { verifyMinisignSignature } = require("./engineManifest");

const PACK_EXTENSION = ".riskwise-pack";
const SIG_EXTENSION = ".minisig";

const NULL_LOGGER = { info() {}, warn() {}, error() {} };

const sha256OfBuffer = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

const verifyPackSignature = (packBytes, sigText, pubKeyFileText) => {
  try {
    return verifyMinisignSignature(packBytes, sigText, pubKeyFileText);
  } catch (err) {
    if (/unknown key/i.test(err.message)) {
      throw new Error("Pack was signed with an unknown key");
    }
    if (/did not verify/i.test(err.message)) {
      throw new Error("Pack signature did not verify");
    }
    throw err;
  }
};

// Pure-Node ZIP extractor — supports store (method 0) and deflate (method 8).
// Avoids shelling out to tar/unzip so the same code path runs on every OS
// without worrying about GNU tar vs bsdtar vs MSYS2 path-handling differences.
const extractZip = (zipBuf, destDir) => {
  let pos = zipBuf.length - 22;
  while (pos >= 0) {
    if (zipBuf.readUInt32LE(pos) === 0x06054b50) break;
    pos--;
  }
  if (pos < 0) throw new Error("ZIP EOCD not found");

  const cdCount = zipBuf.readUInt16LE(pos + 10);
  let cdOffset = zipBuf.readUInt32LE(pos + 16);

  for (let i = 0; i < cdCount; i++) {
    if (zipBuf.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error("Bad central directory");
    const method = zipBuf.readUInt16LE(cdOffset + 10);
    const compSize = zipBuf.readUInt32LE(cdOffset + 20);
    const uncompSize = zipBuf.readUInt32LE(cdOffset + 24);
    const nameLen = zipBuf.readUInt16LE(cdOffset + 28);
    const extraLen = zipBuf.readUInt16LE(cdOffset + 30);
    const commentLen = zipBuf.readUInt16LE(cdOffset + 32);
    const lfhOffset = zipBuf.readUInt32LE(cdOffset + 42);
    const name = zipBuf.toString("utf8", cdOffset + 46, cdOffset + 46 + nameLen);
    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) {
      fs.mkdirSync(path.join(destDir, name), { recursive: true });
      continue;
    }

    const lfhNameLen = zipBuf.readUInt16LE(lfhOffset + 26);
    const lfhExtraLen = zipBuf.readUInt16LE(lfhOffset + 28);
    const dataStart = lfhOffset + 30 + lfhNameLen + lfhExtraLen;
    const compData = zipBuf.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) {
      data = compData;
    } else if (method === 8) {
      data = zlib.inflateRawSync(compData);
    } else {
      throw new Error(`Unsupported ZIP compression method ${method}`);
    }

    if (data.length !== uncompSize) throw new Error(`Size mismatch for ${name}`);

    const outPath = path.join(destDir, name);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, data);
  }
};

const extractPack = (packPath, destDir) => {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  const zipBuf = fs.readFileSync(packPath);
  extractZip(zipBuf, destDir);
};

const importDataPack = ({ packPath, sigPath, publicKeyText, destRoot, logger }) => {
  const log = logger || NULL_LOGGER;
  let packBytes;
  try {
    packBytes = fs.readFileSync(packPath);
  } catch (err) {
    if (err && err.code === "ENOENT") throw new Error(`pack not found: ${packPath}`);
    throw err;
  }
  let sigText;
  try {
    sigText = fs.readFileSync(sigPath, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") throw new Error(`signature sidecar missing: ${sigPath}`);
    throw err;
  }
  const verification = verifyPackSignature(packBytes, sigText, publicKeyText);
  log.info(
    `[dataPacks] verified ${path.basename(packPath)} sha256=${sha256OfBuffer(packBytes)} keyId=${verification.keyId}`
  );
  const stem = path.basename(packPath, PACK_EXTENSION);
  const destDir = path.join(destRoot, stem);
  extractPack(packPath, destDir);
  log.info(`[dataPacks] extracted ${path.basename(packPath)} -> ${destDir}`);
  return { name: stem, destDir, sha256: sha256OfBuffer(packBytes) };
};

const scanAndImportPacks = ({ packsDir, publicKeyText, destRoot, logger }) => {
  const log = logger || NULL_LOGGER;
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(packsDir);
  } catch (err) {
    if (err && err.code === "ENOENT") return results;
    log.error(`[dataPacks] failed to read packs dir ${packsDir}: ${err.message}`);
    return results;
  }
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith(PACK_EXTENSION)) continue;
    const packPath = path.join(packsDir, entry);
    const sigPath = `${packPath}${SIG_EXTENSION}`;
    try {
      const summary = importDataPack({
        packPath,
        sigPath,
        publicKeyText,
        destRoot,
        logger: log,
      });
      results.push({ pack: entry, ok: true, ...summary });
    } catch (err) {
      log.error(`[dataPacks] rejected ${entry}: ${err.message}`);
      results.push({ pack: entry, ok: false, error: err.message });
    }
  }
  return results;
};

module.exports = {
  PACK_EXTENSION,
  SIG_EXTENSION,
  extractPack,
  importDataPack,
  scanAndImportPacks,
  verifyPackSignature,
};
