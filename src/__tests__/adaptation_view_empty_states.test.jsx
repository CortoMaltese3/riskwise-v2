// Coverage for #371: when no scenario has been run yet (and no restored
// report is selected), MainView's ADAPTATION branch renders the empty
// state with a CTA that returns the user to the Risk section.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import theme from "../theme/theme";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

vi.mock("../utils/macroTools", () => ({
  useMacroTools: () => ({
    loadCREDOutputData: vi.fn(),
    generateChartFromCREDData: vi.fn(),
  }),
}));

vi.mock("../utils/mapTools", () => ({
  useMapTools: () => ({
    handleSaveImage: vi.fn(),
    handleSaveMap: vi.fn(),
    handleAddToOutput: vi.fn(),
    handleCaptureSnapshot: vi.fn(),
  }),
}));

vi.mock("../components/map/MapLayout", () => ({ default: () => <div /> }));
vi.mock("../components/map/AdaptationMap", () => ({ default: () => <div /> }));
vi.mock("../components/controls/RiskChartLayout", () => ({ default: () => <div /> }));
vi.mock("../components/controls/AdaptationChartLayout", () => ({
  default: () => <div data-testid="adaptation-chart-layout" />,
}));
vi.mock("../components/charts/MacroEconomicChart", () => ({ default: () => <div /> }));
vi.mock("../components/cards/ViewCard", () => ({ default: () => <div /> }));
vi.mock("../components/cards/ViewMacroCard", () => ({ default: () => <div /> }));
vi.mock("../components/title/MainViewTitle", () => ({ default: () => <div /> }));
vi.mock("../components/controls/MainViewControls", () => ({ default: () => <div /> }));
vi.mock("../components/main/MainViewToolbar", () => ({ default: () => <div /> }));
vi.mock("../components/controls/MacroViewControls", () => ({ default: () => <div /> }));
vi.mock("../components/reports/ReportsView", () => ({ default: () => <div /> }));

import MainView from "../components/main/MainView";
import useUIStore from "../store/useUIStore";
import useResultsStore from "../store/useResultsStore";
import useWorkspaceStore from "../store/useWorkspaceStore";
import { TABS } from "../components/main/tabs";

const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

beforeEach(() => {
  useUIStore.setState({
    activeSection: "adaptation",
    selectedTab: TABS.ADAPTATION,
    selectedSubTab: 0,
    activeViewControl: "display_chart",
    selectedReport: null,
  });
  useResultsStore.setState({
    isScenarioRunCompleted: false,
    credOutputData: [],
  });
  useWorkspaceStore.setState({ selectedAppOption: "era" });
});

describe("AdaptationView empty state (#371)", () => {
  it("shows the no-run empty state with copy and CTA when no scenario has completed", () => {
    renderWithTheme(<MainView />);
    expect(screen.getByTestId("adaptation-empty-state-no-run")).toBeInTheDocument();
    expect(screen.getByText("adaptation_empty_state_no_run")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "adaptation_empty_state_go_to_risk" })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("adaptation-chart-layout")).not.toBeInTheDocument();
  });

  it("CTA returns the user to the Risk section", () => {
    renderWithTheme(<MainView />);
    fireEvent.click(screen.getByRole("button", { name: "adaptation_empty_state_go_to_risk" }));
    expect(useUIStore.getState().activeSection).toBe("risk");
  });

  it("renders the chart layout instead of the empty state once a scenario has completed", () => {
    useResultsStore.setState({ isScenarioRunCompleted: true });
    renderWithTheme(<MainView />);
    expect(screen.queryByTestId("adaptation-empty-state-no-run")).not.toBeInTheDocument();
    expect(screen.getByTestId("adaptation-chart-layout")).toBeInTheDocument();
  });
});
