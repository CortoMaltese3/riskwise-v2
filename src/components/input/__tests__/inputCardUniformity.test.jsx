import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("../../help/ContextualTooltip", () => ({
  default: () => null,
}));

// ImpactFunction and Measures kick off a fetch when their input prereqs are
// satisfied. Stub the client so the uniformity assertion isn't coupled to
// the backend.
vi.mock("../../../lib/RiskWiseClient", () => ({
  default: {
    fetchImpactFunction: vi.fn().mockResolvedValue({
      success: true,
      result: {
        status: { code: 2000 },
        data: {
          id: 1,
          name: "stub",
          haz_type: "FL",
          exp_type: "stub",
          intensity_unit: "m",
          intensity: [0, 1],
          mdd: [0, 1],
          paa: [1, 1],
        },
      },
    }),
    fetchAdaptationMeasures: vi.fn().mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: { measures: [], adaptationMeasures: [] } },
    }),
  },
}));

import theme from "../../../theme/theme";
import useWorkspaceStore from "../../../store/useWorkspaceStore";
import { getInputCardSx, INPUT_CARD_HEIGHT } from "../inputCardStyles";
import Country from "../Country";
import Hazard from "../Hazard";
import Scenario from "../Scenario";
import TimeHorizon from "../TimeHorizon";
import Exposure from "../Exposure";
import AnnualGrowth from "../AnnualGrowth";
import ImpactFunction from "../ImpactFunction";
import Measures from "../Measures";
import MacroCountry from "../../inputMacro/Country";
import MacroScenario from "../../inputMacro/Scenario";
import MacroEconomicVariable from "../../inputMacro/MacroEconomicVariable";
import MacroSector from "../../inputMacro/Sector";

const CARDS = [
  { name: "Country", Component: Country },
  { name: "Hazard", Component: Hazard },
  { name: "Scenario", Component: Scenario },
  { name: "TimeHorizon", Component: TimeHorizon },
  { name: "Exposure", Component: Exposure },
  { name: "AnnualGrowth", Component: AnnualGrowth },
  { name: "ImpactFunction", Component: ImpactFunction },
  { name: "Measures", Component: Measures },
];

const MACRO_CARDS = [
  { name: "MacroCountry", Component: MacroCountry },
  { name: "MacroScenario", Component: MacroScenario },
  { name: "MacroEconomicVariable", Component: MacroEconomicVariable },
  { name: "MacroSector", Component: MacroSector },
];

const MACRO_SELECTION_STATES = [
  { name: "empty", state: {} },
  {
    name: "fully populated",
    state: {
      selectedMacroCountry: "egypt",
      selectedMacroScenario: "ssp2",
      selectedMacroVariable: "gdp",
      selectedMacroSector: "agriculture",
    },
  },
];

const SELECTION_STATES = [
  { name: "empty", state: {} },
  {
    name: "economic populated",
    state: {
      selectedCountry: "egypt",
      selectedHazard: "flood",
      selectedScenario: "rcp45",
      selectedTimeHorizon: [2024, 2050],
      selectedExposure: "crops",
      selectedExposureCategory: "economic",
      selectedAnnualGrowth: 2,
      isValidHazard: true,
      isValidExposure: true,
    },
  },
  {
    name: "non-economic populated",
    state: {
      selectedCountry: "thailand",
      selectedHazard: "drought",
      selectedScenario: "rcp85",
      selectedTimeHorizon: [2024, 2080],
      selectedExposure: "tree_crops_farmers",
      selectedExposureCategory: "non_economic",
      selectedAnnualGrowth: 1,
      isValidHazard: true,
      isValidExposure: true,
    },
  },
];

const initialStoreState = useWorkspaceStore.getState();

const resetStore = (overrides = {}) => {
  useWorkspaceStore.setState({
    ...initialStoreState,
    selectedCountry: null,
    selectedHazard: "",
    selectedScenario: "",
    selectedTimeHorizon: null,
    selectedExposure: "",
    selectedExposureCategory: null,
    selectedAnnualGrowth: 0,
    isValidHazard: false,
    isValidExposure: false,
    selectedMacroCountry: "",
    selectedMacroScenario: "",
    selectedMacroVariable: "",
    selectedMacroSector: "",
    ...overrides,
  });
};

describe("input card uniformity", () => {
  beforeEach(() => {
    resetStore();
  });

  it("getInputCardSx fixes card height (not minHeight) to INPUT_CARD_HEIGHT", () => {
    const sx = getInputCardSx("default");
    expect(sx.height).toBe(INPUT_CARD_HEIGHT);
    expect(sx).not.toHaveProperty("minHeight");
  });

  it("returns the same height for every card state", () => {
    const states = ["default", "valid", "invalid", "neutral"];
    const heights = states.map((s) => getInputCardSx(s).height);
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toBe(INPUT_CARD_HEIGHT);
  });

  for (const { name, Component } of CARDS) {
    for (const { name: stateName, state } of SELECTION_STATES) {
      it(`${name} renders label + read-only TextField (state: ${stateName})`, () => {
        resetStore(state);
        const { container } = render(
          <ThemeProvider theme={theme}>
            <Component />
          </ThemeProvider>
        );

        const cards = container.querySelectorAll(".MuiCard-root");
        expect(cards.length).toBe(1);

        const labels = container.querySelectorAll(".MuiTypography-h6");
        expect(labels.length).toBe(1);
        expect(labels[0].textContent.trim().length).toBeGreaterThan(0);

        const inputs = container.querySelectorAll("input");
        expect(inputs.length).toBe(1);
        const input = inputs[0];
        expect(input.disabled).toBe(true);
        expect(input.placeholder).toBe("input_card_placeholder");
      });
    }
  }

  for (const { name, Component } of MACRO_CARDS) {
    for (const { name: stateName, state } of MACRO_SELECTION_STATES) {
      it(`${name} renders label + read-only TextField (state: ${stateName})`, () => {
        resetStore(state);
        const { container } = render(
          <ThemeProvider theme={theme}>
            <Component />
          </ThemeProvider>
        );

        const cards = container.querySelectorAll(".MuiCard-root");
        expect(cards.length).toBe(1);

        const labels = container.querySelectorAll(".MuiTypography-h6");
        expect(labels.length).toBe(1);
        expect(labels[0].textContent.trim().length).toBeGreaterThan(0);

        const inputs = container.querySelectorAll("input");
        expect(inputs.length).toBe(1);
        const input = inputs[0];
        expect(input.disabled).toBe(true);
        expect(input.placeholder).toBe("input_card_placeholder");
      });
    }
  }
});
