// Unit tests for the snapshot-capture helper in ``mapTools.js`` (#362).
//
// ``handleCaptureSnapshot`` is composed inside a React hook and pulls state
// from multiple Zustand stores, so the unit test exercises the lower-level
// ``captureToScenario`` adapter instead. ``handleCaptureSnapshot`` itself is
// a thin switch on UI state that forwards the resolved surface — the tag
// added by ``handleCaptureSnapshot`` is the ``surface`` argument here, so
// inspecting what ``captureToScenario`` posts is the right unit-level check
// for the per-domain routing rule.

import { describe, it, expect, vi, beforeEach } from "vitest";

const createSnapshotMock = vi.fn();

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    createSnapshot: (...args) => createSnapshotMock(...args),
  },
}));

let captureToScenario;

beforeEach(async () => {
  createSnapshotMock.mockReset();
  ({ captureToScenario } = await import("./mapTools.js"));
});

const successResponse = (data) => ({
  success: true,
  result: { status: { code: 2000 }, data },
});

describe("captureToScenario (snapshot capture surface tagging)", () => {
  it("forwards surface='exposure' when an exposure map is captured", async () => {
    createSnapshotMock.mockResolvedValue(
      successResponse({ id: "snap-1", scenario_id: "scn-1", surface: "exposure" })
    );

    await captureToScenario({
      scenarioId: "scn-1",
      snapshotType: "map",
      base64: "AAAA",
      surface: "exposure",
    });

    expect(createSnapshotMock).toHaveBeenCalledTimes(1);
    const [scenarioId, body] = createSnapshotMock.mock.calls[0];
    expect(scenarioId).toBe("scn-1");
    expect(body).toEqual({
      snapshot_type: "map",
      image_base64: "AAAA",
      surface: "exposure",
    });
  });

  it("forwards surface='hazard' when a hazard map is captured", async () => {
    createSnapshotMock.mockResolvedValue(successResponse({ id: "snap-h" }));
    await captureToScenario({
      scenarioId: "scn-1",
      snapshotType: "map",
      base64: "AAAA",
      surface: "hazard",
    });
    expect(createSnapshotMock.mock.calls[0][1].surface).toBe("hazard");
  });

  it("tags waterfall captures with surface='impact'", async () => {
    createSnapshotMock.mockResolvedValue(successResponse({ id: "snap-w" }));
    await captureToScenario({
      scenarioId: "scn-1",
      snapshotType: "waterfall",
      base64: "BBBB",
      surface: "impact",
    });
    expect(createSnapshotMock.mock.calls[0][1]).toEqual({
      snapshot_type: "waterfall",
      image_base64: "BBBB",
      surface: "impact",
    });
  });

  it("tags cost-benefit captures with surface='adaptation'", async () => {
    createSnapshotMock.mockResolvedValue(successResponse({ id: "snap-c" }));
    await captureToScenario({
      scenarioId: "scn-1",
      snapshotType: "cost_benefit",
      base64: "CCCC",
      surface: "adaptation",
    });
    expect(createSnapshotMock.mock.calls[0][1]).toEqual({
      snapshot_type: "cost_benefit",
      image_base64: "CCCC",
      surface: "adaptation",
    });
  });

  it("omits surface from the body when none is provided (back-compat)", async () => {
    // Legacy callers that pre-date #362 still post a valid body without
    // ``surface``; ``captureToScenario`` must not send ``surface: undefined``
    // because the FastAPI ``extra=forbid`` parser is strict about keys.
    createSnapshotMock.mockResolvedValue(successResponse({ id: "snap-x" }));
    await captureToScenario({
      scenarioId: "scn-1",
      snapshotType: "map",
      base64: "DDDD",
    });
    const body = createSnapshotMock.mock.calls[0][1];
    expect("surface" in body).toBe(false);
  });

  it("throws when the backend returns a non-2000 envelope", async () => {
    createSnapshotMock.mockResolvedValue({
      success: false,
      error: { message: "boom" },
    });
    await expect(
      captureToScenario({
        scenarioId: "scn-1",
        snapshotType: "map",
        base64: "EEEE",
        surface: "impact",
      })
    ).rejects.toThrow("boom");
  });
});
