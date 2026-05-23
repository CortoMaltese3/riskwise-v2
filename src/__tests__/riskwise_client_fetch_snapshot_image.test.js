import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RiskWiseClient from "../lib/RiskWiseClient";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.window = globalThis.window ?? {};
  globalThis.window.api = {
    http: {
      getBaseUrl: vi.fn().mockResolvedValue("http://127.0.0.1:8000"),
    },
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("RiskWiseClient.fetchSnapshotImage", () => {
  it("returns the response blob in the success envelope on 2xx", async () => {
    const blob = new Blob(["png-bytes"], { type: "image/png" });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => blob,
    });

    const res = await RiskWiseClient.fetchSnapshotImage("snap-1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/snapshots/snap-1/image"
    );
    expect(res).toMatchObject({ success: true, result: blob });
  });

  it("returns a structured error envelope on a non-2xx response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      blob: async () => new Blob(),
    });

    const res = await RiskWiseClient.fetchSnapshotImage("snap-missing");

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("snapshot_image_http_error");
      expect(res.error.message).toContain("404");
      expect(res.error.error_id).toBeTruthy();
    }
  });

  it("returns a structured error envelope when fetch itself throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const res = await RiskWiseClient.fetchSnapshotImage("snap-1");

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("snapshot_image_fetch_error");
      expect(res.error.message).toBe("Failed to fetch");
      expect(res.error.detail).toBe("Failed to fetch");
      expect(res.error.error_id).toBeTruthy();
    }
  });

  it("URL-encodes the snapshot id and prefixes with the resolved base URL", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(),
    });

    await RiskWiseClient.fetchSnapshotImage("with spaces/and?special");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/snapshots/with%20spaces%2Fand%3Fspecial/image"
    );
  });

  it("treats a null base URL as empty so the request becomes a relative path", async () => {
    globalThis.window.api.http.getBaseUrl = vi.fn().mockResolvedValue(null);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(),
    });

    await RiskWiseClient.fetchSnapshotImage("snap-1");

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/v1/snapshots/snap-1/image");
  });
});
