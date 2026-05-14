// Coverage for #450: applicability tagging on the adaptation-measure viewer
// and the skipped-measures snackbar wired through useRunScenario. Re-anchored
// on the post-#461 layout where the picker is split into a left-column
// summary (``Measures``, owns the fetch) and a middle-pane viewer
// (``MeasuresCard``, renders the chip).

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
import useRunScenario from "../hooks/useRunScenario";
import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";
import useWorkspaceStore from "../store/useWorkspaceStore";
import { TABS } from "../components/main/tabs";

const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const fakeMeasures = [
  { id: "uuid-levee", name: "Levee", is_builtin: true, source_reference: null },
  { id: "uuid-cropswitch", name: "Crop switching", is_builtin: true, source_reference: null },
];

const measureResponse = (measures, entityMeasureNames) => ({
  success: true,
  result: {
    status: { code: 2000 },
    data: {
      measures,
      adaptationMeasures: measures.map((m) => m.name),
      entityMeasureNames,
    },
  },
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
    selectedExposureFile: "entity_TODAY_THA_FL_crops.xlsx",
    selectedHazardFile: "",
    selectedScenario: "rcp85",
    selectedTimeHorizon: [2024, 2050],
    selectedAnnualGrowth: 0,
    selectedMeasureIds: [],
    adaptationMeasures: [],
    entityMeasureNames: null,
    lastRunSkippedMeasures: [],
  });
  useUIStore.setState({ selectedTab: TABS.RISK });
  useResultsStore.setState({ isScenarioRunning: false });
});

describe("MeasuresCard applicability tag (#450)", () => {
  it("does not tag any card when entityMeasureNames is null (applicability unknown)", () => {
    useWorkspaceStore.setState({
      adaptationMeasures: fakeMeasures,
      entityMeasureNames: null,
      selectedMeasureIds: ["Levee", "Crop switching"],
    });
    renderWithTheme(<MeasuresCard />);
    expect(screen.queryByTestId("measure-applicability-not-in-scenario-uuid-levee")).toBeNull();
    expect(
      screen.queryByTestId("measure-applicability-not-in-scenario-uuid-cropswitch")
    ).toBeNull();
  });

  it("tags catalog cards absent from entityMeasureNames as not-in-scenario", () => {
    useWorkspaceStore.setState({
      adaptationMeasures: fakeMeasures,
      entityMeasureNames: ["Levee"],
      selectedMeasureIds: ["Levee", "Crop switching"],
    });
    renderWithTheme(<MeasuresCard />);
    expect(screen.queryByTestId("measure-applicability-not-in-scenario-uuid-levee")).toBeNull();
    expect(
      screen.getByTestId("measure-applicability-not-in-scenario-uuid-cropswitch")
    ).toBeInTheDocument();
  });

  it("threads selectedExposureFile through to the measures fetch", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures, ["Levee"]));
    renderWithTheme(<Measures />);
    await waitFor(() => expect(fetchAdaptationMeasuresMock).toHaveBeenCalled());
    const call = fetchAdaptationMeasuresMock.mock.calls[0];
    expect(call[0]).toBe("Thailand");
    expect(call[1]).toBe("flood");
    expect(call[2]).toBe("entity_TODAY_THA_FL_crops.xlsx");
  });

  it("hoists entityMeasureNames into the workspace store after fetch", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures, ["Levee"]));
    renderWithTheme(<Measures />);
    await waitFor(() => expect(useWorkspaceStore.getState().entityMeasureNames).toEqual(["Levee"]));
  });
});

describe("useRunScenario skipped-measures snackbar (#450)", () => {
  beforeEach(() => {
    useUIStore.setState({
      alertMessage: "",
      alertSeverity: "info",
      alertShowMessage: false,
    });
  });

  const wrap = (hook) => {
    let captured;
    const Probe = () => {
      captured = hook();
      return null;
    };
    renderWithTheme(<Probe />);
    return () => captured;
  };

  const successResponse = (skippedMeasures) => ({
    success: true,
    result: {
      status: { code: 2000, message: "ok" },
      data: { mapTitle: "title", scenarioId: "scn_x", skippedMeasures },
    },
  });

  it("fires a warning snackbar and records skipped names when the backend dropped some", async () => {
    useWorkspaceStore.setState({
      selectedMeasureIds: ["Levee", "Crop switching"],
    });
    runScenarioMock.mockResolvedValue(successResponse(["Crop switching"]));

    const getHook = wrap(useRunScenario);
    await getHook().runScenario();

    await waitFor(() => expect(useUIStore.getState().alertShowMessage).toBe(true));
    expect(useUIStore.getState().alertSeverity).toBe("warning");
    expect(useUIStore.getState().alertMessage).toContain("scenario_run_skipped_measures_snackbar");
    expect(useUIStore.getState().alertMessage).toContain("count=1");
    expect(useUIStore.getState().alertMessage).toContain("total=2");
    expect(useWorkspaceStore.getState().lastRunSkippedMeasures).toEqual(["Crop switching"]);
  });

  it("keeps the success snackbar when no measures were skipped", async () => {
    useWorkspaceStore.setState({
      selectedMeasureIds: ["Levee"],
    });
    runScenarioMock.mockResolvedValue(successResponse([]));

    const getHook = wrap(useRunScenario);
    await getHook().runScenario();

    await waitFor(() => expect(useUIStore.getState().alertShowMessage).toBe(true));
    expect(useUIStore.getState().alertSeverity).toBe("success");
    expect(useUIStore.getState().alertMessage).toBe("ok");
    expect(useWorkspaceStore.getState().lastRunSkippedMeasures).toEqual([]);
  });

  it("treats a missing skippedMeasures field as no skip", async () => {
    useWorkspaceStore.setState({
      selectedMeasureIds: ["Levee"],
    });
    runScenarioMock.mockResolvedValue({
      success: true,
      result: {
        status: { code: 2000, message: "ok" },
        data: { mapTitle: "title", scenarioId: "scn_x" },
      },
    });

    const getHook = wrap(useRunScenario);
    await getHook().runScenario();

    await waitFor(() => expect(useUIStore.getState().alertShowMessage).toBe(true));
    expect(useUIStore.getState().alertSeverity).toBe("success");
    expect(useWorkspaceStore.getState().lastRunSkippedMeasures).toEqual([]);
  });
});
