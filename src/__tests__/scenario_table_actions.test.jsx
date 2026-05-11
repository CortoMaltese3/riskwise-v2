import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// `ScenarioTable` reads `pinnedIds`, `togglePinned`, and `scenarioRunCode`
// from the workspace store. The component is rendered directly (without
// `WorkspaceView`) so the surface under test is the inline action icons.
vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    listScenarios: vi.fn().mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: [] },
    }),
  },
}));

let ScenarioTable;
let useWorkspaceStore;

beforeAll(async () => {
  ({ default: ScenarioTable } = await import("../components/workspace/ScenarioTable"));
  ({ default: useWorkspaceStore } = await import("../store/useWorkspaceStore"));
}, 60000);

const ROW = {
  id: "scn-1",
  name: "Egypt flood run",
  country: "Egypt",
  hazard_type: "flood",
  tags: null,
  created_at: "2026-04-20T10:00:00Z",
};

// `useMediaQuery` reads from `window.matchMedia`, which jsdom does not
// implement. Each test installs its own mock so the wide-vs-narrow viewport
// branch can be exercised deterministically.
const installMatchMedia = (matches) => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

const renderTable = (props = {}) =>
  render(
    <ScenarioTable
      rows={[ROW]}
      selectedIds={[]}
      sortKey="created_at"
      sortDir="desc"
      onSort={vi.fn()}
      onToggleSelected={vi.fn()}
      onToggleAll={vi.fn()}
      onRename={vi.fn()}
      {...props}
    />
  );

beforeEach(() => {
  installMatchMedia(false);
  useWorkspaceStore.setState({
    pinnedIds: [],
    scenarioRunCode: "",
  });
});

afterEach(() => {
  delete window.matchMedia;
});

describe("ScenarioTable inline action icons (#393)", () => {
  it("renders all four action icons per row with the expected aria labels", () => {
    renderTable({ onAction: vi.fn() });

    expect(screen.getByLabelText("restore-scn-1")).toBeInTheDocument();
    expect(screen.getByLabelText("rename-scn-1")).toBeInTheDocument();
    expect(screen.getByLabelText("export-pdf-scn-1")).toBeInTheDocument();
    expect(screen.getByLabelText("delete-scn-1")).toBeInTheDocument();
  });

  it("shows the 'Actions' column header label", () => {
    renderTable({ onAction: vi.fn() });
    expect(screen.getByRole("columnheader", { name: /actions/i })).toBeInTheDocument();
  });

  it("does NOT render a Status column header anymore", () => {
    renderTable({ onAction: vi.fn() });
    expect(screen.queryByRole("columnheader", { name: /status/i })).not.toBeInTheDocument();
  });

  it("invokes onAction('restore', row) when the Restore icon is clicked", () => {
    const onAction = vi.fn();
    renderTable({ onAction });
    fireEvent.click(screen.getByLabelText("restore-scn-1"));
    expect(onAction).toHaveBeenCalledWith("restore", ROW);
  });

  it("disables the Restore icon when scenarioRunCode matches the row id", () => {
    useWorkspaceStore.setState({ scenarioRunCode: "scn-1" });
    renderTable({ onAction: vi.fn() });
    expect(screen.getByLabelText("restore-scn-1")).toBeDisabled();
  });

  it("keeps the Restore icon enabled when scenarioRunCode does not match", () => {
    useWorkspaceStore.setState({ scenarioRunCode: "other-id" });
    renderTable({ onAction: vi.fn() });
    expect(screen.getByLabelText("restore-scn-1")).not.toBeDisabled();
  });

  it("puts the name cell into editing mode when the Rename icon is clicked", () => {
    renderTable({ onAction: vi.fn() });
    fireEvent.click(screen.getByLabelText("rename-scn-1"));
    // The icon and the text input both relate to the rename flow, but the
    // text input uses its own `rename-input-<id>` label so we can target
    // them independently.
    expect(screen.getByLabelText("rename-input-scn-1")).toBeInTheDocument();
  });

  it("invokes onAction('export-pdf', row) when the Export PDF icon is clicked", () => {
    const onAction = vi.fn();
    renderTable({ onAction });
    fireEvent.click(screen.getByLabelText("export-pdf-scn-1"));
    expect(onAction).toHaveBeenCalledWith("export-pdf", ROW);
  });

  describe("Delete confirmation dialog", () => {
    it("opens the dialog on Delete click without firing onAction immediately", async () => {
      const onAction = vi.fn();
      renderTable({ onAction });

      fireEvent.click(screen.getByLabelText("delete-scn-1"));

      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
      expect(onAction).not.toHaveBeenCalled();
    });

    it("closes the dialog without invoking onAction when Cancel is clicked", async () => {
      const onAction = vi.fn();
      renderTable({ onAction });

      fireEvent.click(screen.getByLabelText("delete-scn-1"));
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      // The Cancel button uses the existing shared `cancel` i18n key.
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(onAction).not.toHaveBeenCalled();
    });

    it("invokes onAction('delete', row) exactly once and closes when confirmed", async () => {
      const onAction = vi.fn();
      renderTable({ onAction });

      fireEvent.click(screen.getByLabelText("delete-scn-1"));
      fireEvent.click(screen.getByLabelText("delete-confirm-scn-1"));

      await waitFor(() => expect(onAction).toHaveBeenCalledWith("delete", ROW));
      expect(onAction).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
  });

  describe("Responsive collapse below sm (< 600px)", () => {
    beforeEach(() => {
      installMatchMedia(true);
    });

    it("renders the kebab and hides the inline icons", () => {
      renderTable({ onAction: vi.fn() });

      expect(screen.getByLabelText("actions-scn-1")).toBeInTheDocument();
      expect(screen.queryByLabelText("restore-scn-1")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("rename-scn-1")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("export-pdf-scn-1")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("delete-scn-1")).not.toBeInTheDocument();
    });

    it("disables the Restore menu item when the row is the active scenario", () => {
      useWorkspaceStore.setState({ scenarioRunCode: "scn-1" });
      renderTable({ onAction: vi.fn() });

      fireEvent.click(screen.getByLabelText("actions-scn-1"));
      const restoreItem = screen.getByRole("menuitem", { name: /already active/i });
      expect(restoreItem).toHaveAttribute("aria-disabled", "true");
    });

    it("routes Delete through the confirm dialog (not an immediate onAction)", async () => {
      const onAction = vi.fn();
      renderTable({ onAction });

      fireEvent.click(screen.getByLabelText("actions-scn-1"));
      fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));

      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
      expect(onAction).not.toHaveBeenCalled();

      fireEvent.click(screen.getByLabelText("delete-confirm-scn-1"));
      await waitFor(() => expect(onAction).toHaveBeenCalledWith("delete", ROW));
    });
  });
});
