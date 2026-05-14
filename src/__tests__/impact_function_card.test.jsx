import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

import enLocale from "../locales/en.json";

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

// Chart.js stub — the card's dialog renders <Line> when opened, but card
// tests only assert the summary row.
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
vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    fetchImpactFunction: (...args) => fetchImpactFunctionMock(...args),
  },
}));

import ImpactFunctionCard from "../components/input/ImpactFunctionCard";
import useWorkspaceStore from "../store/useWorkspaceStore";

const ok = (data) => ({ success: true, result: { data, status: { code: 2000, message: "ok" } } });
const fail = (message = "boom") => ({
  success: false,
  error: { code: "x", message, detail: null, error_id: "e1", request_id: "r1" },
});

const seed = (patch = {}) => {
  useWorkspaceStore.setState({
    selectedCountry: "Egypt",
    selectedHazard: "flood",
    selectedExposure: "diarrhea_patients",
    isValidExposure: true,
    selectedAppOption: "era",
    selectedExposureFile: "",
    ...patch,
  });
};

beforeEach(() => {
  fetchImpactFunctionMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("ImpactFunctionCard", () => {
  it("shows the placeholder until country, hazard, and exposure are valid", async () => {
    seed({ selectedCountry: "", isValidExposure: false });
    render(<ImpactFunctionCard />);
    expect(screen.getByText(enLocale.impact_function_card_placeholder)).toBeInTheDocument();
    expect(fetchImpactFunctionMock).not.toHaveBeenCalled();
  });

  it("fetches and renders the active impact function once inputs are valid", async () => {
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
    seed();
    render(<ImpactFunctionCard />);

    await waitFor(() => {
      expect(screen.getByText("ID 105 · Diarrhoea patients")).toBeInTheDocument();
    });
    expect(screen.getByText("Intensity unit: m")).toBeInTheDocument();
    expect(screen.getByTestId("impact-function-view-details")).toBeInTheDocument();
    // ERA mode → no entityFile passed.
    expect(fetchImpactFunctionMock).toHaveBeenCalledWith(
      "Egypt",
      "flood",
      "diarrhea_patients",
      null
    );
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
    seed({ selectedAppOption: "explore", selectedExposureFile: "my_upload.xlsx" });
    render(<ImpactFunctionCard />);

    await waitFor(() =>
      expect(fetchImpactFunctionMock).toHaveBeenCalledWith(
        "Egypt",
        "flood",
        "diarrhea_patients",
        "my_upload.xlsx"
      )
    );
  });

  it("falls back to the placeholder until the custom entity file is selected", async () => {
    seed({ selectedAppOption: "explore", selectedExposureFile: "" });
    render(<ImpactFunctionCard />);
    expect(screen.getByText(enLocale.impact_function_card_placeholder)).toBeInTheDocument();
    expect(fetchImpactFunctionMock).not.toHaveBeenCalled();
  });

  it("surfaces an error when the backend returns failure", async () => {
    fetchImpactFunctionMock.mockResolvedValue(fail("file missing"));
    seed();
    render(<ImpactFunctionCard />);

    await waitFor(() => {
      expect(screen.getByTestId("impact-function-card-error")).toHaveTextContent("file missing");
    });
  });
});
