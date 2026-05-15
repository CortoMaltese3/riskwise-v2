// Coverage for #373 / #451 / #461: the adaptation-measure selection UX after
// the picker was split into a left-column summary (``Measures``) and a
// middle-pane viewer (``MeasuresCard``). The summary owns the fetch and
// hoists the catalog to the workspace store; the viewer reads from it and
// drives the toggle. The global Run button is the only dispatcher — there
// is no Apply gesture inside the picker.

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
      if (!opts) return key;
      const parts = Object.entries(opts).map(([k, v]) => `${k}=${v}`);
      return `${key}:${parts.join(",")}`;
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

import Measures from "../components/input/Measures";
import MeasuresCard from "../components/cards/MeasuresCard";
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
    adaptationMeasures: [],
    entityMeasureNames: null,
  });
  useUIStore.setState({ selectedTab: TABS.RISK });
  useResultsStore.setState({ isScenarioRunning: false });
});

describe("Measures summary (#461)", () => {
  it("seeds selectedMeasureIds and the shared catalog from the fetched response", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    renderWithTheme(<Measures />);
    await waitFor(() =>
      expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual([
        "Levee",
        "Drainage",
        "Pumps",
      ])
    );
    expect(useWorkspaceStore.getState().adaptationMeasures).toHaveLength(3);
  });

  it("renders the summary value as `<selected> of <total> selected`", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    renderWithTheme(<Measures />);
    await waitFor(() =>
      expect(document.getElementById("adaptation-measures-textfield").value).toBe(
        "adaptation_measures_summary_value:selected=3,total=3"
      )
    );
  });

  it("clicking the summary opens the middle-pane viewer", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    useUIStore.setState({ selectedCard: "country" });
    renderWithTheme(<Measures />);
    await waitFor(() => screen.getByTestId("adaptation-measures-summary"));
    fireEvent.click(screen.getByTestId("adaptation-measures-summary"));
    expect(useUIStore.getState().selectedCard).toBe("measures");
  });
});

describe("MeasuresCard viewer", () => {
  it("renders one row per fetched measure", async () => {
    useWorkspaceStore.setState({
      adaptationMeasures: fakeMeasures,
      entityMeasureNames: null,
      selectedMeasureIds: ["Levee", "Drainage", "Pumps"],
    });
    renderWithTheme(<MeasuresCard />);
    expect(screen.getByTestId("measure-checkbox-uuid-levee")).toBeInTheDocument();
    expect(screen.getByTestId("measure-checkbox-uuid-drainage")).toBeInTheDocument();
    expect(screen.getByTestId("measure-checkbox-uuid-pumps")).toBeInTheDocument();
  });

  it("toggling a checkbox updates selectedMeasureIds in place", async () => {
    useWorkspaceStore.setState({
      adaptationMeasures: fakeMeasures,
      entityMeasureNames: null,
      selectedMeasureIds: ["Levee", "Drainage", "Pumps"],
    });
    renderWithTheme(<MeasuresCard />);
    fireEvent.click(screen.getByTestId("measure-checkbox-uuid-levee"));
    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual(["Drainage", "Pumps"]);
  });

  it("does not render an Apply or Reset control (global Run is the only trigger)", async () => {
    useWorkspaceStore.setState({
      adaptationMeasures: fakeMeasures,
      entityMeasureNames: null,
      selectedMeasureIds: ["Levee", "Drainage", "Pumps"],
    });
    renderWithTheme(<MeasuresCard />);
    expect(screen.queryByTestId("adaptation-measure-apply-button")).toBeNull();
    expect(screen.queryByTestId("adaptation-measure-reset-link")).toBeNull();
    expect(screen.queryByTestId("adaptation-measure-apply-bar")).toBeNull();
  });
});

describe("MeasuresCard duplicate-name UI isolation (#447)", () => {
  // Defense in depth against #443: even if a future regression of #455
  // reintroduces duplicate-name catalog rows, clicking one card must only
  // flip that card visually — the per-card display state is keyed by row
  // id, not by name.
  const dupeMeasures = [
    { id: "row-ews-1", name: "Early warning system", is_builtin: true, source_reference: null },
    { id: "row-ews-2", name: "Early warning system", is_builtin: true, source_reference: null },
    { id: "row-ews-3", name: "Early warning system", is_builtin: true, source_reference: null },
    { id: "row-levee", name: "Levee", is_builtin: true, source_reference: null },
  ];

  it("seeds selectedMeasureIds with deduplicated names from the summary fetch", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(dupeMeasures));
    renderWithTheme(<Measures />);
    await waitFor(() =>
      expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual([
        "Early warning system",
        "Levee",
      ])
    );
  });

  it("viewer renders one card per row even when names duplicate", () => {
    useWorkspaceStore.setState({
      adaptationMeasures: dupeMeasures,
      entityMeasureNames: null,
      selectedMeasureIds: ["Early warning system", "Levee"],
    });
    renderWithTheme(<MeasuresCard />);
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
