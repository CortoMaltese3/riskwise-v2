import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

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

const { restoreScenarioMock, enqueueToastMock } = vi.hoisted(() => ({
  restoreScenarioMock: vi.fn(),
  enqueueToastMock: vi.fn(),
}));

vi.mock("../utils/reportTools", () => ({
  useReportTools: () => ({ restoreScenario: restoreScenarioMock }),
}));

vi.mock("../hooks/useToast", () => ({
  enqueueToast: enqueueToastMock,
}));

vi.mock("../../CHANGELOG.md?raw", () => ({
  default: [
    "# Changelog",
    "",
    "## Unreleased",
    "- placeholder",
    "",
    "## [1.4.0](https://example.com) (2026-04-30)",
    "",
    "### Features",
    "- Feature one",
    "- Feature two",
  ].join("\n"),
}));

let HomeView;
let useStore;
let useWorkspaceStore;
let useResultsStore;

beforeAll(async () => {
  ({ default: HomeView } = await import("../components/layout/views/HomeView"));
  ({ default: useStore } = await import("../store/useUIStore"));
  ({ default: useWorkspaceStore } = await import("../store/useWorkspaceStore"));
  ({ default: useResultsStore } = await import("../store/useResultsStore"));
}, 60000);

const FIXTURE = [
  {
    id: "s-1",
    name: "Egypt flood run",
    country: "Egypt",
    hazard_type: "flood",
    status: "completed",
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "s-2",
    name: "Thailand drought",
    country: "Thailand",
    hazard_type: "drought",
    status: "completed",
    created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  },
];

beforeEach(() => {
  globalThis.localStorage?.clear();
  window.electron = {
    engine: {
      checkBlocked: vi.fn().mockResolvedValue({ ok: true, blocked: false }),
      downloadUpdate: vi.fn(),
    },
  };
  restoreScenarioMock.mockReset();
  enqueueToastMock.mockReset();
  useStore.setState({ activeSection: "home", modalMessage: "", progress: 0 });
  useResultsStore.setState({
    scenarioPhase: null,
    activeRunSummary: null,
    isScenarioRunning: false,
  });
  useWorkspaceStore.setState({
    scenarios: FIXTURE,
    pinnedIds: [],
    error: "",
    loading: false,
    selectedIds: [],
    sortKey: "created_at",
    sortDir: "desc",
    search: "",
    countryFilter: "",
    hazardFilter: "",
    // Pre-set so loadScenarios() short-circuits in the mount effect.
    lastSyncAt: new Date().toISOString(),
  });
});

afterEach(() => {
  cleanup();
  delete window.electron;
});

