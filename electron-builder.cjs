// electron-builder configuration. Auto-detected by filename
// (must be `electron-builder.js`, not `electron-builder.config.js`)
// when `package.json#build` is absent.
//
// Build commands (see package.json#scripts):
// - `npm run pack`    → unpacked dir + portable .zip for testers
// - `npm run dist`    → NSIS installer (.exe) for end-user distribution
// - `npm run publish` → same as dist, plus uploads to GitHub Releases
//
// Code signing is wired and activates automatically when AZURE_CLIENT_ID is
// present in the environment. Dev and fork builds (no secrets) fall through
// to an unsigned artifact — the `npm run pack` / PR-build path keeps working
// unchanged. See docs/reference/signing.md for the full activation guide.
//
// Offline-installer variant (bundled tile pack, optional bundled engine)
// is deferred — tracked in the GitHub issue linked from docs/reference/offline.md.

const azureSigningEnabled = Boolean(process.env.AZURE_CLIENT_ID);
const publisherName = process.env.AZURE_PUBLISHER_NAME || undefined;

module.exports = {
  asar: true,
  // Native addons (e.g. @mapbox/mbtiles → sqlite3's node_sqlite3.node) cannot be
  // loaded from inside an asar archive — unpack them to app.asar.unpacked/ so the
  // offline tile server's lazy `require` resolves a real file on disk (#538).
  asarUnpack: ["**/*.node"],
  forceCodeSigning: false,
  afterPack: "scripts/apply-electron-fuses.js",
  appId: "com.giz.riskwise",
  productName: "RISK WISE",
  // The engine data trees (data/countries/requirements) are deliberately NOT
  // listed here. With asar on they would be packed into app.asar, and
  // `provisionEngineData`'s `fs.cpSync` cannot copy a directory tree out of an
  // asar archive — it fails with ENOENT even when the tree is asarUnpack'd
  // (empirically confirmed in #538). They ship as real dirs via `extraResources`
  // below instead; the Nuitka engine still resolves the provisioned copies as
  // BASE_DIR siblings of the exe (issue #527).
  files: ["build/**/*", "backend/**/*"],
  icon: "build/icon.ico",
  directories: {
    output: "dist/${version}",
    buildResources: "assets",
  },
  artifactName: "RiskWiseInstaller-v${version}-Setup.${ext}",
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
  // Copy `resources/` into the packaged resources root under a `resources/`
  // subfolder (NOT flattened with `to: "."`) so it lands where the runtime
  // looks: `readEnginePublicKey` probes `<resourcesPath>/resources/
  // engine-manifest.pub` via `resolveBundledResource("resources", ...)`.
  // A flattened copy left the key one level too high and bricked the engine
  // install on every packaged launch (#536).
  //
  // data/countries/requirements ride alongside as real dirs under
  // `process.resourcesPath` (NOT inside app.asar) so `provisionEngineData`'s
  // `fs.cpSync` can copy them next to the downloaded engine, and so the offline
  // tile pack's native sqlite can open `data/tiles/*.mbtiles` from a real path
  // (#538). The packaged-launch provisioning root switches to
  // `process.resourcesPath` in electron.js to match.
  extraResources: [
    { from: "resources", to: "resources" },
    { from: "data", to: "data" },
    { from: "countries", to: "countries" },
    { from: "requirements", to: "requirements" },
  ],
  win: {
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "zip", arch: ["x64"] },
    ],
    icon: "build/icon.ico",
    signAndEditExecutable: true,
    ...(publisherName ? { publisherName } : {}),
    ...(azureSigningEnabled
      ? {
          azureSignOptions: {
            publisherName,
            endpoint: process.env.AZURE_ENDPOINT,
            certificateProfileName: process.env.AZURE_CERT_PROFILE_NAME,
            codeSigningAccountName: process.env.AZURE_CODE_SIGNING_ACCOUNT_NAME,
            azureTenantId: process.env.AZURE_TENANT_ID,
            azureClientId: process.env.AZURE_CLIENT_ID,
            azureClientSecret: process.env.AZURE_CLIENT_SECRET,
          },
        }
      : {}),
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
