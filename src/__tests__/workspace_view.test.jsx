import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const deleteScenarioMock = vi.fn();
const patchScenarioMock = vi.fn();
const listSnapshotsMock = vi.fn();

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    listScenarios: vi.fn().mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: [] },
    }),
    deleteScenario: (...args) => deleteScenarioMock(...args),
    patchScenario: (...args) => patchScenarioMock(...args),
    listSnapshots: (...args) => listSnapshotsMock(...args),
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
    tags: "eg",
    notes: null,
    status: "completed",
    created_at: "2026-04-20T10:00:00Z",
  },
  {
    id: "s-2",
    name: "Thailand drought",
    country: "Thailand",
    hazard_type: "drought",
    tags: null,
    notes: null,
    status: "completed",
    created_at: "2026-04-19T10:00:00Z",
  },
  {
    id: "s-3",
    name: "Egypt heatwave",
    country: "Egypt",
    hazard_type: "heatwave",
    tags: null,
    notes: null,
    status: "completed",
    created_at: "2026-04-18T10:00:00Z",
  },
];

const renderView = (initialScenarios = FIXTURE) =>
  render(<WorkspaceView initialScenarios={initialScenarios} />);

beforeEach(() => {
  deleteScenarioMock.mockReset();
  patchScenarioMock.mockReset();
  listSnapshotsMock.mockReset();
  useWorkspaceStore.setState({
    scenarios: [],
    search: "",
    countryFilter: "",
    hazardFilter: "",
    sortKey: "created_at",
    sortDir: "desc",
    selectedIds: [],
    error: "",
  });
});

describe("WorkspaceView", () => {
  it("renders 3 mock scenarios, searches to 1, deletes it", async () => {
    deleteScenarioMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: { id: "s-2" } },
    });

    renderView();

    expect(screen.getByText("Egypt flood run")).toBeInTheDocument();
    expect(screen.getByText("Thailand drought")).toBeInTheDocument();
    expect(screen.getByText("Egypt heatwave")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("search-scenarios"), {
      target: { value: "Thailand" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Egypt flood run")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Egypt heatwave")).not.toBeInTheDocument();
    expect(screen.getByText("Thailand drought")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("actions-s-2"));
    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => expect(deleteScenarioMock).toHaveBeenCalledWith("s-2"));
    await waitFor(() => expect(screen.queryByText("Thailand drought")).not.toBeInTheDocument());
  });

  it("shows the empty state CTA when no scenarios exist", () => {
    renderView([]);
    expect(screen.getByText(/no scenarios yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run your first scenario/i })).toBeInTheDocument();
  });

  it("calls patchScenario on Enter after double-clicking the name cell", async () => {
    patchScenarioMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: { id: "s-1", name: "Renamed" } },
    });

    renderView();

    fireEvent.doubleClick(screen.getByTestId("name-cell-s-1"));
    const input = screen.getByLabelText("rename-s-1");
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(patchScenarioMock).toHaveBeenCalledWith("s-1", { name: "Renamed" }));
  });
});
