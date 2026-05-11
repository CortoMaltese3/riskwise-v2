// Coverage for #371: clicking the new Adaptation sidebar entry routes the
// shell into the AdaptationView and aligns ``selectedTab`` with
// ``TABS.ADAPTATION``. Real charts/maps are mocked out — the unit under
// test is the section → tab wiring, not the rendered surfaces.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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

vi.mock("../utils/reportTools", () => ({
  useReportTools: () => ({
    fetchReports: vi.fn(),
    restoreScenario: vi.fn(),
    getReport: vi.fn(),
  }),
}));

// Heavy children mocked so the routing assertion isn't coupled to charts
// or leaflet.
vi.mock("../components/map/MapLayout", () => ({ default: () => <div /> }));
vi.mock("../components/map/AdaptationMap", () => ({ default: () => <div /> }));
vi.mock("../components/controls/RiskChartLayout", () => ({ default: () => <div /> }));
vi.mock("../components/controls/AdaptationChartLayout", () => ({
  default: () => <div data-testid="adaptation-chart-layout" />,
}));
vi.mock("../components/charts/MacroEconomicChart", () => ({ default: () => <div /> }));
vi.mock("../components/cards/ViewCard", () => ({ default: () => <div /> }));
vi.mock("../components/cards/ViewMacroCard", () => ({ default: () => <div /> }));
vi.mock("../components/input/DataInput", () => ({ default: () => <div /> }));
vi.mock("../components/inputMacro/MacroEconomicInput", () => ({ default: () => <div /> }));
vi.mock("../components/input/AdaptationMeasuresInput", () => ({
  default: () => <div data-testid="adaptation-measures-input" />,
}));
vi.mock("../components/results/ResultsView", () => ({ default: () => <div /> }));
vi.mock("../components/workspace/WorkspaceView", () => ({ default: () => <div /> }));
vi.mock("../components/settings/SettingsView", () => ({ default: () => <div /> }));
vi.mock("../components/layout/views/HomeView", () => ({
  default: () => <div data-testid="home-view" />,
}));
vi.mock("../components/UpdateDialog", () => ({ default: () => null }));
vi.mock("../components/EngineStatusBanner", () => ({ default: () => null }));
vi.mock("../components/nav/RunPlotMacroButton", () => ({ default: () => null }));
vi.mock("../components/nav/RunScenarioButton", () => ({ default: () => null }));
vi.mock("../components/layout/TopBar", () => ({ default: () => null }));

import AppShell from "../components/layout/AppShell";
import useUIStore from "../store/useUIStore";
import useResultsStore from "../store/useResultsStore";
import { TABS } from "../components/main/tabs";

const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

beforeEach(() => {
  useUIStore.setState({
    activeSection: "home",
    selectedTab: TABS.PARAMETERS,
    selectedSubTab: 0,
    activeViewControl: "",
    selectedReport: null,
  });
  useResultsStore.setState({
    isScenarioRunCompleted: true,
  });
});

describe("Adaptation sidebar entry (#371)", () => {
  it("routes activeSection and selectedTab when the sidebar entry is clicked", () => {
    renderWithTheme(<AppShell />);
    const adaptationButton = screen.getByRole("button", { name: "sidebar_adaptation" });
    act(() => {
      fireEvent.click(adaptationButton);
    });
    const state = useUIStore.getState();
    expect(state.activeSection).toBe("adaptation");
    expect(state.selectedTab).toBe(TABS.ADAPTATION);
  });

  it("renders the AdaptationView so the cost-benefit chart is reachable", () => {
    useUIStore.setState({ activeSection: "adaptation" });
    renderWithTheme(<AppShell />);
    expect(useUIStore.getState().selectedTab).toBe(TABS.ADAPTATION);
    expect(screen.getByTestId("adaptation-measures-input")).toBeInTheDocument();
    expect(screen.getByTestId("adaptation-chart-layout")).toBeInTheDocument();
  });
});
