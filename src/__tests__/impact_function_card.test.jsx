import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import enLocale from "../locales/en.json";
import theme from "../theme/theme";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const base = enLocale[key] ?? key;
      if (opts && typeof opts === "object") {
        return Object.entries(opts).reduce(
          (out, [k, v]) => out.replaceAll(`{{${k}}}`, String(v)),
          base
        );
      }
      return base;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

// Chart.js stub — the middle-pane viewer renders <Line> when a spec is
// loaded; the left summary does not.
vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="chart-stub" />,
}));
vi.mock("chart.js", () => ({
  Chart: { register: vi.fn() },
  CategoryScale: {},
  LinearScale: {},
  LineElement: {},
  PointElement: {},
  Title: {},
  Tooltip: {},
  Legend: {},
}));

const fetchImpactFunctionMock = vi.fn();
const validateImpactFunctionMock = vi.fn();
vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    fetchImpactFunction: (...args) => fetchImpactFunctionMock(...args),
    validateImpactFunction: (...args) => validateImpactFunctionMock(...args),
  },
}));

import ImpactFunction from "../components/input/ImpactFunction";
import ImpactFunctionCard from "../components/cards/ImpactFunctionCard";
import useUIStore from "../store/useUIStore";
import useWorkspaceStore from "../store/useWorkspaceStore";

const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const ok = (data) => ({ success: true, result: { data, status: { code: 2000, message: "ok" } } });
const fail = (message = "boom") => ({
  success: false,
  error: { code: "x", message, detail: null, error_id: "e1", request_id: "r1" },
});

const seedInputs = (patch = {}) => {
  useWorkspaceStore.setState({
    selectedCountry: "Egypt",
    selectedHazard: "flood",
    selectedExposure: "diarrhea_patients",
    isValidExposure: true,
    selectedAppOption: "era",
    selectedExposureFile: "",
    impactFunctionSpec: null,
    impactFunctionError: "",
    impactFunctionLoading: false,
    ...patch,
  });
};

