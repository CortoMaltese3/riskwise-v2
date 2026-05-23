// Tile-proxy routing helper for the Electron main process. Maps an
// `app://./__tiles/...` pathname to the upstream tile URL the renderer
// should ultimately fetch.
//
// The renderer cannot read tiles directly from third-party CDNs via
// XHR/fetch because their responses combine ``Access-Control-Allow-Origin: *``
// with ``Access-Control-Allow-Credentials: true``, an invalid combination
// Chromium rejects per spec — which silently breaks `dom-to-image-more`
// (used by `leaflet-simple-map-screenshoter`) when it captures snapshots.
// Routing through ``app://`` makes the tiles same-origin and sidesteps CORS.

const TILES_PATH_PREFIX = "/__tiles/";
const TILES_TILE_RE = /^\d+\/\d+\/\d+(?:@\dx)?\.png$/;

// Per-provider URL builders. Each takes a `z/x/y[@Nx].png` segment and
// returns the upstream URL. Satellite swaps y/x order on purpose — ESRI's
// World_Imagery REST endpoint uses `{z}/{y}/{x}` instead of Carto's
// `{z}/{x}/{y}`. Unknown keys must be rejected with 400 by the caller.
const BASEMAP_PROVIDERS = Object.freeze({
  voyager: (tile) => `https://a.basemaps.cartocdn.com/rastertiles/voyager/${tile}`,
  dark: (tile) => `https://a.basemaps.cartocdn.com/dark_all/${tile}`,
  satellite: (tile) => {
    // Drop the optional `@Nx` retina suffix and the `.png` extension —
    // ArcGIS doesn't honor either — then swap y/x ordering.
    const stripped = tile.replace(/(@\dx)?\.png$/, "");
    const [z, x, y] = stripped.split("/");
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  },
});

const RESULT = Object.freeze({
  NOT_TILES: "not_tiles",
  BAD_REQUEST: "bad_request",
  OK: "ok",
});

// Resolve an app:// pathname to an upstream URL. Returns one of:
//   { kind: "not_tiles" }            — pathname is not under /__tiles/
//   { kind: "bad_request", reason }  — malformed segment or unknown key
//   { kind: "ok", url }              — caller should `net.fetch(url)`
function resolveTileRequest(pathname) {
  if (!pathname || !pathname.startsWith(TILES_PATH_PREFIX)) {
    return { kind: RESULT.NOT_TILES };
  }
  const requested = pathname.slice(TILES_PATH_PREFIX.length);
  // Two accepted shapes:
  //   1. Legacy `z/x/y[@Nx].png`               → defaults to Voyager.
  //   2. Keyed  `<key>/z/x/y[@Nx].png`         → upstream picked by key.
  // The legacy shape preserves backward compatibility with any caller
  // that still issues unkeyed paths during the migration window.
  if (TILES_TILE_RE.test(requested)) {
    return { kind: RESULT.OK, url: BASEMAP_PROVIDERS.voyager(requested) };
  }
  const slash = requested.indexOf("/");
  if (slash < 0) {
    return { kind: RESULT.BAD_REQUEST, reason: "malformed_path" };
  }
  const key = requested.slice(0, slash);
  const tile = requested.slice(slash + 1);
  if (!TILES_TILE_RE.test(tile)) {
    return { kind: RESULT.BAD_REQUEST, reason: "malformed_path" };
  }
  const builder = BASEMAP_PROVIDERS[key];
  if (!builder) {
    return { kind: RESULT.BAD_REQUEST, reason: "unknown_basemap" };
  }
  return { kind: RESULT.OK, url: builder(tile) };
}

module.exports = {
  TILES_PATH_PREFIX,
  BASEMAP_KEYS: Object.freeze(Object.keys(BASEMAP_PROVIDERS)),
  resolveTileRequest,
  RESULT,
};
