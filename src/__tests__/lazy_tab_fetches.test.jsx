// Coverage for #248: tab-entry data fetches were moved out of
// MainTabs.handleTabChange and into the views that consume them. These tests
// verify (a) MainTabs no longer triggers fetches when the user clicks a tab,
// (b) ReportsView lazy-fetches reports on mount and doesn't double-fetch when
// rapidly remounted while a fetch is still in flight, and (c) MainView's
// macro branch lazy-loads CRED data on activation with the same guard.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import theme from "../theme/theme";

const fetchReportsMock = vi.fn();
const loadCREDOutputDataMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

vi.mock("../utils/reportTools", () => ({
  useReportTools: () => ({
    fetchReports: fetchReportsMock,
    restoreScenario: vi.fn(),
    getReport: vi.fn(),
  }),
}));

vi.mock("../utils/macroTools", () => ({
  useMacroTools: () => ({
    loadCREDOutputData: loadCREDOutputDataMock,
    generateChartFromCREDData: vi.fn(),
  }),
}));

// MainView's macro branch renders MacroEconomicChart, which pulls in chart.js
// and the canvas-bound react-chartjs-2 wrapper. The unit under test is the
// fetch effect, not the chart, so stub the chart out.
vi.mock("../components/charts/MacroEconomicChart", () => ({
  default: () => <div data-testid="macro-chart" />,
}));
// Same reasoning for the other heavy children of MainView — they aren't part
// of the assertions and dragging them in would couple the test to leaflet et
// al.
vi.mock("../components/map/MapLayout", () => ({ default: () => <div /> }));
vi.mock("../components/map/AdaptationMap", () => ({ default: () => <div /> }));
vi.mock("../components/controls/RiskChartLayout", () => ({ default: () => <div /> }));
vi.mock("../components/controls/AdaptationChartLayout", () => ({ default: () => <div /> }));
vi.mock("../components/controls/MainViewControls", () => ({ default: () => <div /> }));
vi.mock("../components/controls/MacroViewControls", () => ({ default: () => <div /> }));
vi.mock("../components/main/MainViewToolbar", () => ({ default: () => <div /> }));
vi.mock("../components/title/MainViewTitle", () => ({ default: () => <div /> }));
vi.mock("../components/cards/ViewCard", () => ({ default: () => <div /> }));
vi.mock("../components/cards/ViewMacroCard", () => ({ default: () => <div /> }));
vi.mock("../components/reports/ReportCard", () => ({
  default: () => <div data-testid="report-card" />,
}));

import MainTabs from "../components/main/MainTabs";
import MainView from "../components/main/MainView";
import ReportsView from "../components/reports/ReportsView";
import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";
import useWorkspaceStore from "../store/useWorkspaceStore";
import { TABS } from "../components/main/tabs";

const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

beforeEach(() => {
  fetchReportsMock.mockReset();
  loadCREDOutputDataMock.mockReset();
  // Default: fetches resolve immediately. Tests that need an in-flight
  // pending state override this with a never-resolving promise.
  fetchReportsMock.mockResolvedValue(undefined);
  loadCREDOutputDataMock.mockResolvedValue(undefined);
  useUIStore.setState({
    selectedTab: TABS.PARAMETERS,
    selectedSubTab: 0,
    activeViewControl: "",
    reports: [],
    selectedReport: null,
  });
  useResultsStore.setState({ credOutputData: [] });
  useWorkspaceStore.setState({ selectedAppOption: "era" });
});

describe("MainTabs.handleTabChange (#248)", () => {
  it("does not call fetchReports when the user clicks the Reports tab", () => {
    renderWithTheme(<MainTabs />);
    const reportsTab = screen.getByRole("tab", { name: /main_section_title_outputs/i });
    fireEvent.click(reportsTab);
    expect(fetchReportsMock).not.toHaveBeenCalled();
    expect(useUIStore.getState().selectedTab).toBe(TABS.REPORTS);
  });

  it("does not call loadCREDOutputData when the user clicks the Macro tab", () => {
    renderWithTheme(<MainTabs />);
    const macroTab = screen.getByRole("tab", { name: /main_section_title_macroeconomic/i });
    fireEvent.click(macroTab);
    expect(loadCREDOutputDataMock).not.toHaveBeenCalled();
    expect(useUIStore.getState().selectedTab).toBe(TABS.MACRO);
  });

  it("still resets the sub-tab when a tab is clicked", () => {
    useUIStore.setState({ selectedSubTab: 2 });
    renderWithTheme(<MainTabs />);
    const riskTab = screen.getByRole("tab", {
      name: /main_section_title_economic_non_economic/i,
    });
    fireEvent.click(riskTab);
    expect(useUIStore.getState().selectedSubTab).toBe(0);
  });
});

describe("ReportsView lazy fetch (#248)", () => {
  it("fetches reports on mount", async () => {
    renderWithTheme(<ReportsView />);
    await waitFor(() => expect(fetchReportsMock).toHaveBeenCalledTimes(1));
  });

  it("does not double-fetch when remounted while the first fetch is still in flight", async () => {
    // Simulate a slow fetch: the promise stays pending across both mounts.
    let resolveFetch;
    fetchReportsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    const { unmount } = renderWithTheme(<ReportsView />);
    await waitFor(() => expect(fetchReportsMock).toHaveBeenCalledTimes(1));
    unmount();
    // Tab switch back to Reports → fresh ReportsView mount while the first
    // fetch hasn't resolved yet. The in-flight guard should suppress the
    // second call.
    renderWithTheme(<ReportsView />);
    // Give effects a chance to run.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchReportsMock).toHaveBeenCalledTimes(1);
    // Resolve to clean up the pending promise.
    resolveFetch?.();
  });
});

describe("MainView macro lazy fetch (#248)", () => {
  it("loads CRED output data on first activation when cache is empty", async () => {
    useUIStore.setState({ selectedTab: TABS.MACRO, activeViewControl: "display_macro_chart" });
    useResultsStore.setState({ credOutputData: [] });
    renderWithTheme(<MainView />);
    await waitFor(() => expect(loadCREDOutputDataMock).toHaveBeenCalledTimes(1));
  });

  it("does not refetch when CRED data is already cached", async () => {
    useUIStore.setState({ selectedTab: TABS.MACRO, activeViewControl: "display_macro_chart" });
    useResultsStore.setState({ credOutputData: [{ country: "ESP" }] });
    renderWithTheme(<MainView />);
    // Effects flush; assert no call rather than awaiting an event that
    // never comes.
    await new Promise((r) => setTimeout(r, 0));
    expect(loadCREDOutputDataMock).not.toHaveBeenCalled();
  });

  it("does not fetch CRED data when the active tab is not Macro", async () => {
    useUIStore.setState({ selectedTab: TABS.PARAMETERS });
    useResultsStore.setState({ credOutputData: [] });
    renderWithTheme(<MainView />);
    await new Promise((r) => setTimeout(r, 0));
    expect(loadCREDOutputDataMock).not.toHaveBeenCalled();
  });
});
