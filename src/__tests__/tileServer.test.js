import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.resolve(here, "..", "..", "public", "tileServer.js");
const { createRequire } = await import("node:module");
const requireCjs = createRequire(import.meta.url);
const { TILE_PATH_RE, buildRequestHandler, xyzToTmsRow } = requireCjs(modulePath);

// `xyzToTmsRow` flips the y axis between Leaflet's slippy-map coordinates
// (TMS_y = 2^z - 1 - XYZ_y) and what MBTiles stores. A regression here
// would silently serve the wrong tile, so the math is worth pinning.
describe("xyzToTmsRow", () => {
  it("inverts y across the row for a given zoom level", () => {
    expect(xyzToTmsRow(0, 0)).toBe(0);
    expect(xyzToTmsRow(1, 0)).toBe(1);
    expect(xyzToTmsRow(1, 1)).toBe(0);
    expect(xyzToTmsRow(10, 512)).toBe(511);
  });
});

describe("TILE_PATH_RE", () => {
  it("matches `/z/x/y.png` and rejects everything else", () => {
    expect("/0/0/0.png".match(TILE_PATH_RE)).not.toBeNull();
    expect("/12/2048/1024.png".match(TILE_PATH_RE)).not.toBeNull();
    expect("/foo/bar/baz.png".match(TILE_PATH_RE)).toBeNull();
    expect("/12/2048/1024.jpg".match(TILE_PATH_RE)).toBeNull();
    expect("/12/2048".match(TILE_PATH_RE)).toBeNull();
    expect("/".match(TILE_PATH_RE)).toBeNull();
  });
});

const buildResponse = () => {
  const writeHead = vi.fn();
  const end = vi.fn();
  return {
    writeHead,
    end,
    res: { writeHead, end },
  };
};

describe("buildRequestHandler", () => {
  it("returns 404 for non-tile paths", async () => {
    const handler = buildRequestHandler({ getTile: vi.fn() });
    const { writeHead, end, res } = buildResponse();
    await handler({ url: "/health" }, res);
    expect(writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(end).toHaveBeenCalledWith("Not Found");
  });

  it("returns 200 + PNG headers for a valid tile", async () => {
    const tileBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const db = {
      getTile: (z, x, y, cb) => cb(null, tileBuffer, { "Content-Type": "image/png" }),
    };
    const handler = buildRequestHandler(db);
    const { writeHead, end, res } = buildResponse();
    await handler({ url: "/3/2/1.png" }, res);
    expect(writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ "Content-Type": "image/png" })
    );
    expect(end).toHaveBeenCalledWith(tileBuffer);
  });

  it("returns 404 when the underlying reader signals 'tile does not exist'", async () => {
    const db = {
      getTile: (_z, _x, _y, cb) => cb(new Error("Tile does not exist")),
    };
    const handler = buildRequestHandler(db);
    const { writeHead, end, res } = buildResponse();
    await handler({ url: "/0/0/0.png" }, res);
    expect(writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(end).toHaveBeenCalledWith("Tile not found");
  });

  it("returns 500 on unexpected reader failures", async () => {
    const db = {
      getTile: (_z, _x, _y, cb) => cb(new Error("disk corrupt")),
    };
    const log = { info() {}, warn() {}, error: vi.fn() };
    const handler = buildRequestHandler(db, log);
    const { writeHead, end, res } = buildResponse();
    await handler({ url: "/0/0/0.png" }, res);
    expect(writeHead).toHaveBeenCalledWith(500, expect.any(Object));
    expect(log.error).toHaveBeenCalled();
  });

  it("converts the requested XYZ y to TMS row before calling the reader", async () => {
    const captured = vi.fn((_z, _x, _y, cb) => cb(null, Buffer.from([0]), {}));
    const handler = buildRequestHandler({ getTile: captured });
    await handler({ url: "/2/1/0.png" }, buildResponse().res);
    // At zoom 2, XYZ y=0 maps to TMS row = 2^2 - 1 - 0 = 3.
    expect(captured).toHaveBeenCalledWith(2, 1, 3, expect.any(Function));
  });
});