beforeEach(() => {
  fetchImpactFunctionMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("ImpactFunction (left-column summary)", () => {
  it("renders the empty summary until country, hazard, and exposure are valid", async () => {
    seedInputs({ selectedCountry: "", isValidExposure: false });
    renderWithTheme(<ImpactFunction />);
    expect(document.getElementById("impact-function-textfield").value).toBe("");
    expect(fetchImpactFunctionMock).not.toHaveBeenCalled();
  });

  it("fetches and renders the active impact function summary once inputs are valid", async () => {
    fetchImpactFunctionMock.mockResolvedValue(
      ok({
        id: 105,
        name: "Diarrhoea patients",
        haz_type: "FL",
        exp_type: "Diarrhoea patients",
        intensity_unit: "m",
        intensity: [0, 1, 2],
        mdd: [0, 0.5, 1],
        paa: [1, 1, 1],
      })
    );
    seedInputs();
    renderWithTheme(<ImpactFunction />);

    await waitFor(() => {
      const field = document.getElementById("impact-function-textfield");
      expect(field.value).toBe("ID 105 · Diarrhoea patients");
    });
    // ERA mode → no entityFile passed.
    expect(fetchImpactFunctionMock).toHaveBeenCalledWith(
      "Egypt",
      "flood",
      "diarrhea_patients",
      null
    );
    expect(useWorkspaceStore.getState().impactFunctionSpec.id).toBe(105);
  });

  it("passes the uploaded entityFile through in custom mode", async () => {
    fetchImpactFunctionMock.mockResolvedValue(
      ok({
        id: 1,
        name: "x",
        haz_type: "FL",
        exp_type: "x",
        intensity_unit: "m",
        intensity: [0, 1],
        mdd: [0, 1],
        paa: [1, 1],
      })
    );
    seedInputs({ selectedAppOption: "explore", selectedExposureFile: "my_upload.xlsx" });
    renderWithTheme(<ImpactFunction />);

    await waitFor(() =>
      expect(fetchImpactFunctionMock).toHaveBeenCalledWith(
        "Egypt",
        "flood",
        "diarrhea_patients",
        "my_upload.xlsx"
      )
    );
  });

  it("surfaces the backend error in the store so the viewer can render it", async () => {
    fetchImpactFunctionMock.mockResolvedValue(fail("file missing"));
    seedInputs();
    renderWithTheme(<ImpactFunction />);

    await waitFor(() => {
      expect(useWorkspaceStore.getState().impactFunctionError).toBe("file missing");
    });
  });

  it("opens the middle-pane viewer on click", async () => {
    fetchImpactFunctionMock.mockResolvedValue(
      ok({
        id: 105,
        name: "Diarrhoea patients",
        haz_type: "FL",
        exp_type: "x",
        intensity_unit: "m",
        intensity: [0, 1],
        mdd: [0, 1],
        paa: [1, 1],
      })
    );
    seedInputs();
    useUIStore.setState({ selectedCard: "country" });
    const { container } = renderWithTheme(<ImpactFunction />);

    await waitFor(() =>
      expect(document.getElementById("impact-function-textfield").value).toBe(
        "ID 105 · Diarrhoea patients"
      )
    );

    const card = container.querySelector(".MuiCard-root");
    card.click();
    expect(useUIStore.getState().selectedCard).toBe("impactFunction");
  });
});

describe("ImpactFunctionCard (middle-pane viewer)", () => {
  it("renders the placeholder when no spec is loaded", () => {
    useWorkspaceStore.setState({
      impactFunctionSpec: null,
      impactFunctionError: "",
      impactFunctionLoading: false,
    });
    renderWithTheme(<ImpactFunctionCard />);
    expect(screen.getByTestId("impact-function-viewer-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("impact-function-chart")).toBeNull();
  });

  it("renders the chart and table when the store carries a spec", () => {
    useWorkspaceStore.setState({
      impactFunctionSpec: {
        id: 105,
        name: "Diarrhoea patients",
        haz_type: "FL",
        exp_type: "x",
        intensity_unit: "m",
        intensity: [0, 1, 2],
        mdd: [0, 0.5, 1],
        paa: [1, 1, 1],
      },
      impactFunctionError: "",
      impactFunctionLoading: false,
    });
    renderWithTheme(<ImpactFunctionCard />);
    expect(screen.getByTestId("impact-function-chart")).toBeInTheDocument();
    const table = screen.getByTestId("impact-function-table");
    expect(table.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(screen.getByText("Impact function 105 — Diarrhoea patients")).toBeInTheDocument();
  });

  it("renders the error message when fetch failed", () => {
    useWorkspaceStore.setState({
      impactFunctionSpec: null,
      impactFunctionError: "file missing",
      impactFunctionLoading: false,
    });
    renderWithTheme(<ImpactFunctionCard />);
    expect(screen.getByTestId("impact-function-viewer-error")).toHaveTextContent("file missing");
  });

  it("renders the Modified badge when an override is pending (#453)", () => {
    useWorkspaceStore.setState({
      impactFunctionSpec: {
        id: 105,
        name: "Diarrhoea patients",
        haz_type: "FL",
        exp_type: "x",
        intensity_unit: "m",
        intensity: [0, 1, 2],
        mdd: [0, 0.5, 1],
        paa: [1, 1, 1],
      },
      impactFunctionOverride: {
        id: 105,
        name: "edited",
        haz_type: "FL",
        exp_type: "x",
        intensity_unit: "m",
        intensity: [0, 1, 2],
        mdd: [0, 0.7, 1],
        paa: [1, 1, 1],
      },
      impactFunctionError: "",
      impactFunctionLoading: false,
      selectedAppOption: "explore",
    });
    renderWithTheme(<ImpactFunctionCard />);
    expect(screen.getByTestId("impact-function-card-modified-badge")).toBeInTheDocument();
  });

  it("only shows the Edit affordance in custom (non-era) mode", () => {
    useWorkspaceStore.setState({
      impactFunctionSpec: {
        id: 105,
        name: "Diarrhoea patients",
        haz_type: "FL",
        exp_type: "x",
        intensity_unit: "m",
        intensity: [0, 1, 2],
        mdd: [0, 0.5, 1],
        paa: [1, 1, 1],
      },
      impactFunctionOverride: null,
      impactFunctionError: "",
      impactFunctionLoading: false,
      selectedAppOption: "era",
    });
    const { rerender } = renderWithTheme(<ImpactFunctionCard />);
    expect(screen.queryByTestId("impact-function-card-edit")).toBeNull();

    useWorkspaceStore.setState({ selectedAppOption: "explore" });
    rerender(
      <ThemeProvider theme={theme}>
        <ImpactFunctionCard />
      </ThemeProvider>
    );
    expect(screen.getByTestId("impact-function-card-edit")).toBeInTheDocument();
  });
});
