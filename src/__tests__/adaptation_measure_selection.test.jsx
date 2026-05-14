// Coverage for #373 / #451: the collapsible MeasuresPanel mounted under the
// Risk inputs. The panel is the single entry point for the user's measure
// selection — there is no Apply button or Reset link; the global Run button
// drives every dispatch.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import theme from "../theme/theme";

const { fetchAdaptationMeasuresMock, runScenarioMock } = vi.hoisted(() => ({
  fetchAdaptationMeasuresMock: vi.fn(),
  runScenarioMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      if (opts && typeof opts.count === "number") {
        return `${key}:${opts.count}`;
      }
      return key;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    fetchAdaptationMeasures: fetchAdaptationMeasuresMock,
    runScenario: runScenarioMock,
  },
}));

import MeasuresPanel from "../components/input/MeasuresPanel";
import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";
import useWorkspaceStore from "../store/useWorkspaceStore";
import { TABS } from "../components/main/tabs";

const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const fakeMeasures = [
  { id: "uuid-levee", name: "Levee", is_builtin: true, source_reference: null },
  { id: "uuid-drainage", name: "Drainage", is_builtin: true, source_reference: null },
  { id: "uuid-pumps", name: "Pumps", is_builtin: false, source_reference: "Doc 1" },
];

const measureResponse = (measures) => ({
  success: true,
  result: { status: { code: 2000 }, data: { measures, adaptationMeasures: [] } },
});

beforeEach(() => {
  fetchAdaptationMeasuresMock.mockReset();
  runScenarioMock.mockReset();
  useWorkspaceStore.setState({
    selectedCountry: "Thailand",
    selectedHazard: "flood",
    selectedAppOption: "era",
    selectedExposure: "crops",
    selectedExposureCategory: "economic",
    selectedExposureFile: "",
    selectedHazardFile: "",
    selectedScenario: "rcp85",
    selectedTimeHorizon: [2024, 2050],
    selectedAnnualGrowth: 0,
    selectedMeasureIds: [],
  });
  useUIStore.setState({ selectedTab: TABS.RISK });
  useResultsStore.setState({ isScenarioRunning: false });
});

describe("MeasuresPanel selection UX (#373 / #451)", () => {
  it("seeds selectedMeasureIds with every fetched name", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    renderWithTheme(<MeasuresPanel />);
    await waitFor(() =>
      expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual([
        "Levee",
        "Drainage",
        "Pumps",
      ])
    );
  });

  it("renders the panel summary with the selection count", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    renderWithTheme(<MeasuresPanel />);
    await waitFor(() => screen.getByTestId("adaptation-measures-panel-summary"));
    expect(screen.getByText("adaptation_measures_panel_title:3")).toBeInTheDocument();
  });

  it("starts collapsed and shows cards only after expanding", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    renderWithTheme(<MeasuresPanel />);
    await waitFor(() => screen.getByTestId("adaptation-measures-panel-summary"));
    // Cards are mounted inside a collapsible region; expanding reveals them.
    expect(screen.queryByTestId("measure-checkbox-uuid-levee")).toBeNull();
    fireEvent.click(screen.getByTestId("adaptation-measures-panel-summary"));
    await waitFor(() => screen.getByTestId("measure-checkbox-uuid-levee"));
    expect(screen.getByTestId("measure-checkbox-uuid-drainage")).toBeInTheDocument();
    expect(screen.getByTestId("measure-checkbox-uuid-pumps")).toBeInTheDocument();
  });

  it("toggling a checkbox updates selectedMeasureIds in place", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    renderWithTheme(<MeasuresPanel />);
    await waitFor(() => screen.getByTestId("adaptation-measures-panel-summary"));
    fireEvent.click(screen.getByTestId("adaptation-measures-panel-summary"));
    await waitFor(() => screen.getByTestId("measure-checkbox-uuid-levee"));

    fireEvent.click(screen.getByTestId("measure-checkbox-uuid-levee"));

    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual(["Drainage", "Pumps"]);
  });

  it("does not render an Apply or Reset control (global Run is the only trigger)", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    renderWithTheme(<MeasuresPanel />);
    await waitFor(() => screen.getByTestId("adaptation-measures-panel-summary"));
    expect(screen.queryByTestId("adaptation-measure-apply-button")).toBeNull();
    expect(screen.queryByTestId("adaptation-measure-reset-link")).toBeNull();
    expect(screen.queryByTestId("adaptation-measure-apply-bar")).toBeNull();
  });
});

