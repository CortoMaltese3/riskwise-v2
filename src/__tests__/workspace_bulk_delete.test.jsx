import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const deleteScenarioMock = vi.fn();
const enqueueToastMock = vi.fn();

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    listScenarios: vi.fn().mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: [] },
    }),
    deleteScenario: (...args) => deleteScenarioMock(...args),
    patchScenario: vi.fn(),
    listSnapshots: vi.fn().mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: [] },
    }),
  },
}));

vi.mock("../hooks/useToast", async () => {
  const actual = await vi.importActual("../hooks/useToast");
  return {
    ...actual,
    enqueueToast: (...args) => enqueueToastMock(...args),
  };
});

let WorkspaceView;
let useWorkspaceStore;

beforeAll(async () => {
  ({ default: WorkspaceView } = await import("../components/workspace/WorkspaceView"));
  ({ default: useWorkspaceStore } = await import("../store/useWorkspaceStore"));
}, 60000);

const buildFixture = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `s-${i + 1}`,
    name: `Scenario ${i + 1}`,
    country: "Egypt",
    hazard_type: "flood",
    tags: null,
    notes: null,
    status: "completed",
    created_at: `2026-04-${20 - i}T10:00:00Z`,
  }));

const okDeleteResponse = (id) => ({
  success: true,
  result: { status: { code: 2000 }, data: { id } },
});

const failedDeleteResponse = () => ({
  success: false,
  error: { message: "boom" },
});

const renderWithSelection = (scenarios, selectedIds = []) => {
  useWorkspaceStore.setState({
    scenarios,
    selectedIds,
    pinnedIds: [],
    error: "",
    search: "",
    countryFilter: "",
    hazardFilter: "",
    sortKey: "created_at",
    sortDir: "desc",
    lastSyncAt: new Date().toISOString(),
  });
  return render(<WorkspaceView initialScenarios={scenarios} />);
};

beforeEach(() => {
  deleteScenarioMock.mockReset();
  enqueueToastMock.mockReset();
  globalThis.localStorage?.clear();
  window.electron = { ...(window.electron || {}), exportPdf: vi.fn() };
  window.api = {
    http: {
      getBaseUrl: vi.fn().mockResolvedValue(""),
      request: vi.fn().mockResolvedValue({
        success: true,
        result: { data: { scenario: { id: "s-1" }, results: {} } },
      }),
    },
  };
});

afterEach(() => {
  useWorkspaceStore.setState({ selectedIds: [], scenarios: [] });
});

describe("Workspace bulk delete", () => {
  it("hides the bulk action bar when nothing is selected", () => {
    renderWithSelection(buildFixture(3), []);
    expect(screen.queryByLabelText("bulk-action-bar")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("bulk-delete-open")).not.toBeInTheDocument();
  });

  it.each([1, 3, 10])("shows the bar with the right count when %i row(s) are selected", (count) => {
    const scenarios = buildFixture(Math.max(count, 10));
    const ids = scenarios.slice(0, count).map((row) => row.id);
    renderWithSelection(scenarios, ids);

    const bar = screen.getByLabelText("bulk-action-bar");
    expect(bar).toBeInTheDocument();
    const expected = count === 1 ? "1 scenario selected" : `${count} scenarios selected`;
    expect(within(bar).getByText(expected)).toBeInTheDocument();
  });

  it("lists scenario names in the confirm dialog when count <= 5", () => {
    const scenarios = buildFixture(5);
    renderWithSelection(
      scenarios,
      scenarios.map((row) => row.id)
    );

    fireEvent.click(screen.getByLabelText("bulk-delete-open"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete 5 scenarios?")).toBeInTheDocument();
    for (const row of scenarios) {
      expect(within(dialog).getByText(row.name)).toBeInTheDocument();
    }
  });

  it("omits the name list in the confirm dialog when count > 5", () => {
    const scenarios = buildFixture(6);
    renderWithSelection(
      scenarios,
      scenarios.map((row) => row.id)
    );

    fireEvent.click(screen.getByLabelText("bulk-delete-open"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete 6 scenarios?")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/6 scenarios will be permanently deleted/i)
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("Scenario 1")).not.toBeInTheDocument();
  });

  it("cancel closes the dialog without firing any deletes", async () => {
    const scenarios = buildFixture(3);
    renderWithSelection(
      scenarios,
      scenarios.map((row) => row.id)
    );

    fireEvent.click(screen.getByLabelText("bulk-delete-open"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deleteScenarioMock).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().selectedIds).toEqual(["s-1", "s-2", "s-3"]);
  });

  it("clear selection button empties selectedIds and hides the bar", async () => {
    const scenarios = buildFixture(3);
    renderWithSelection(
      scenarios,
      scenarios.map((row) => row.id)
    );

    fireEvent.click(screen.getByLabelText("bulk-clear-selection"));

    await waitFor(() => expect(useWorkspaceStore.getState().selectedIds).toEqual([]));
    expect(screen.queryByLabelText("bulk-action-bar")).not.toBeInTheDocument();
  });

  it("confirm calls deleteScenario per id, clears selection, and fires a success toast", async () => {
    deleteScenarioMock.mockImplementation((id) => Promise.resolve(okDeleteResponse(id)));
    const scenarios = buildFixture(3);
    renderWithSelection(
      scenarios,
      scenarios.map((row) => row.id)
    );

    fireEvent.click(screen.getByLabelText("bulk-delete-open"));
    fireEvent.click(screen.getByLabelText("bulk-delete-confirm"));

    await waitFor(() => expect(deleteScenarioMock).toHaveBeenCalledTimes(3));
    expect(deleteScenarioMock).toHaveBeenCalledWith("s-1");
    expect(deleteScenarioMock).toHaveBeenCalledWith("s-2");
    expect(deleteScenarioMock).toHaveBeenCalledWith("s-3");

    await waitFor(() => expect(useWorkspaceStore.getState().selectedIds).toEqual([]));

    expect(enqueueToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "3 scenarios deleted",
      })
    );
  });

  it("partial failures fire an error toast with success/fail counts", async () => {
    deleteScenarioMock.mockImplementation((id) => {
      if (id === "s-2") return Promise.reject(new Error("network"));
      if (id === "s-4") return Promise.resolve(failedDeleteResponse());
      return Promise.resolve(okDeleteResponse(id));
    });

    const scenarios = buildFixture(4);
    renderWithSelection(
      scenarios,
      scenarios.map((row) => row.id)
    );

    fireEvent.click(screen.getByLabelText("bulk-delete-open"));
    fireEvent.click(screen.getByLabelText("bulk-delete-confirm"));

    await waitFor(() => expect(deleteScenarioMock).toHaveBeenCalledTimes(4));

    await waitFor(() =>
      expect(enqueueToastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Deleted 2 of 4 scenarios. 2 failed.",
        })
      )
    );

    expect(useWorkspaceStore.getState().selectedIds).toEqual([]);
    const remainingIds = useWorkspaceStore
      .getState()
      .scenarios.map((row) => row.id)
      .sort();
    expect(remainingIds).toEqual(["s-2", "s-4"]);
  });
});
