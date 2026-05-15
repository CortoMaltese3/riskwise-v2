// Coverage for the entity-driven picker (replaces the catalog applicability
// tagging from #450). With the picker now sourced from the entity, the
// applicability concept collapses — every row is something the engine
// can run — so the only assertions left here are that the fetch threads
// the right inputs, and that the post-run "skipped measures" snackbar
// (now a defensive fallback rather than the common case) still fires.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
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
import useRunScenario from "../hooks/useRunScenario";
import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";
import useWorkspaceStore from "../store/useWorkspaceStore";
import { TABS } from "../components/main/tabs";

const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const fakeMeasures = [
  {
    id: "uuid-levee",
    name: "Levee",
    displayName: "adaptation_measures_levee",
    is_builtin: true,
    source_reference: null,
  },
  {
    id: "uuid-cropswitch",
    name: "Crop switching",
    displayName: "adaptation_measures_crop_switching",
    is_builtin: true,
    source_reference: null,
  },
];

const measureResponse = (measures) => ({
  success: true,
  result: {
    status: { code: 2000 },
    data: {
      measures,
      adaptationMeasures: measures.map((m) => m.name),
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
    lastRunSkippedMeasures: [],
  });
  useUIStore.setState({ selectedTab: TABS.RISK });
  useResultsStore.setState({ isScenarioRunning: false });
});

describe("Measures fetch wiring", () => {
  it("threads selectedExposureFile and selectedExposure through to the measures fetch", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    renderWithTheme(<Measures />);
    await waitFor(() => expect(fetchAdaptationMeasuresMock).toHaveBeenCalled());
    const call = fetchAdaptationMeasuresMock.mock.calls[0];
    expect(call[0]).toBe("Thailand");
    expect(call[1]).toBe("flood");
    expect(call[2]).toBe("entity_TODAY_THA_FL_crops.xlsx");
    expect(call[3]).toBe("crops");
  });

  it("hoists the entity-derived measures into the workspace store", async () => {
    fetchAdaptationMeasuresMock.mockResolvedValue(measureResponse(fakeMeasures));
    renderWithTheme(<Measures />);
    await waitFor(() => expect(useWorkspaceStore.getState().adaptationMeasures).toHaveLength(2));
    const stored = useWorkspaceStore.getState().adaptationMeasures.map((m) => m.name);
    expect(stored).toEqual(["Levee", "Crop switching"]);
  });
});

describe("useRunScenario skipped-measures snackbar (defensive fallback)", () => {
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
