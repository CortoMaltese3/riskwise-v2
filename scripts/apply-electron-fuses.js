// Flip Electron fuses on the packaged binary so unused features are
// disabled at the binary level — defense-in-depth that survives a
// future package.json regression re-enabling them in `webPreferences`.
//
// Wired as `electron-builder`'s `afterPack` hook (see `package.json`).
// Runs once per packaged platform after electron-builder copies the
// Electron binary into the app stage but before code signing.
//
// `OnlyLoadAppFromAsar` is intentionally NOT enabled because the build
// sets `"asar": false` (see DECISIONS.md / package.json `"build"`); flipping
// it on would brick startup. Re-enable when/if the asar bundle is restored.

const path = require("node:path");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

/**
 * @param {{ appOutDir: string; packager: { appInfo: { productFilename: string } }; electronPlatformName: string }} context
 */
module.exports = async function applyFuses(context) {
  const productFilename = context.packager.appInfo.productFilename;
  const ext = context.electronPlatformName === "win32" ? ".exe" : "";
  const electronBinary = path.join(context.appOutDir, `${productFilename}${ext}`);

  await flipFuses(electronBinary, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: context.electronPlatformName === "mas",
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });

  console.log(`[fuses] hardened ${electronBinary}`);
};
