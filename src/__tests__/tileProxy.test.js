import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

// public/tileProxy.js is CommonJS (consumed by the Electron main process)
// so we load it via createRequire instead of an ESM import. Keeping the
// routing helper testable without an Electron context is the whole point
// of issue #477's "unit-test the routing helper directly".
const require = createRequire(import.meta.url);
const { resolveTileRequest, RESULT, BASEMAP_KEYS } = require("../../public/tileProxy.js");

describe("resolveTileRequest", () => {
  it("ignores pathnames outside the /__tiles/ prefix", () => {
    expect(resolveTileRequest("/index.html").kind).toBe(RESULT.NOT_TILES);
    expect(resolveTileRequest("/__temp/file.json").kind).toBe(RESULT.NOT_TILES);
    expect(resolveTileRequest("").kind).toBe(RESULT.NOT_TILES);
  });

  it("serves legacy unkeyed paths as Voyager for backward compatibility", () => {
    const route = resolveTileRequest("/__tiles/5/12/19.png");
    expect(route.kind).toBe(RESULT.OK);
    expect(route.url).toBe("https://a.basemaps.cartocdn.com/rastertiles/voyager/5/12/19.png");
  });

  it("preserves retina (@2x) suffixes on the legacy unkeyed path", () => {
    const route = resolveTileRequest("/__tiles/5/12/19@2x.png");
    expect(route.kind).toBe(RESULT.OK);
    expect(route.url).toBe("https://a.basemaps.cartocdn.com/rastertiles/voyager/5/12/19@2x.png");
  });

  it("routes the voyager key to the Carto Voyager CDN", () => {
    const route = resolveTileRequest("/__tiles/voyager/5/12/19.png");
    expect(route.kind).toBe(RESULT.OK);
    expect(route.url).toBe("https://a.basemaps.cartocdn.com/rastertiles/voyager/5/12/19.png");
  });

  it("routes the dark key to the Carto Dark Matter CDN", () => {
    const route = resolveTileRequest("/__tiles/dark/5/12/19.png");
    expect(route.kind).toBe(RESULT.OK);
    expect(route.url).toBe("https://a.basemaps.cartocdn.com/dark_all/5/12/19.png");
  });

  it("routes the satellite key to ESRI World Imagery with y/x order swapped", () => {
    // Carto's path is z/x/y but ESRI's REST endpoint is z/y/x — so for
    // /__tiles/satellite/5/12/19.png we expect upstream .../5/19/12 (no
    // .png suffix; ESRI doesn't honor it).
    const route = resolveTileRequest("/__tiles/satellite/5/12/19.png");
    expect(route.kind).toBe(RESULT.OK);
    expect(route.url).toBe(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/5/19/12"
    );
  });

  it("rejects unknown basemap keys with bad_request/unknown_basemap", () => {
    const route = resolveTileRequest("/__tiles/openstreetmap/5/12/19.png");
    expect(route.kind).toBe(RESULT.BAD_REQUEST);
    expect(route.reason).toBe("unknown_basemap");
  });

  it("rejects malformed tile segments with bad_request/malformed_path", () => {
    expect(resolveTileRequest("/__tiles/voyager/not-a-tile.png").kind).toBe(RESULT.BAD_REQUEST);
    expect(resolveTileRequest("/__tiles/voyager/5/12.png").kind).toBe(RESULT.BAD_REQUEST);
    expect(resolveTileRequest("/__tiles/voyager/5/12/19.jpg").kind).toBe(RESULT.BAD_REQUEST);
    expect(resolveTileRequest("/__tiles/").kind).toBe(RESULT.BAD_REQUEST);
  });

  it("exports the whitelist via BASEMAP_KEYS", () => {
    expect(BASEMAP_KEYS).toEqual(expect.arrayContaining(["voyager", "dark", "satellite"]));
    expect(BASEMAP_KEYS).toHaveLength(3);
  });
});
