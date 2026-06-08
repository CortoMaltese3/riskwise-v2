// Pure helpers backing the `update-available` decision flow (issue #424).
// Kept out of `electron.js` so the suppression rules can be unit-tested
// without spinning up electron, autoUpdater, or `electron-store`.

const fs = require("fs");
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

// Decide whether to block an app/window close because an update download is
// still in flight. Field testing showed users closing the app mid-download,
// which discards the partial download so nothing installs. `userOverrode` is
// set once the user confirms "Quit anyway" so the retried close goes through.
const shouldBlockCloseForDownload = (downloadInProgress, userOverrode) =>
  Boolean(downloadInProgress) && !userOverrode;

// Pick the version we can roll back to (issue #564). Given the append-style
// update history and the running version, return the most-recent entry that is
// strictly older than `currentVersion`, on the same channel, and whose cached
// installer still exists on disk. Returns `null` when nothing qualifies — the
// renderer disables the Downgrade button in that case.
//
// `options.channel` restricts candidates to that channel (cross-channel
// downgrade is a non-goal). `options.fileExists` is injected so the resolution
// stays pure/testable; it defaults to a real `fs.existsSync` check in
// production. "Most recent" is decided by semver, not by array order, so an
// out-of-order history still resolves to the highest older version.
const resolveDowngradeTarget = (history, currentVersion, options = {}) => {
  const { channel = null, fileExists = fs.existsSync } = options;
  if (!Array.isArray(history) || !currentVersion) return null;

  const candidates = history.filter((entry) => {
    if (!entry || !entry.version || !entry.installerPath) return false;
    if (channel && entry.channel && entry.channel !== channel) return false;
    if (compareVersions(entry.version, currentVersion) >= 0) return false;
    return Boolean(fileExists(entry.installerPath));
  });

  if (candidates.length === 0) return null;

  return candidates.reduce((best, entry) =>
    compareVersions(entry.version, best.version) > 0 ? entry : best
  );
};

module.exports = {
  shouldSuppressUpdate,
  shouldBlockCloseForDownload,
  resolveDowngradeTarget,
};
