// Pure helpers backing the `update-available` decision flow (issue #424).
// Kept out of `electron.js` so the suppression rules can be unit-tested
// without spinning up electron, autoUpdater, or `electron-store`.

const { compareVersions } = require("./engineManifest");

// Decide what to do with an incoming `update-available` for `infoVersion`
// given the user's last persisted skip. Returns:
//   - `suppress: true`           → do not dispatch the dialog
//   - `clearSkip: true`          → caller should wipe the stored skip
// A higher semver clears the skip and proceeds; an equal semver is
// suppressed; a lower or absent skip is a pass-through.
const shouldSuppressUpdate = (infoVersion, skippedVersion) => {
  if (!infoVersion || !skippedVersion) {
    return { suppress: false, clearSkip: false };
  }
  const cmp = compareVersions(infoVersion, skippedVersion);
  if (cmp === 0) return { suppress: true, clearSkip: false };
  if (cmp > 0) return { suppress: false, clearSkip: true };
  return { suppress: false, clearSkip: false };
};

module.exports = { shouldSuppressUpdate };
