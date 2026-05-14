// Coverage for #373: interactive adaptation measure selection.
//
// Verifies the picker checkbox flow, Apply/Reset enablement, the round-trip
// through `runScenario`, and that store invariants (selection clears on
// hazard change) hold.

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

vi.mock("../components/title/AdaptationMeasuresViewTitle", () => ({
  default: () => <div data-testid="adaptation-title" />,
}));

import AdaptationMeasuresInput from "../components/input/AdaptationMeasuresInput";
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
    appliedMeasureIds: [],
    isMeasureSelectionInitialized: false,
  });
  useUIStore.setState({ selectedTab: TABS.ADAPTATION });
  useResultsStore.setState({ isScenarioRunning: false });
});

describe("AdaptationMeasuresInput selection UX (#373)", () => {
  it("initializes selectedMeasureIds and appliedMeasureIds to every fetched name", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    renderWithTheme(<AdaptationMeasuresInput />);
    await waitFor(() =>
      expect(useWorkspaceStore.getState().isMeasureSelectionInitialized).toBe(true)
    );
    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual(["Levee", "Drainage", "Pumps"]);
    expect(useWorkspaceStore.getState().appliedMeasureIds).toEqual(["Levee", "Drainage", "Pumps"]);
  });

  it("toggling a checkbox updates selectedMeasureIds without touching applied", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    renderWithTheme(<AdaptationMeasuresInput />);
    await waitFor(() => screen.getByTestId("measure-checkbox-uuid-levee"));

    fireEvent.click(screen.getByTestId("measure-checkbox-uuid-levee"));

    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual(["Drainage", "Pumps"]);
    expect(useWorkspaceStore.getState().appliedMeasureIds).toEqual(["Levee", "Drainage", "Pumps"]);
  });

  it("Apply button is disabled when selection matches applied and enables when they diverge", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    renderWithTheme(<AdaptationMeasuresInput />);
    await waitFor(() => screen.getByTestId("adaptation-measure-apply-button"));

    const button = screen.getByTestId("adaptation-measure-apply-button");
    expect(button).toBeDisabled();

    fireEvent.click(screen.getByTestId("measure-checkbox-uuid-pumps"));
    expect(button).not.toBeDisabled();
  });

  it("Apply button is disabled while a scenario run is in flight", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    renderWithTheme(<AdaptationMeasuresInput />);
    await waitFor(() => screen.getByTestId("adaptation-measure-apply-button"));

    fireEvent.click(screen.getByTestId("measure-checkbox-uuid-pumps"));
    useResultsStore.setState({ isScenarioRunning: true });

    await waitFor(() =>
      expect(screen.getByTestId("adaptation-measure-apply-button")).toBeDisabled()
    );
  });

  it("clicking Apply fires runScenario with the current selectedMeasureIds and snaps applied on success", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    runScenarioMock.mockResolvedValue({
      success: true,
      result: {
        status: { code: 2000, message: "ok" },
        data: { mapTitle: "Thailand flood RCP85 2050", scenarioId: "scn_xyz" },
      },
    });
    renderWithTheme(<AdaptationMeasuresInput />);
    await waitFor(() => screen.getByTestId("adaptation-measure-apply-button"));

    fireEvent.click(screen.getByTestId("measure-checkbox-uuid-pumps"));
    fireEvent.click(screen.getByTestId("adaptation-measure-apply-button"));

    await waitFor(() => expect(runScenarioMock).toHaveBeenCalledTimes(1));
    const sent = runScenarioMock.mock.calls[0][0];
    expect(sent.selectedMeasureIds).toEqual(["Levee", "Drainage"]);
    expect(sent.countryName).toBe("Thailand");
    expect(sent.hazardType).toBe("flood");

    await waitFor(() =>
      expect(useWorkspaceStore.getState().appliedMeasureIds).toEqual(["Levee", "Drainage"])
    );
    expect(screen.getByTestId("adaptation-measure-apply-button")).toBeDisabled();
  });

  it("Reset link reverts selection to the last applied set", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    renderWithTheme(<AdaptationMeasuresInput />);
    await waitFor(() => screen.getByTestId("adaptation-measure-reset-link"));

    fireEvent.click(screen.getByTestId("measure-checkbox-uuid-pumps"));
    fireEvent.click(screen.getByTestId("measure-checkbox-uuid-levee"));
    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual(["Drainage"]);

    fireEvent.click(screen.getByTestId("adaptation-measure-reset-link"));
    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual(["Levee", "Drainage", "Pumps"]);
  });
});

