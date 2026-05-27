import useUIStore from "../../store/useUIStore";

// Online tiles go through the main-process proxy registered under
// ``app://./__tiles/`` (see ``public/electron.js`` / ``public/tileProxy.js``).
// The proxy accepts a basemap key prefix — ``voyager`` (light, default),
// ``dark``, or ``satellite`` — and forwards to the right upstream URL
// template. Routing through the proxy makes the tiles same-origin and
// sidesteps Chromium's CORS rejection of the third-party CDN responses,
// which would otherwise silently break ``dom-to-image-more``'s XHR fetch
// of every tile when ``leaflet-simple-map-screenshoter`` captures a map.
const remoteTileUrl = (basemap) => `app://./__tiles/${basemap}/{z}/{x}/{y}{r}.png`;

// When offline mode is active AND the local MBTiles tile server is up,
// route Leaflet to the loopback URL so map tiles never leave the
// machine. The bundled MBTiles file typically carries only one basemap,
// so the selector is hidden in offline mode (see ``MapControls.jsx``)
// and we pin to the bundled style regardless of the stored preference.
// When the local server hasn't started (e.g., the lean installer is
// missing the tile pack) we deliberately fall back to the proxied
// remote tiles — the OfflineIndicator chip + Settings warning tell the
// user tiles are still going out.
export const useTileLayerUrl = (basemap) => {
  const offlineMode = useUIStore((s) => s.offlineMode);
  const tilePort = useUIStore((s) => s.offlineTilePort);
  const storedBasemap = useUIStore((s) => s.basemap);
  if (offlineMode && tilePort) {
    return `http://127.0.0.1:${tilePort}/{z}/{x}/{y}.png`;
  }
  return remoteTileUrl(basemap ?? storedBasemap);
};

export default useTileLayerUrl;
export { remoteTileUrl };
