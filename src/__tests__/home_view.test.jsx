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

beforeAll(async () => {
  ({ default: HomeView } = await import("../components/layout/views/HomeView"));
  ({ default: useStore } = await import("../store"));
  ({ default: useWorkspaceStore } = await import("../store/workspaceSlice"));
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
  useStore.setState({ activeSection: "home" });
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

  it("Need help: Start tour calls store.startTour and Glossary opens drawer", () => {
    render(<HomeView />);
    fireEvent.click(screen.getByTestId("home-start-tour"));
    expect(useStore.getState().activeTour).toBe("first_scenario");

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
});
