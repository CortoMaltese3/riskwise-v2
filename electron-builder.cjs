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
  asar: false,
  forceCodeSigning: false,
  afterPack: "scripts/apply-electron-fuses.js",
  appId: "com.giz.riskwise",
  productName: "RISK WISE",
  files: ["build/**/*", "backend/**/*", "requirements/", "data/"],
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
