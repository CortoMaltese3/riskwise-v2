// Diagnostics ZIP builder (issue #119, Area 17).
//
// The "Export Diagnostics" button in Settings packages local logs and
// system info into a ZIP the user can attach to a bug report. No data
// is auto-uploaded — the ZIP is written to disk and the renderer shows
// the path in a success toast.
//
// This module is pure Node (no Electron APIs at the call surface) so it
// can be unit-tested without an Electron harness. The caller passes in
// the resolved log directories, system-info object, and scenario rows;
// this module's job is to collect/filter/serialize them and emit a ZIP.

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const LOG_RETENTION_DAYS = 7;
const LOG_RETENTION_MS = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

// Collect *.log files in a directory whose mtime is within the retention
// window. Missing directories are not an error — installs that have never
// produced logs simply contribute nothing to the ZIP.
const collectRecentLogs = (logDir, now = Date.now()) => {
  if (!logDir) return [];
  let entries;
  try {
    entries = fs.readdirSync(logDir);
  } catch {
    return [];
  }
  const cutoff = now - LOG_RETENTION_MS;
  const result = [];
  for (const entry of entries) {
    if (!entry.endsWith(".log")) continue;
    const full = path.join(logDir, entry);
    try {
      const stat = fs.statSync(full);
      if (stat.isFile() && stat.mtimeMs >= cutoff) {
        result.push({ absPath: full, name: entry, mtime: stat.mtime });
      }
    } catch {
      // Skip files we can't stat (e.g., locked active log on Windows).
    }
  }
  return result;
};

// Hand-rolled minimal ZIP writer. We avoid pulling in `archiver` for a
// feature whose total payload is a handful of small log files — the
// stdlib `zlib.deflateRawSync` plus the documented PKZIP local-file +
// central-directory layout is enough. Every entry uses STORE (no
// compression) for tiny files and DEFLATE for anything ≥1 KiB so the ZIP
// stays openable by Windows Explorer and 7-Zip without extra fields.
const writeZip = (entries, outPath) => {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const useDeflate = data.length >= 1024;
    const stored = useDeflate ? zlib.deflateRawSync(data) : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // general purpose flag (UTF-8 names)
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10); // last mod time
    localHeader.writeUInt16LE(0, 12); // last mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(stored.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localChunks.push(localHeader, nameBuf, stored);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(stored.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra
    centralHeader.writeUInt16LE(0, 32); // comment
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42);

    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + stored.length;
  }

  const central = Buffer.concat(centralChunks);
  const localBlock = Buffer.concat(localChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  fs.writeFileSync(outPath, Buffer.concat([localBlock, central, eocd]));
};

// CRC-32 lookup table built once per process. The polynomial 0xEDB88320 is
// the reversed PKZIP polynomial; matches what unzip/Explorer expect.
let crcTable = null;
const buildCrcTable = () => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
};
const crc32 = (buf) => {
  if (!crcTable) crcTable = buildCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const buildDiagnosticsZip = ({
  outPath,
  electronLogDir,
  pythonLogDir,
  systemInfo,
  scenarioRows,
  now = Date.now(),
}) => {
  const entries = [];

  for (const file of collectRecentLogs(electronLogDir, now)) {
    try {
      entries.push({ name: `electron-logs/${file.name}`, data: fs.readFileSync(file.absPath) });
    } catch {
      // Skip unreadable files; their absence is preferable to aborting.
    }
  }
  for (const file of collectRecentLogs(pythonLogDir, now)) {
    try {
      entries.push({ name: `python-logs/${file.name}`, data: fs.readFileSync(file.absPath) });
    } catch {
      // Skip unreadable files.
    }
  }

  entries.push({
    name: "system-info.json",
    data: Buffer.from(JSON.stringify(systemInfo, null, 2), "utf8"),
  });
  entries.push({
    name: "scenarios.json",
    data: Buffer.from(JSON.stringify(scenarioRows, null, 2), "utf8"),
  });
  entries.push({
    name: "README.txt",
    data: Buffer.from(
      [
        "RISK WISE diagnostics bundle",
        "",
        `Generated: ${new Date(now).toISOString()}`,
        "",
        "Contents:",
        "  electron-logs/   Electron main process logs (last 7 days)",
        "  python-logs/     Python backend logs (last 7 days)",
        "  system-info.json OS, hardware, and app/engine version info",
        "  scenarios.json   Last 5 scenario metadata rows (no raw user data)",
        "",
        "This bundle is for local sharing only — RISK WISE does not auto-upload",
        "diagnostics. See docs/privacy.md for details on what is collected.",
        "",
      ].join("\n"),
      "utf8",
    ),
  });

  writeZip(entries, outPath);
  return { entryCount: entries.length, outPath };
};

const sanitizeScenarioRow = (row) => {
  if (!row || typeof row !== "object") return null;
  return {
    scenario_id: row.id ?? row.scenario_id ?? null,
    country: row.country ?? null,
    hazard: row.hazard_type ?? row.hazard ?? null,
    computed_at: row.created_at ?? row.computed_at ?? null,
  };
};

module.exports = {
  buildDiagnosticsZip,
  collectRecentLogs,
  sanitizeScenarioRow,
  LOG_RETENTION_DAYS,
};
