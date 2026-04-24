import useStore from "../../store";

const REMOTE_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

// When offline mode is active AND the local MBTiles tile server is up,
// route Leaflet to the loopback URL so map tiles never leave the
// machine. When the local server hasn't started (e.g., the lean
// installer is missing the tile pack) we deliberately fall back to the
// remote CDN — the OfflineIndicator chip + Settings warning tell the
// user tiles are still going out.
export const useTileLayerUrl = () => {
  const offlineMode = useStore((s) => s.offlineMode);
  const tilePort = useStore((s) => s.offlineTilePort);
  if (offlineMode && tilePort) {
    return `http://127.0.0.1:${tilePort}/{z}/{x}/{y}.png`;
  }
  return REMOTE_TILE_URL;
};

export default useTileLayerUrl;
export { REMOTE_TILE_URL };
