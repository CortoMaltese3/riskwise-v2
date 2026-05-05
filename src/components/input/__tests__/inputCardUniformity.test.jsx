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

import theme from "../../../theme/theme";
import useStore from "../../../store";
import { getInputCardSx, INPUT_CARD_HEIGHT } from "../inputCardStyles";
import Country from "../Country";
import Hazard from "../Hazard";
import Scenario from "../Scenario";
import TimeHorizon from "../TimeHorizon";
import ExposureEconomic from "../ExposureEconomic";
import ExposureNonEconomic from "../ExposureNonEconomic";
import AnnualGrowth from "../AnnualGrowth";

const CARDS = [
  { name: "Country", Component: Country },
  { name: "Hazard", Component: Hazard },
  { name: "Scenario", Component: Scenario },
  { name: "TimeHorizon", Component: TimeHorizon },
  { name: "ExposureEconomic", Component: ExposureEconomic },
  { name: "ExposureNonEconomic", Component: ExposureNonEconomic },
  { name: "AnnualGrowth", Component: AnnualGrowth },
];

const SELECTION_STATES = [
  { name: "empty", state: {} },
  {
    name: "fully populated",
    state: {
      selectedCountry: "egypt",
      selectedHazard: "flood",
      selectedScenario: "rcp45",
      selectedTimeHorizon: [2024, 2050],
      selectedExposureEconomic: "buildings",
      selectedExposureNonEconomic: null,
      selectedAnnualGrowth: 2,
      isValidHazard: true,
      isValidExposureEconomic: true,
    },
  },
  {
    name: "non-economic populated",
    state: {
      selectedCountry: "thailand",
      selectedHazard: "drought",
      selectedScenario: "rcp85",
      selectedTimeHorizon: [2024, 2080],
      selectedExposureEconomic: null,
      selectedExposureNonEconomic: "population",
      selectedAnnualGrowth: 1,
      isValidHazard: true,
      isValidExposureNonEconomic: true,
    },
  },
];

const initialStoreState = useStore.getState();

const resetStore = (overrides = {}) => {
  useStore.setState({
    ...initialStoreState,
    selectedCountry: null,
    selectedHazard: "",
    selectedScenario: "",
    selectedTimeHorizon: null,
    selectedExposureEconomic: null,
    selectedExposureNonEconomic: null,
    selectedAnnualGrowth: 0,
    isValidHazard: false,
    isValidExposureEconomic: false,
    isValidExposureNonEconomic: false,
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
});
