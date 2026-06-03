// Engine data-tree provisioning (issue #527).
//
// The Nuitka onefile engine resolves its shipped datasets as *siblings of the
// exe*: `backend/constants.get_base_dir()` returns the directory holding the
// launcher, and `DATA_DIR` / `COUNTRIES_DIR` / `REQUIREMENTS_DIR` hang off it.
// The engine download path fetches only `riskwise-engine.exe`, so on a fresh
// machine those trees are absent and every scenario fails. This module copies
// the trees the installer bundled (under `app.getAppPath()`) next to the
// downloaded exe, mirroring `scripts/stage_engine.ps1`.
//
// Pure Node (no Electron APIs) so it unit-tests under vitest without a harness.

const fs = require("node:fs");
const path = require("node:path");

// The shipped, immutable seed trees the engine resolves relative to BASE_DIR
// (see backend/constants.py). Order is stable for deterministic logs/tests.
const ENGINE_DATA_TREES = ["data", "countries", "requirements"];

class EngineDataProvisionError extends Error {
  constructor(message) {
    super(message);
    this.name = "EngineDataProvisionError";
  }
}

// Copy each shipped tree from `bundledRoot` into `engineDir` when it is not
// already present. Idempotent by design: a tree that already exists in
// `engineDir` is left untouched, so an engine-only update never wipes data the
// user (or a previous install) already provisioned. Throws
// `EngineDataProvisionError` naming a missing *source* tree — a build that
// forgot to bundle one would otherwise fail opaquely at scenario time, far from
// the cause. Returns `{ copied, skipped }` for logging and tests.
const provisionEngineData = (bundledRoot, engineDir, options = {}) => {
  const { trees = ENGINE_DATA_TREES, logger } = options;
  const log = typeof logger === "function" ? logger : () => {};
  const copied = [];
  const skipped = [];

  for (const tree of trees) {
    const dst = path.join(engineDir, tree);
    if (fs.existsSync(dst)) {
      skipped.push(tree);
      log(`[engine-provision] ${tree}/ already present — skipping`);
      continue;
    }
    const src = path.join(bundledRoot, tree);
    if (!fs.existsSync(src)) {
      throw new EngineDataProvisionError(
        `Bundled engine data tree "${tree}" not found at ${src} — ` +
          "the installer must ship it (see electron-builder.cjs `files`)"
      );
    }
    fs.cpSync(src, dst, { recursive: true });
    copied.push(tree);
    log(`[engine-provision] copied ${tree}/ -> ${dst}`);
  }

  return { copied, skipped };
};

module.exports = { ENGINE_DATA_TREES, EngineDataProvisionError, provisionEngineData };
