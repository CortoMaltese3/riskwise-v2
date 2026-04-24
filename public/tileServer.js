// Local MBTiles HTTP tile server. Spins up on a random loopback port
// and serves PNG tiles read from a `.mbtiles` (SQLite) file. The
// renderer learns the port via the offline-status IPC and rewrites its
// Leaflet TileLayer URL to `http://127.0.0.1:<port>/{z}/{x}/{y}.png`.
//
// `@mapbox/mbtiles` is a native dep (`optionalDependencies`) — if the
// install couldn't compile it, we return a null-port handle so the rest
// of offline mode still works while map tiles fall back to the remote
// CDN. Bundling the dep is a concern of the offline installer variant,
// not the source tree.

const http = require("node:http");

const TILE_PNG_HEADERS = Object.freeze({
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=86400",
  "Access-Control-Allow-Origin": "*",
});

const TILE_PATH_RE = /^\/(\d+)\/(\d+)\/(\d+)\.png$/;

const NULL_LOGGER = { info() {}, warn() {}, error() {} };

// XYZ (Leaflet slippy-map) → TMS (MBTiles): the y axis is flipped, so
// rows must be inverted before lookup.
const xyzToTmsRow = (zoom, y) => Math.pow(2, zoom) - 1 - y;

const loadMbtilesReader = () => {
  try {
    return require("@mapbox/mbtiles");
  } catch {
    return null;
  }
};

const openMbtiles = (filePath) =>
  new Promise((resolve, reject) => {
    const MBTiles = loadMbtilesReader();
    if (!MBTiles) {
      reject(new Error("@mapbox/mbtiles is not installed (offline tile server unavailable)"));
      return;
    }
    new MBTiles(`${filePath}?mode=ro`, (err, db) => {
      if (err) reject(err);
      else resolve(db);
    });
  });

const getTile = (db, z, x, y) =>
  new Promise((resolve, reject) => {
    db.getTile(z, x, y, (err, tile, headers) => {
      if (err) {
        // Structural "tile out of range" — surface as 404 rather than 500.
        if (err.message && /does not exist/i.test(err.message)) {
          resolve({ tile: null });
          return;
        }
        reject(err);
        return;
      }
      resolve({ tile, headers: headers || {} });
    });
  });

const buildRequestHandler = (db, logger) => async (req, res) => {
  const log = logger || NULL_LOGGER;
  const match = req.url && req.url.match(TILE_PATH_RE);
  if (!match) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }
  const [, zStr, xStr, yStr] = match;
  const z = Number(zStr);
  const x = Number(xStr);
  const y = Number(yStr);
  if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request");
    return;
  }
  try {
    const { tile } = await getTile(db, z, x, xyzToTmsRow(z, y));
    if (!tile) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Tile not found");
      return;
    }
    res.writeHead(200, TILE_PNG_HEADERS);
    res.end(tile);
  } catch (err) {
    log.error(`[tileServer] tile ${z}/${x}/${y} failed: ${err.message}`);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Tile read failed");
  }
};

const startTileServer = async ({ mbtilesPath, logger } = {}) => {
  const log = logger || NULL_LOGGER;
  if (!mbtilesPath) {
    log.warn("[tileServer] no MBTiles path provided — offline tiles disabled");
    return { port: null, close: async () => {} };
  }
  let db;
  try {
    db = await openMbtiles(mbtilesPath);
  } catch (err) {
    log.warn(`[tileServer] cannot open ${mbtilesPath}: ${err.message}`);
    return { port: null, close: async () => {} };
  }
  const server = http.createServer(buildRequestHandler(db, log));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const { port } = server.address();
  log.info(`[tileServer] listening on 127.0.0.1:${port} (${mbtilesPath})`);
  return {
    port,
    close: async () => {
      await new Promise((resolve) => server.close(() => resolve()));
      if (db && typeof db.close === "function") {
        await new Promise((resolve) => db.close(() => resolve()));
      }
      log.info(`[tileServer] stopped (was on 127.0.0.1:${port})`);
    },
  };
};

module.exports = {
  TILE_PATH_RE,
  buildRequestHandler,
  startTileServer,
  xyzToTmsRow,
};
