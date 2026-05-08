import { afterEach, describe, expect, it, vi } from "vitest";

import RiskWiseClient from "../lib/RiskWiseClient";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("RiskWiseClient.fetchGeoJson", () => {
  it("returns the parsed body in the success envelope on 2xx", async () => {
    const body = { features: [{ id: 1 }], _metadata: { unit: "m" } };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    });

    const res = await RiskWiseClient.fetchGeoJson("app://./__temp/foo.json");

    expect(globalThis.fetch).toHaveBeenCalledWith("app://./__temp/foo.json");
    expect(res).toMatchObject({ success: true, result: body });
  });

  it("returns a structured error envelope on a non-2xx response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const res = await RiskWiseClient.fetchGeoJson("app://./__temp/foo.json");

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("geojson_http_error");
      expect(res.error.message).toContain("503");
      expect(res.error.error_id).toBeTruthy();
    }
  });

  it("returns a structured error envelope when fetch itself throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const res = await RiskWiseClient.fetchGeoJson("app://./__temp/foo.json");

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("geojson_fetch_error");
      expect(res.error.message).toBe("Failed to fetch");
      expect(res.error.detail).toBe("Failed to fetch");
      expect(res.error.error_id).toBeTruthy();
    }
  });

  it("returns a structured error envelope when JSON parsing fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    const res = await RiskWiseClient.fetchGeoJson("app://./__temp/foo.json");

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("geojson_fetch_error");
      expect(res.error.message).toBe("Unexpected token");
    }
  });
});
