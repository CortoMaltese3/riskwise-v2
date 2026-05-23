import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const listSnapshotsMock = vi.fn();
const fetchSnapshotImageMock = vi.fn();
vi.mock("../../../../lib/RiskWiseClient", () => ({
  default: {
    listSnapshots: (...args: unknown[]) => listSnapshotsMock(...args),
    fetchSnapshotImage: (...args: unknown[]) => fetchSnapshotImageMock(...args),
  },
}));

import { useSnapshotFigures } from "./useSnapshotFigures";

interface SnapshotFixture {
  id: string;
  snapshot_type: string;
  surface?: "hazard" | "exposure" | "impact" | "adaptation" | null;
  title?: string | null;
  caption?: string | null;
}

const buildSnapshots = (items: SnapshotFixture[]) =>
  items.map((s) => ({
    id: s.id,
    scenario_id: "scn-1",
    snapshot_type: s.snapshot_type,
    surface: s.surface ?? null,
    title: s.title ?? null,
    caption: s.caption ?? null,
    created_at: "2026-04-20T10:00:00Z",
  }));

beforeEach(() => {
  listSnapshotsMock.mockReset();
  fetchSnapshotImageMock.mockReset();
  let nextBlobId = 0;
  globalThis.URL.createObjectURL = vi.fn(() => `blob:fake-${++nextBlobId}`);
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe("useSnapshotFigures", () => {
  it("returns no figures when snapshotIds is empty, and resolves snapshotsResolved", async () => {
    listSnapshotsMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: buildSnapshots([]) },
    });

    const { result } = renderHook(() => useSnapshotFigures("scn-1", []));

    await waitFor(() => expect(result.current.snapshotsResolved).toBe(true));
    expect(result.current.figures).toEqual([]);
    expect(result.current.allImagesSettled).toBe(true);
    expect(fetchSnapshotImageMock).not.toHaveBeenCalled();
  });

  it("preserves the snapshotIds order in the figures array", async () => {
    listSnapshotsMock.mockResolvedValue({
      success: true,
      result: {
        status: { code: 2000 },
        data: buildSnapshots([
          { id: "snap-a", snapshot_type: "map", surface: "hazard", title: "A" },
          { id: "snap-b", snapshot_type: "map", surface: "impact", title: "B" },
          { id: "snap-c", snapshot_type: "map", surface: "exposure", title: "C" },
        ]),
      },
    });
    fetchSnapshotImageMock.mockImplementation(async (id: string) => ({
      success: true,
      result: new Blob([`bytes-${id}`], { type: "image/png" }),
    }));

    // Caller passes ids in c, a, b order — the hook must keep that order even
    // though listSnapshots returned a, b, c.
    const { result } = renderHook(() =>
      useSnapshotFigures("scn-1", ["snap-c", "snap-a", "snap-b"])
    );

    await waitFor(() => expect(result.current.figures).toHaveLength(3));
    expect(result.current.figures.map((f) => f.id)).toEqual(["snap-c", "snap-a", "snap-b"]);
    expect(result.current.figures.map((f) => f.surface)).toEqual(["exposure", "hazard", "impact"]);
  });

  it("skips a failing single fetch without dropping the remaining figures", async () => {
    listSnapshotsMock.mockResolvedValue({
      success: true,
      result: {
        status: { code: 2000 },
        data: buildSnapshots([
          { id: "ok-1", snapshot_type: "map", surface: "hazard" },
          { id: "broken", snapshot_type: "map", surface: "hazard" },
          { id: "ok-2", snapshot_type: "map", surface: "hazard" },
        ]),
      },
    });
    fetchSnapshotImageMock.mockImplementation(async (id: string) => {
      if (id === "broken") {
        return {
          success: false,
          error: {
            code: "snapshot_image_http_error",
            message: "HTTP 404",
            detail: null,
            error_id: "test",
            request_id: "test",
          },
        };
      }
      return { success: true, result: new Blob([`bytes-${id}`], { type: "image/png" }) };
    });

    const { result } = renderHook(() => useSnapshotFigures("scn-1", ["ok-1", "broken", "ok-2"]));

    await waitFor(() => expect(result.current.snapshotsResolved).toBe(true));
    expect(result.current.figures.map((f) => f.id)).toEqual(["ok-1", "ok-2"]);
  });

  it("revokes every created objectURL when the hook unmounts", async () => {
    listSnapshotsMock.mockResolvedValue({
      success: true,
      result: {
        status: { code: 2000 },
        data: buildSnapshots([
          { id: "snap-a", snapshot_type: "map", surface: "hazard" },
          { id: "snap-b", snapshot_type: "map", surface: "impact" },
        ]),
      },
    });
    fetchSnapshotImageMock.mockImplementation(async (id: string) => ({
      success: true,
      result: new Blob([`bytes-${id}`], { type: "image/png" }),
    }));

    const { result, unmount } = renderHook(() => useSnapshotFigures("scn-1", ["snap-a", "snap-b"]));

    await waitFor(() => expect(result.current.figures).toHaveLength(2));
    const createdUrls = result.current.figures.map((f) => f.imageUrl);

    unmount();
    const revoke = globalThis.URL.revokeObjectURL as unknown as ReturnType<typeof vi.fn>;
    expect(revoke).toHaveBeenCalledTimes(createdUrls.length);
    for (const url of createdUrls) {
      expect(revoke).toHaveBeenCalledWith(url);
    }
  });

  it("counts available map snapshots per surface (mirrors the picker)", async () => {
    listSnapshotsMock.mockResolvedValue({
      success: true,
      result: {
        status: { code: 2000 },
        data: buildSnapshots([
          { id: "h1", snapshot_type: "map", surface: "hazard" },
          { id: "h2", snapshot_type: "map", surface: "hazard" },
          { id: "i1", snapshot_type: "map", surface: "impact" },
          // Non-map snapshots are excluded from the counts even when they
          // share a surface — they don't appear in the picker.
          { id: "w1", snapshot_type: "waterfall", surface: "impact" },
        ]),
      },
    });

    const { result } = renderHook(() => useSnapshotFigures("scn-1", []));

    await waitFor(() => expect(result.current.snapshotsResolved).toBe(true));
    expect(result.current.availableSurfaceCounts).toEqual({
      hazard: 2,
      exposure: 0,
      impact: 1,
      adaptation: 0,
      other: 0,
    });
  });

  it("resolves cleanly when listSnapshots returns a non-2000 status", async () => {
    listSnapshotsMock.mockResolvedValue({
      success: true,
      result: { status: { code: 5000 }, data: null },
    });

    const { result } = renderHook(() => useSnapshotFigures("scn-1", ["whatever"]));

    await waitFor(() => expect(result.current.snapshotsResolved).toBe(true));
    expect(result.current.figures).toEqual([]);
    expect(result.current.availableSurfaceCounts.hazard).toBe(0);
    expect(fetchSnapshotImageMock).not.toHaveBeenCalled();
  });
});