describe("MeasuresPanel duplicate-name UI isolation (#447)", () => {
  // Defense in depth against #443: even if a future regression of #455
  // reintroduces duplicate-name catalog rows, clicking one card must only
  // flip that card visually — the per-card checkbox state is keyed by row
  // id, not by name.
  const dupeMeasures = [
    { id: "row-ews-1", name: "Early warning system", is_builtin: true, source_reference: null },
    { id: "row-ews-2", name: "Early warning system", is_builtin: true, source_reference: null },
    { id: "row-ews-3", name: "Early warning system", is_builtin: true, source_reference: null },
    { id: "row-levee", name: "Levee", is_builtin: true, source_reference: null },
  ];

  it("clicking one card with a duplicate name flips only that card's checkbox", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(dupeMeasures));
    renderWithTheme(<MeasuresPanel />);
    await waitFor(() => screen.getByTestId("adaptation-measures-panel-summary"));
    fireEvent.click(screen.getByTestId("adaptation-measures-panel-summary"));
    await waitFor(() => screen.getByTestId("measure-checkbox-row-ews-1"));

    const c1 = screen.getByTestId("measure-checkbox-row-ews-1");
    const c2 = screen.getByTestId("measure-checkbox-row-ews-2");
    const c3 = screen.getByTestId("measure-checkbox-row-ews-3");
    const cL = screen.getByTestId("measure-checkbox-row-levee");

    expect(c1.checked).toBe(true);
    expect(c2.checked).toBe(true);
    expect(c3.checked).toBe(true);
    expect(cL.checked).toBe(true);

    fireEvent.click(c2);

    expect(c1.checked).toBe(true);
    expect(c2.checked).toBe(false);
    expect(c3.checked).toBe(true);
    expect(cL.checked).toBe(true);
  });

  it("seeds the store's selectedMeasureIds with deduplicated names", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(dupeMeasures));
    renderWithTheme(<MeasuresPanel />);
    await waitFor(() =>
      expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual([
        "Early warning system",
        "Levee",
      ])
    );
  });

  it("renders one card per row even when names duplicate", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(dupeMeasures));
    renderWithTheme(<MeasuresPanel />);
    await waitFor(() => screen.getByTestId("adaptation-measures-panel-summary"));
    fireEvent.click(screen.getByTestId("adaptation-measures-panel-summary"));
    await waitFor(() => screen.getByTestId("measure-checkbox-row-ews-3"));
    expect(screen.getByTestId("measure-checkbox-row-ews-1")).toBeInTheDocument();
    expect(screen.getByTestId("measure-checkbox-row-ews-2")).toBeInTheDocument();
    expect(screen.getByTestId("measure-checkbox-row-ews-3")).toBeInTheDocument();
    expect(screen.getByTestId("measure-checkbox-row-levee")).toBeInTheDocument();
  });
});

describe("useWorkspaceStore measure-selection invariants (#373 / #451)", () => {
  it("changing the hazard clears selectedMeasureIds", () => {
    useWorkspaceStore.setState({
      selectedHazard: "flood",
      selectedMeasureIds: ["Levee"],
    });
    useWorkspaceStore.getState().setSelectedHazard("drought");
    expect(useWorkspaceStore.getState().selectedHazard).toBe("drought");
    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual([]);
  });

  it("changing the country clears selectedMeasureIds", () => {
    useWorkspaceStore.setState({
      selectedCountry: "Thailand",
      selectedMeasureIds: ["Levee"],
    });
    useWorkspaceStore.getState().setSelectedCountry("Egypt");
    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual([]);
  });

  it("toggleMeasureId adds and removes ids", () => {
    useWorkspaceStore.setState({ selectedMeasureIds: ["a", "b"] });
    useWorkspaceStore.getState().toggleMeasureId("c");
    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual(["a", "b", "c"]);
    useWorkspaceStore.getState().toggleMeasureId("b");
    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual(["a", "c"]);
  });
});
