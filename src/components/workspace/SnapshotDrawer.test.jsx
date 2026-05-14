// Component tests for the surface chip in ``SnapshotDrawer.jsx`` (#362).
//
// The drawer renders each snapshot's surface as a color-coded chip next to
// the snapshot type. NULL / unknown surfaces collapse to "no chip" so the
// row stays visually quiet for pre-#362 rows.

import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en" },
  }),
}));

const listSnapshotsMock = vi.fn();
const deleteSnapshotMock = vi.fn();
const updateSnapshotMock = vi.fn();

vi.mock("../../lib/RiskWiseClient", () => ({
  default: {
    listSnapshots: (...args) => listSnapshotsMock(...args),
    deleteSnapshot: (...args) => deleteSnapshotMock(...args),
    updateSnapshot: (...args) => updateSnapshotMock(...args),
    snapshotImageUrl: (id) => `/api/v1/snapshots/${id}/image`,
  },
}));

let SnapshotDrawer;

beforeAll(async () => {
  ({ default: SnapshotDrawer } = await import("./SnapshotDrawer.jsx"));
}, 60000);

const makeSnap = (id, surface) => ({
  id,
  scenario_id: "scn-1",
  snapshot_type: "map",
  title: null,
  caption: null,
  surface,
  created_at: "2026-05-11T10:00:00Z",
});

const ok = (snaps) => ({
  success: true,
  result: { status: { code: 2000 }, data: snaps },
});

beforeEach(() => {
  listSnapshotsMock.mockReset();
  deleteSnapshotMock.mockReset();
  updateSnapshotMock.mockReset();
  // The drawer's base-URL probe is best-effort; the test does not need
  // the actual image to render.
  window.api = { http: { getBaseUrl: vi.fn().mockResolvedValue("") } };
});

describe("SnapshotDrawer surface chip", () => {
  it.each([
    ["hazard", "snapshot_surface_hazard"],
    ["exposure", "snapshot_surface_exposure"],
    ["impact", "snapshot_surface_impact"],
    ["adaptation", "snapshot_surface_adaptation"],
  ])("renders the %s chip with the expected label", async (surface, label) => {
    listSnapshotsMock.mockResolvedValue(ok([makeSnap("s-1", surface)]));
    render(<SnapshotDrawer scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("snapshot-surface-s-1")).toBeInTheDocument());
    expect(screen.getByTestId("snapshot-surface-s-1")).toHaveTextContent(label);
  });

  it("omits the chip when surface is null", async () => {
    listSnapshotsMock.mockResolvedValue(ok([makeSnap("s-null", null)]));
    render(<SnapshotDrawer scenarioId="scn-1" />);

    // Wait for the snapshot to render before asserting absence — otherwise
    // the assertion can pass during the loading state and miss a bug where
    // the chip is mistakenly emitted for a null value.
    await waitFor(() => expect(screen.getByTestId("snapshot-drawer")).toBeInTheDocument());
    expect(screen.queryByTestId("snapshot-surface-s-null")).toBeNull();
  });

  it("omits the chip when surface is an unknown value", async () => {
    // Defence in depth: the boundary validator rejects unknown values, but
    // the drawer also falls back to "no chip" so an out-of-band write does
    // not crash the UI.
    listSnapshotsMock.mockResolvedValue(ok([makeSnap("s-bad", "macroeconomic")]));
    render(<SnapshotDrawer scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("snapshot-drawer")).toBeInTheDocument());
    expect(screen.queryByTestId("snapshot-surface-s-bad")).toBeNull();
  });
});
