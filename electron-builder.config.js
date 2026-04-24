// Two installer variants share this file:
// - `npm run dist`         → online installer (≤ 150 MB target).
//                            Engine downloads on first launch; tiles
//                            served from the OpenStreetMap CDN.
// - `npm run dist:offline` → all-in-one installer (≤ 900 MB target).
//                            Sets `OFFLINE_INSTALLER=1`, which bundles
//                            the MBTiles tile pack via `extraResources`
//                            and (optionally) the pre-extracted engine
//                            tree pointed to by `RISKWISE_ENGINE_DIR`.
//
// Single JS config so we can branch on `process.env` at build time —
// electron-builder picks this up automatically when `package.json#build`
// is absent.

const path = require("node:path");
const fs = require("node:fs");

const { TILES_FILENAME } = require("./public/offlineConstants");

const isOfflineInstaller =
  process.env.OFFLINE_INSTALLER === "1" || process.env.OFFLINE_INSTALLER === "true";

const baseExtraResources = [{ from: "resources", to: "." }];

const offlineExtraResources = () => {
  const extras = [];
  const tilesPath = path.join(__dirname, "data", "tiles", TILES_FILENAME);
  if (fs.existsSync(tilesPath)) {
    extras.push({ from: tilesPath, to: path.join("data", "tiles", TILES_FILENAME) });
  } else {
    console.warn(
      `[electron-builder] OFFLINE_INSTALLER=1 but tile pack missing at ${tilesPath} — ` +
        "the offline installer will not include offline map tiles. " +
        "See docs/offline.md for the download URL and expected SHA-256."
    );
  }
  // Optional pre-extracted engine — when set, electron-builder copies the
  // entire engine tree under `resources/engine/`. The renderer/main wiring
  // already prefers `%LOCALAPPDATA%/RiskWiseEngine/`, so a future patch
  // can teach the supervisor to seed that directory from this resources
  // copy on first launch (out of scope for this issue).
  const engineDir = process.env.RISKWISE_ENGINE_DIR;
  if (engineDir && fs.existsSync(engineDir)) {
    extras.push({ from: engineDir, to: path.join("engine") });
  } else if (engineDir) {
    console.warn(
      `[electron-builder] RISKWISE_ENGINE_DIR=${engineDir} does not exist — ` +
        "engine will not be bundled in the offline installer."
    );
  }
  return extras;
};

const extraResources = isOfflineInstaller
  ? [...baseExtraResources, ...offlineExtraResources()]
  : baseExtraResources;

const variantSuffix = isOfflineInstaller ? "-Offline" : "";

module.exports = {
  asar: false,
  forceCodeSigning: false,
  afterPack: "scripts/apply-electron-fuses.js",
  appId: "com.giz.riskwise",
  productName: "RISK WISE",
  files: ["build/**/*", "backend/**/*", "requirements/", "data/entities/", "data/hazards/"],
  icon: "build/icon.ico",
  directories: {
    output: "dist/${version}",
    buildResources: "assets",
  },
  artifactName: `RiskWiseInstaller${variantSuffix}-v\${version}-Setup.\${ext}`,
  publish: [
    {
      provider: "github",
      owner: "CortoMaltese3",
      repo: "riskwise-v2",
      releaseType: "release",
      channel: "latest",
    },
  ],
  generateUpdatesFilesForAllChannels: true,
  extraResources,
  win: {
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "zip", arch: ["x64"] },
      { target: "7z", arch: ["x64"] },
    ],
    icon: "build/icon.ico",
    signingHashAlgorithms: ["sha256"],
    signAndEditExecutable: true,
    publisherName: "<org name when cert available>",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: "build/icon.ico",
    uninstallerIcon: "build/icon.ico",
    allowElevation: true,
    license: "EULA.txt",
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    include: "installer/installer.nsh",
    displayLanguageSelector: false,
  },
};
