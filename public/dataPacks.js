// Signed data-pack import. Verifies a `.riskwise-pack` (ZIP) against
// its sidecar `.minisig` using the engine-manifest public key, then
// extracts to `userData/user-data/<pack-stem>/`. Verifying before
// extraction matters: trusting the ZIP first would let anyone with
// file-system write access ship arbitrary trees into user-data.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { verifyMinisignSignature } = require("./engineManifest");

const PACK_EXTENSION = ".riskwise-pack";
const SIG_EXTENSION = ".minisig";

const NULL_LOGGER = { info() {}, warn() {}, error() {} };

// MSYS2 / Git-Bash GNU tar interprets `C:` as a remote host
// ("Cannot connect to C: resolve failed"); the Windows-bundled bsdtar
// at %SystemRoot%\System32\tar.exe handles drive-letter paths natively.
// Resolve the system tar explicitly so dev environments with MSYS2 first
// in PATH don't silently mis-extract.
const resolveSystemTar = () => {
  if (process.platform !== "win32") return "tar";
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  return path.join(systemRoot, "System32", "tar.exe");
};

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

const extractPack = (packPath, destDir) => {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync(resolveSystemTar(), ["-xf", packPath, "-C", destDir], { stdio: "pipe" });
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
