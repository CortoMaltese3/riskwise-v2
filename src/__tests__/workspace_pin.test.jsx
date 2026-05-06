import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    listScenarios: vi.fn().mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: [] },
    }),
    deleteScenario: vi.fn(),
    patchScenario: vi.fn(),
    listSnapshots: vi.fn().mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: [] },
    }),
  },
}));

let WorkspaceView;
let useWorkspaceStore;

beforeAll(async () => {
  ({ default: WorkspaceView } = await import("../components/workspace/WorkspaceView"));
  ({ default: useWorkspaceStore } = await import("../store/workspaceSlice"));
}, 60000);

const FIXTURE = [
  {
    id: "s-1",
    name: "Egypt flood run",
    country: "Egypt",
    hazard_type: "flood",
    status: "completed",
    created_at: "2026-04-20T10:00:00Z",
  },
  {
    id: "s-2",
    name: "Thailand drought",
    country: "Thailand",
    hazard_type: "drought",
    status: "completed",
    created_at: "2026-04-19T10:00:00Z",
  },
];

beforeEach(() => {
  globalThis.localStorage?.clear();
  useWorkspaceStore.setState({
    scenarios: [],
    pinnedIds: [],
    error: "",
    selectedIds: [],
    sortKey: "created_at",
    sortDir: "desc",
    search: "",
    countryFilter: "",
    hazardFilter: "",
    lastSyncAt: null,
  });
});

describe("Workspace pin/unpin", () => {
  it("toggles pinned state and persists to localStorage", () => {
    render(<WorkspaceView initialScenarios={FIXTURE} />);
    const pinButton = screen.getByTestId("pin-s-1");
    expect(pinButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(pinButton);
    expect(pinButton).toHaveAttribute("aria-pressed", "true");
    expect(useWorkspaceStore.getState().pinnedIds).toContain("s-1");
    expect(JSON.parse(globalThis.localStorage.getItem("riskwise.pinnedScenarioIds"))).toEqual([
      "s-1",
    ]);

    fireEvent.click(pinButton);
    expect(pinButton).toHaveAttribute("aria-pressed", "false");
    expect(useWorkspaceStore.getState().pinnedIds).not.toContain("s-1");
  });

  it("setPinnedIds rejects non-string entries", () => {
    useWorkspaceStore.getState().setPinnedIds(["a", 1, null, "b"]);
    expect(useWorkspaceStore.getState().pinnedIds).toEqual(["a", "b"]);
  });
});
