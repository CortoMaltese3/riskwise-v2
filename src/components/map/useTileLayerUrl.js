import useUIStore from "../../store/useUIStore";

// Online tiles go through the main-process proxy registered under
// ``app://./__tiles/`` (see ``public/electron.js``). Carto's CDN sends
// ``Access-Control-Allow-Origin: *`` together with
// ``Access-Control-Allow-Credentials: true``, an invalid combo Chromium
// rejects — which silently breaks ``dom-to-image-more``'s XHR fetch of every
// tile when ``leaflet-simple-map-screenshoter`` captures a map snapshot.
// Routing through the proxy makes the tiles same-origin and sidesteps CORS.
const REMOTE_TILE_URL = "app://./__tiles/{z}/{x}/{y}{r}.png";

// When offline mode is active AND the local MBTiles tile server is up,
// route Leaflet to the loopback URL so map tiles never leave the
// machine. When the local server hasn't started (e.g., the lean
// installer is missing the tile pack) we deliberately fall back to the
// proxied remote tiles — the OfflineIndicator chip + Settings warning
// tell the user tiles are still going out.
export const useTileLayerUrl = () => {
  const offlineMode = useUIStore((s) => s.offlineMode);
  const tilePort = useUIStore((s) => s.offlineTilePort);
  if (offlineMode && tilePort) {
    return `http://127.0.0.1:${tilePort}/{z}/{x}/{y}.png`;
  }
  return REMOTE_TILE_URL;
};

export default useTileLayerUrl;
export { REMOTE_TILE_URL };
