import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import zlib from "node:zlib";

import {
  buildDiagnosticsZip,
  collectRecentLogs,
  sanitizeScenarioRow,
  LOG_RETENTION_DAYS,
} from "../../public/diagnostics.js";

let workDir;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "riskwise-diag-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const setMtime = (filePath, mtimeMs) => {
  const time = mtimeMs / 1000;
  utimesSync(filePath, time, time);
};

// Minimal ZIP central-directory parser. Walks back from the end to find
// the EOCD record, then iterates the central directory. We only need the
// uncompressed entry names and bytes for assertions, so we skip Zip64 /
// large-archive support — diagnostics ZIPs stay well under 4 GiB.
const parseZip = (buf) => {
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("EOCD not found");
  const centralCount = buf.readUInt16LE(eocdOffset + 10);
  const centralOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = {};
  let cursor = centralOffset;
  for (let i = 0; i < centralCount; i++) {
    if (buf.readUInt32LE(cursor) !== 0x02014b50) throw new Error("bad central header");
    const method = buf.readUInt16LE(cursor + 10);
    const compressedSize = buf.readUInt32LE(cursor + 20);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const localOffset = buf.readUInt32LE(cursor + 42);
    const name = buf.slice(cursor + 46, cursor + 46 + nameLen).toString("utf8");

    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const stored = buf.slice(dataStart, dataStart + compressedSize);
    const data = method === 8 ? zlib.inflateRawSync(stored) : stored;
    entries[name] = data;

    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
};

describe("collectRecentLogs", () => {
  it("returns empty array when the directory does not exist", () => {
    expect(collectRecentLogs(path.join(workDir, "nonexistent"))).toEqual([]);
  });

  it("returns empty array when logDir is null/undefined", () => {
    expect(collectRecentLogs(null)).toEqual([]);
    expect(collectRecentLogs(undefined)).toEqual([]);
  });

  it("includes only .log files within the retention window", () => {
    const logDir = path.join(workDir, "logs");
    mkdirSync(logDir, { recursive: true });
    const now = Date.now();
    const recent = path.join(logDir, "app-recent.log");
    const old = path.join(logDir, "app-old.log");
    const notALog = path.join(logDir, "readme.txt");
    writeFileSync(recent, "recent content");
    writeFileSync(old, "old content");
    writeFileSync(notALog, "not a log");

    setMtime(recent, now - 60 * 1000);
    setMtime(old, now - (LOG_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);

    const result = collectRecentLogs(logDir, now);
    const names = result.map((r) => r.name).sort();
    expect(names).toEqual(["app-recent.log"]);
  });
});

describe("sanitizeScenarioRow", () => {
  it("maps DB columns to the documented diagnostics shape", () => {
    expect(
      sanitizeScenarioRow({
        id: "abc-123",
        country: "EGY",
        hazard_type: "TC",
        created_at: "2026-04-25T12:00:00Z",
        // Fields below must NOT leak into the sanitized row.
        notes: "private user notes",
        exposure_economic: 12345.67,
      })
    ).toEqual({
      scenario_id: "abc-123",
      country: "EGY",
      hazard: "TC",
      computed_at: "2026-04-25T12:00:00Z",
    });
  });

  it("returns null for falsy input", () => {
    expect(sanitizeScenarioRow(null)).toBeNull();
    expect(sanitizeScenarioRow(undefined)).toBeNull();
    expect(sanitizeScenarioRow("not an object")).toBeNull();
  });
});

describe("buildDiagnosticsZip", () => {
  it("writes a valid ZIP with logs, system info, and scenarios", () => {
    const electronLogs = path.join(workDir, "el-logs");
    const pythonLogs = path.join(workDir, "py-logs");
    mkdirSync(electronLogs);
    mkdirSync(pythonLogs);
    const now = Date.now();
    writeFileSync(path.join(electronLogs, "app-2026-04-25.log"), "electron log line\n");
    writeFileSync(path.join(pythonLogs, "backend-2026-04-25.log"), "python log line\n");
    setMtime(path.join(electronLogs, "app-2026-04-25.log"), now);
    setMtime(path.join(pythonLogs, "backend-2026-04-25.log"), now);

    const outPath = path.join(workDir, "diagnostics.zip");
    const result = buildDiagnosticsZip({
      outPath,
      electronLogDir: electronLogs,
      pythonLogDir: pythonLogs,
      systemInfo: { app_version: "1.0.8", offline_mode: false },
      scenarioRows: [
        { scenario_id: "s1", country: "EGY", hazard: "TC", computed_at: "2026-04-25" },
      ],
      now,
    });

    expect(result.outPath).toBe(outPath);
    expect(result.entryCount).toBeGreaterThanOrEqual(5);

    const zipBuf = readFileSync(outPath);
    const entries = parseZip(zipBuf);

    expect(Object.keys(entries)).toEqual(
      expect.arrayContaining([
        "electron-logs/app-2026-04-25.log",
        "python-logs/backend-2026-04-25.log",
        "system-info.json",
        "scenarios.json",
        "README.txt",
      ])
    );
    expect(entries["electron-logs/app-2026-04-25.log"].toString("utf8")).toBe(
      "electron log line\n"
    );
    expect(JSON.parse(entries["system-info.json"].toString("utf8"))).toEqual({
      app_version: "1.0.8",
      offline_mode: false,
    });
    expect(JSON.parse(entries["scenarios.json"].toString("utf8"))).toEqual([
      { scenario_id: "s1", country: "EGY", hazard: "TC", computed_at: "2026-04-25" },
    ]);
  });

  it("excludes log files older than 7 days", () => {
    const electronLogs = path.join(workDir, "el-logs");
    mkdirSync(electronLogs);
    const now = Date.now();
    const recent = path.join(electronLogs, "app-recent.log");
    const stale = path.join(electronLogs, "app-stale.log");
    writeFileSync(recent, "recent");
    writeFileSync(stale, "stale");
    setMtime(recent, now - 60 * 1000);
    setMtime(stale, now - (LOG_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);

    const outPath = path.join(workDir, "out.zip");
    buildDiagnosticsZip({
      outPath,
      electronLogDir: electronLogs,
      pythonLogDir: null,
      systemInfo: {},
      scenarioRows: [],
      now,
    });
    const entries = parseZip(readFileSync(outPath));
    expect(entries).toHaveProperty("electron-logs/app-recent.log");
    expect(entries).not.toHaveProperty("electron-logs/app-stale.log");
  });

  it("survives missing log directories without throwing", () => {
    const outPath = path.join(workDir, "minimal.zip");
    expect(() =>
      buildDiagnosticsZip({
        outPath,
        electronLogDir: path.join(workDir, "missing-el"),
        pythonLogDir: path.join(workDir, "missing-py"),
        systemInfo: { app_version: "1.0.8" },
        scenarioRows: [],
      })
    ).not.toThrow();
    const entries = parseZip(readFileSync(outPath));
    expect(entries).toHaveProperty("system-info.json");
    expect(entries).toHaveProperty("scenarios.json");
    expect(entries).toHaveProperty("README.txt");
  });
});