describe("HomeView", () => {
  it("renders three GET STARTED CTAs that switch activeSection", () => {
    render(<HomeView />);
    fireEvent.click(screen.getByTestId("home-cta-risk"));
    expect(useStore.getState().activeSection).toBe("risk");
    fireEvent.click(screen.getByTestId("home-cta-macro"));
    expect(useStore.getState().activeSection).toBe("macro");
    fireEvent.click(screen.getByTestId("home-cta-workspace"));
    expect(useStore.getState().activeSection).toBe("workspace");
  });

  it("renders recent projects from the workspace store", () => {
    render(<HomeView />);
    expect(screen.getByText("Egypt flood run")).toBeInTheDocument();
    expect(screen.getByText("Thailand drought")).toBeInTheDocument();
  });

  it("renders Pinned tile when an id is pinned", () => {
    useWorkspaceStore.setState({ pinnedIds: ["s-1"] });
    render(<HomeView />);
    expect(screen.getByTestId("home-pinned-s-1")).toBeInTheDocument();
  });

  it("renders the first-run card when no scenarios exist", () => {
    useWorkspaceStore.setState({ scenarios: [] });
    render(<HomeView />);
    expect(screen.getByTestId("home-firstrun-card")).toBeInTheDocument();
    expect(screen.queryByTestId("home-recent-card")).toBeNull();
    expect(screen.queryByTestId("home-pinned-card")).toBeNull();
  });

  it("System status engine row reflects useEngineStatus signal", async () => {
    window.electron.engine.checkBlocked.mockResolvedValue({ ok: true, blocked: true });
    render(<HomeView />);
    expect(await screen.findByText("Update required")).toBeInTheDocument();
  });

  it("renders What's new card with the most recent dated release", () => {
    render(<HomeView />);
    expect(screen.getByText("What's new in 1.4.0")).toBeInTheDocument();
    expect(screen.getByText("Feature one")).toBeInTheDocument();
    expect(screen.getByText("Feature two")).toBeInTheDocument();
  });

  it("renders the four external resource links", () => {
    render(<HomeView />);
    expect(screen.getByTestId("home-resources-link-climada")).toHaveAttribute("target", "_blank");
    expect(screen.getByTestId("home-resources-link-ckp")).toBeInTheDocument();
    expect(screen.getByTestId("home-resources-link-emdat")).toBeInTheDocument();
    expect(screen.getByTestId("home-resources-link-giz")).toBeInTheDocument();
  });

  it("Need help: Glossary opens drawer", () => {
    render(<HomeView />);
    fireEvent.click(screen.getByTestId("home-open-glossary"));
    expect(useStore.getState().glossaryOpen).toBe(true);
  });

  it("renders the loading skeleton for Recent and Pinned while loading", () => {
    useWorkspaceStore.setState({ loading: true, scenarios: [] });
    render(<HomeView />);
    expect(screen.getByTestId("home-recent-loading")).toBeInTheDocument();
    expect(screen.getByTestId("home-pinned-loading")).toBeInTheDocument();
  });

  it("renders the error alert for Recent and Pinned when error is set", () => {
    useWorkspaceStore.setState({ error: "boom" });
    render(<HomeView />);
    expect(screen.getByTestId("home-recent-error")).toBeInTheDocument();
    expect(screen.getByTestId("home-pinned-error")).toBeInTheDocument();
  });

  it("renders the active run card when a scenario is running", () => {
    useResultsStore.setState({
      scenarioPhase: "running",
      activeRunSummary: {
        country: "Egypt",
        hazard: "flood",
        timeHorizonStart: 2030,
        timeHorizonEnd: 2050,
      },
    });
    render(<HomeView />);
    expect(screen.getByTestId("home-active-run-card")).toBeInTheDocument();
  });

  it("hides the active run card when scenarioPhase is null", () => {
    render(<HomeView />);
    expect(screen.queryByTestId("home-active-run-card")).toBeNull();
  });

  it("shows the 'Last completed' hint when at least one scenario is completed", () => {
    render(<HomeView />);
    expect(screen.getByTestId("home-recent-last-completed")).toBeInTheDocument();
  });

  it("hides the 'Last completed' hint when no scenarios are completed", () => {
    useWorkspaceStore.setState({
      scenarios: [
        {
          id: "s-3",
          name: "queued run",
          status: "queued",
          created_at: new Date().toISOString(),
        },
      ],
    });
    render(<HomeView />);
    expect(screen.queryByTestId("home-recent-last-completed")).toBeNull();
  });

  it("clicking a recent row opens the restore-confirm dialog with the row name", () => {
    render(<HomeView />);
    fireEvent.click(screen.getByTestId("home-recent-row-s-1"));
    const dialog = screen.getByTestId("home-restore-confirm-dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog.textContent).toContain("Egypt flood run");
    expect(restoreScenarioMock).not.toHaveBeenCalled();
  });

  it("cancelling the dialog does not call restoreScenario and leaves the section unchanged", () => {
    render(<HomeView />);
    fireEvent.click(screen.getByTestId("home-recent-row-s-1"));
    fireEvent.click(screen.getByTestId("home-restore-confirm-cancel"));
    expect(restoreScenarioMock).not.toHaveBeenCalled();
    expect(useStore.getState().activeSection).toBe("home");
  });

  it("confirming the dialog restores the scenario and switches to the risk section", async () => {
    restoreScenarioMock.mockResolvedValue(true);
    render(<HomeView />);
    fireEvent.click(screen.getByTestId("home-recent-row-s-1"));
    fireEvent.click(screen.getByTestId("home-restore-confirm-action"));
    await screen.findByTestId("home-view");
    // Allow the await inside handleConfirmRestore to flush.
    await Promise.resolve();
    await Promise.resolve();
    expect(restoreScenarioMock).toHaveBeenCalledWith("s-1");
    expect(useStore.getState().activeSection).toBe("risk");
    expect(enqueueToastMock).toHaveBeenCalledWith(expect.objectContaining({ severity: "success" }));
  });

  it("clicking a pinned tile opens the restore-confirm dialog", () => {
    useWorkspaceStore.setState({ pinnedIds: ["s-1"] });
    render(<HomeView />);
    fireEvent.click(screen.getByTestId("home-pinned-s-1"));
    expect(screen.getByTestId("home-restore-confirm-dialog")).toBeInTheDocument();
  });

  it("clicking the pinned unpin icon does not open the restore-confirm dialog", () => {
    useWorkspaceStore.setState({ pinnedIds: ["s-1"] });
    render(<HomeView />);
    fireEvent.click(screen.getByTestId("home-pinned-unpin-s-1"));
    expect(screen.queryByTestId("home-restore-confirm-dialog")).toBeNull();
  });
});
