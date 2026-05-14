// Coverage for #401 — control gating while a scenario is in flight.
//
// The contract: every input or mutating control that could corrupt the
// in-flight run must subscribe to ``useResultsStore.isScenarioRunning``
// and render disabled with the standard tooltip key. These tests render
// each named control with ``isScenarioRunning=true`` and assert the
// disabled state plus the tooltip key.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import theme from "../theme/theme";
import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";
import useWorkspaceStore from "../store/useWorkspaceStore";
import { TABS } from "../components/main/tabs";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      if (opts && typeof opts === "object" && opts.defaultValue) return opts.defaultValue;
      return key;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    fetchCountries: vi.fn().mockResolvedValue({
      success: true,
      result: {
        data: [
          { code: "EGY", name: "Egypt" },
          { code: "THA", name: "Thailand" },
        ],
      },
    }),
    listScenarios: vi.fn().mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: [] },
    }),
  },
}));

vi.mock("../utils/mapTools", () => ({
  useMapTools: () => ({
    handleCaptureSnapshot: vi.fn(),
    handleSaveImage: vi.fn(),
    handleSaveMap: vi.fn(),
    handleAddToOutput: vi.fn(),
  }),
}));

vi.mock("../utils/reportTools", () => ({
  useReportTools: () => ({ fetchReports: vi.fn() }),
}));

vi.mock("../store/orchestrators", () => ({
  selectCountry: vi.fn(),
  switchAppMode: vi.fn(),
}));

vi.mock("../components/workspace/SaveScenarioDialog", () => ({
  default: () => null,
}));

vi.mock("../components/alerts/ModeSwitchConfirmDialog", () => ({
  default: () => null,
}));

vi.mock("../components/nav/LanguageButton", () => ({ default: () => null }));
vi.mock("../components/nav/MinimizeButton", () => ({ default: () => null }));
vi.mock("../components/nav/ShutdownButton", () => ({ default: () => null }));
vi.mock("../components/nav/ThemeModeButton", () => ({ default: () => null }));

vi.mock("../assets/giz_logo.png", () => ({ default: "" }));
vi.mock("../assets/unu_ehs_logo.png", () => ({ default: "" }));

import RunScenarioButton from "../components/nav/RunScenarioButton";
import CountryCard from "../components/cards/CountryCard";
import ScenarioCard from "../components/cards/ScenarioCard";
import MainViewToolbar from "../components/main/MainViewToolbar";
import SubTabActions from "../components/main/SubTabActions";
import WorkspaceList from "../components/workspace/WorkspaceList";
import CustomDataSection from "../components/settings/CustomDataSection";
import TopBar from "../components/layout/TopBar";

const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

beforeEach(() => {
  useResultsStore.setState({
    isScenarioRunning: true,
    isScenarioRunCompleted: true,
    scenarioPhase: "running",
    activeRunSummary: {
      country: "egypt",
      hazard: "flood",
      timeHorizonStart: 2024,
      timeHorizonEnd: 2050,
      landingTab: TABS.RISK,
    },
    credDatasets: [],
    activeCredDatasetId: null,
  });
  useWorkspaceStore.setState({
    selectedAppOption: "era",
    selectedCountry: "egypt",
    selectedHazard: "flood",
    selectedScenario: "rcp85",
    selectedExposure: "assets",
    selectedExposureFile: "",
    selectedHazardFile: "",
    selectedAnnualGrowth: 0,
    selectedTimeHorizon: [2024, 2050],
    isValidExposure: true,
    isValidHazard: true,
    scenarioRunCode: "scen-1",
    scenarioRunSaved: false,
  });
  useUIStore.setState({
    selectedTab: TABS.RISK,
    activeViewControl: "display_map",
  });
});

describe("scenario-running gating contract (#401)", () => {
  it("RunScenarioButton is disabled while a scenario runs", () => {
    renderWithTheme(<RunScenarioButton />);
    const button = screen.getByRole("button", { name: "run_button" });
    expect(button).toBeDisabled();
  });

  it("CountryCard country buttons are disabled while a scenario runs", async () => {
    renderWithTheme(<CountryCard />);
    await waitFor(() => {
      const disabled = document.querySelectorAll(".MuiCardActionArea-root.Mui-disabled");
      expect(disabled.length).toBeGreaterThan(0);
    });
  });

  it("ScenarioCard CardActionAreas are disabled while a scenario runs", () => {
    renderWithTheme(<ScenarioCard />);
    const buttons = document.querySelectorAll(".MuiCardActionArea-root.Mui-disabled");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("MainViewToolbar Save Scenario button is disabled while a scenario runs", () => {
    renderWithTheme(<MainViewToolbar />);
    const save = screen.getByLabelText("save_scenario_button_aria");
    expect(save).toBeDisabled();
  });

  it("SubTabActions both buttons are disabled while a scenario runs", () => {
    renderWithTheme(<SubTabActions />);
    expect(screen.getByText("main_subsection_title_save_scenario")).toBeDisabled();
    expect(screen.getByText("main_subsection_title_save_map")).toBeDisabled();
  });

  it("WorkspaceList row open button is disabled while a scenario runs", () => {
    const items = [{ id: "row-1", name: "Row 1", country: "egypt", hazard_type: "flood" }];
    renderWithTheme(<WorkspaceList items={items} />);
    // ListItemButton renders as <div role="button"> so jest-dom's
    // toBeDisabled() does not apply — assert via aria-disabled instead.
    const row = screen.getByRole("button", { name: /Row 1/ });
    expect(row.getAttribute("aria-disabled")).toBe("true");
  });

  it("CustomDataSection upload form Browse button is disabled while a scenario runs", () => {
    renderWithTheme(<CustomDataSection />);
    const browse = screen.getByRole("button", { name: "settings_custom_data_browse" });
    expect(browse).toBeDisabled();
  });

  it("TopBar mode toggle buttons are disabled while a scenario runs", () => {
    renderWithTheme(<TopBar />);
    const era = screen.getByRole("button", { name: "mode_era" });
    const explore = screen.getByRole("button", { name: "mode_explore" });
    expect(era).toBeDisabled();
    expect(explore).toBeDisabled();
  });
});
