// electron-builder configuration. Auto-detected by filename
// (must be `electron-builder.js`, not `electron-builder.config.js`)
// when `package.json#build` is absent.
//
// Build commands (see package.json#scripts):
// - `npm run pack`    → unpacked dir + portable .zip for testers
// - `npm run dist`    → NSIS installer (.exe) for end-user distribution
// - `npm run publish` → same as dist, plus uploads to GitHub Releases
//
// Code signing is currently disabled (no Azure Trusted Signing
// credentials available). When that changes, restore the
// `signtoolOptions` / `azureSignOptions` blocks; the activation pattern
// is documented in docs/signing.md.
//
// Offline-installer variant (bundled tile pack, optional bundled engine)
// is deferred — tracked in the GitHub issue linked from docs/offline.md.

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
  extraResources: [{ from: "resources", to: "." }],
  win: {
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "zip", arch: ["x64"] },
    ],
    icon: "build/icon.ico",
    signAndEditExecutable: true,
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
