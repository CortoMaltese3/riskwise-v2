// Single source of truth for offline-mode filenames used by the
// Electron main process (`public/electron.js`) at runtime.
//
// The build-time consumer (electron-builder.js, offline installer
// variant) was removed when offline mode was deferred. When that
// variant is restored, electron-builder must re-import this module so
// the main process and the bundle agree on the tile-pack filename.

module.exports = {
  TILES_FILENAME: "egy_tha_zoom_0_12.mbtiles",
};
