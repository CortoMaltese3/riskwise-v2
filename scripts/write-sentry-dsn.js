#!/usr/bin/env node
// Bake `SENTRY_DSN` into the build output (issue #119, Area 17).
//
// CI sets `SENTRY_DSN` as a GitHub Actions secret and exports it before
// `npm run build`; this script reads it from the environment and writes
// `build/sentry-dsn.json` so the Electron main process can pick it up at
// runtime without the value ever appearing in source. Dev / fork builds
// without the secret get an empty file, and `electron.js` skips Sentry
// init entirely.
//
// Keeping the value in a sidecar JSON (rather than substituting it into
// `electron.js`) means a packaged build artifact carries the DSN in one
// place that's trivial to inspect or rotate without rebuilding the JS.

const fs = require("node:fs");
const path = require("node:path");

// Load `.env` from the project root if present so `npm run build` picks up
// a local DSN without the engineer having to `export SENTRY_DSN=...` per
// shell. Production CI sets `SENTRY_DSN` from a GitHub Actions secret
// before running `npm run build`, in which case `process.env` already has
// the value and dotenv's default behavior leaves it alone.
try {
  require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
} catch {
  // dotenv is a devDependency; if it's missing (e.g. minimal CI image) we
  // still want this script to succeed when SENTRY_DSN is set in the env.
}

const buildDir = path.resolve(__dirname, "..", "build");
const outPath = path.join(buildDir, "sentry-dsn.json");

const dsn = process.env.SENTRY_DSN || "";
fs.mkdirSync(buildDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ dsn }, null, 2) + "\n", "utf8");

if (dsn) {
  console.log(`[sentry] wrote DSN sidecar to ${outPath}`);
} else {
  console.log(`[sentry] no SENTRY_DSN in env; wrote empty sidecar (Sentry will be skipped)`);
}
