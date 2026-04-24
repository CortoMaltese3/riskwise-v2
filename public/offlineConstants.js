// Single source of truth for offline-mode filenames shared between the
// Electron main process (`public/electron.js`) and the build config
// (`electron-builder.config.js`). Drift here would silently break the
// offline installer — the main process would look for one filename
// while electron-builder bundles another.

module.exports = {
  TILES_FILENAME: "egy_tha_zoom_0_12.mbtiles",
};
