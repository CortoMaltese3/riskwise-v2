// Regression for #407 follow-up: ResultsTypography composes its lookup key
// from activeViewControl, but only ``display_map`` and ``display_chart``
// have copy in the ERA bundle. Other view controls — most importantly the
// ``display_parameters`` editor reached by clicking a parameter card on the
// Risk tab — would otherwise render the raw key as fallback.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // Echo the key so we can detect the raw-key fallback the guard prevents.
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

import ResultsTypography from "../components/results/ResultsTypography";
import useUIStore from "../store/useUIStore";
import useWorkspaceStore from "../store/useWorkspaceStore";
import { TABS } from "../components/main/tabs";

const seedRiskTabState = (overrides = {}) => {
  useUIStore.setState({
    selectedTab: TABS.RISK,
    activeMap: "hazard",
    activeViewControl: "display_map",
    ...overrides,
  });
  useWorkspaceStore.setState({
    selectedAppOption: "era",
    selectedCountry: "egypt",
    selectedHazard: "heatwaves",
    selectedExposure: "livestock",
  });
};

describe("ResultsTypography view-control guard (#407)", () => {
  beforeEach(() => {
    seedRiskTabState();
  });

  it("renders the composed ERA key for display_map", () => {
    seedRiskTabState({ activeViewControl: "display_map" });
    const { container } = render(<ResultsTypography />);
    expect(container.textContent).toBe(
      "results_era_egypt_heatwaves_livestock_1_0_display_map_hazard"
    );
  });

  it("renders the composed ERA key for display_chart", () => {
    seedRiskTabState({ activeViewControl: "display_chart" });
    const { container } = render(<ResultsTypography />);
    expect(container.textContent).toBe(
      "results_era_egypt_heatwaves_livestock_1_0_display_chart_hazard"
    );
  });

  it("renders empty for display_parameters so the raw key never leaks", () => {
    seedRiskTabState({ activeViewControl: "display_parameters" });
    const { container } = render(<ResultsTypography />);
    expect(container.textContent).toBe("");
  });

  it("renders empty for an unrecognized view control", () => {
    seedRiskTabState({ activeViewControl: "display_macro_table" });
    const { container } = render(<ResultsTypography />);
    expect(container.textContent).toBe("");
  });
});