describe("AdaptationMeasuresInput duplicate-name UI isolation (#447)", () => {
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
    renderWithTheme(<AdaptationMeasuresInput />);
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
    renderWithTheme(<AdaptationMeasuresInput />);
    await waitFor(() =>
      expect(useWorkspaceStore.getState().isMeasureSelectionInitialized).toBe(true)
    );
    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual([
      "Early warning system",
      "Levee",
    ]);
    expect(useWorkspaceStore.getState().appliedMeasureIds).toEqual([
      "Early warning system",
      "Levee",
    ]);
  });

  it("renders one card per row even when names duplicate", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(dupeMeasures));
    renderWithTheme(<AdaptationMeasuresInput />);
    await waitFor(() => screen.getByTestId("measure-checkbox-row-ews-3"));
    expect(screen.getByTestId("measure-checkbox-row-ews-1")).toBeInTheDocument();
    expect(screen.getByTestId("measure-checkbox-row-ews-2")).toBeInTheDocument();
    expect(screen.getByTestId("measure-checkbox-row-ews-3")).toBeInTheDocument();
    expect(screen.getByTestId("measure-checkbox-row-levee")).toBeInTheDocument();
  });

  it("Reset restores every duplicate-named card to the applied state", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(dupeMeasures));
    renderWithTheme(<AdaptationMeasuresInput />);
    await waitFor(() => screen.getByTestId("adaptation-measure-reset-link"));

    const c2 = screen.getByTestId("measure-checkbox-row-ews-2");
    fireEvent.click(c2);
    expect(c2.checked).toBe(false);

    fireEvent.click(screen.getByTestId("adaptation-measure-reset-link"));

    expect(screen.getByTestId("measure-checkbox-row-ews-1").checked).toBe(true);
    expect(screen.getByTestId("measure-checkbox-row-ews-2").checked).toBe(true);
    expect(screen.getByTestId("measure-checkbox-row-ews-3").checked).toBe(true);
    expect(screen.getByTestId("measure-checkbox-row-levee").checked).toBe(true);
  });
});

describe("useWorkspaceStore measure-selection invariants (#373)", () => {
  it("changing the hazard resets both lists and the initialized flag", () => {
    useWorkspaceStore.setState({
      selectedHazard: "flood",
      selectedMeasureIds: ["Levee"],
      appliedMeasureIds: ["Levee", "Drainage"],
      isMeasureSelectionInitialized: true,
    });
    useWorkspaceStore.getState().setSelectedHazard("drought");
    expect(useWorkspaceStore.getState().selectedHazard).toBe("drought");
    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual([]);
    expect(useWorkspaceStore.getState().appliedMeasureIds).toEqual([]);
    expect(useWorkspaceStore.getState().isMeasureSelectionInitialized).toBe(false);
  });

  it("changing the country resets both lists and the initialized flag", () => {
    useWorkspaceStore.setState({
      selectedCountry: "Thailand",
      selectedMeasureIds: ["Levee"],
      appliedMeasureIds: ["Levee"],
      isMeasureSelectionInitialized: true,
    });
    useWorkspaceStore.getState().setSelectedCountry("Egypt");
    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual([]);
    expect(useWorkspaceStore.getState().appliedMeasureIds).toEqual([]);
    expect(useWorkspaceStore.getState().isMeasureSelectionInitialized).toBe(false);
  });

  it("toggleMeasureId adds and removes ids", () => {
    useWorkspaceStore.setState({ selectedMeasureIds: ["a", "b"] });
    useWorkspaceStore.getState().toggleMeasureId("c");
    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual(["a", "b", "c"]);
    useWorkspaceStore.getState().toggleMeasureId("b");
    expect(useWorkspaceStore.getState().selectedMeasureIds).toEqual(["a", "c"]);
  });
});
