import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts === "object") {
        const parts = Object.entries(opts).map(([k, v]) => `${k}=${String(v)}`);
        return parts.length ? `${key}|${parts.join(",")}` : key;
      }
      return key;
    },
    i18n: { language: "en" },
  }),
}));

vi.mock("../charts/WaterfallChart", () => ({
  default: () => <div data-testid="waterfall-chart" />,
}));

vi.mock("../charts/CostBenefitChart", () => ({
  default: () => <div data-testid="costben-chart" />,
}));

vi.mock("../../assets/giz_logo.png", () => ({ default: "giz-logo-stub" }));
vi.mock("../../assets/unu_ehs_logo.png", () => ({ default: "unu-logo-stub" }));

// useReportLocale fetches /api/v1/settings; the component shares the same
// window.api.http.request mock for scenarios. Stub the hook directly so the
// test only needs to control the scenario payload.
vi.mock("../../hooks/useReportLocale", () => ({
  useReportLocale: () => ({
    locale: "en-US",
    currency: "EUR",
    formatNumber: (v: number) => v.toLocaleString("en-US"),
    formatCurrency: (v: number) => `EUR ${v.toLocaleString("en-US")}`,
  }),
}));

import ScenarioPrintView from "./ScenarioPrintView";

const meta = {
  id: "scn-1",
  name: "My Scenario",
  country: "Egypt",
  hazard_type: "flood",
  scenario: "rcp_8_5",
  ref_year: 2020,
  future_year: 2080,
  annual_growth: 1.5,
  exposure_type: "buildings",
  asset_type: "economic",
  created_at: "2026-01-15T10:00:00Z",
  app_version: "2.4.0",
  engine_version: "1.2.0",
  climada_version: "4.0.0",
  entity_data_sha256: "abc123def456abcdef0123456789abcdef0123456789abcdef0123456789abcd",
  hazard_data_sha256: "1111111122222222333333334444444455555555666666667777777788888888",
  country_config_sha256: "aaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999",
  random_seed: 42,
  computed_at: "2026-01-15T10:30:00Z",
};

const waterfall = {
  present_year: 2020,
  future_year: 2080,
  measurement_unit: "USD",
  categories: [
    { key: "risk_present", label: "Present", value: 100, base: 0 },
    { key: "climate_change", label: "Climate Change", value: 50, base: 100 },
    { key: "economic_growth", label: "Economic Growth", value: 20, base: 150 },
    { key: "risk_future", label: "Future", value: 170, base: 0 },
  ],
};

const costben = {
  currency_unit: "USD",
  present_year: 2020,
  future_year: 2080,
  measures: [
    { name: "Sea wall", cost: 1000, benefit: 3000, benefit_cost_ratio: 3.0 },
    { name: "Retrofit", cost: 500, benefit: 2500, benefit_cost_ratio: 5.0 },
  ],
};

interface ScenarioPayload {
  scenario: typeof meta;
  results: { waterfall_data?: string; costben_data?: string };
}

const mockScenario = (payload: ScenarioPayload) => {
  const requestMock = vi.fn().mockResolvedValue({
    success: true,
    result: { data: payload },
  });
  (window as unknown as { api: unknown }).api = {
    http: { request: requestMock },
  };
  return requestMock;
};

beforeEach(() => {
  delete (document.body.dataset as Record<string, string | undefined>).printReady;
});

describe("ScenarioPrintView", () => {
  it("renders all six sections with a fully populated fixture", async () => {
    mockScenario({
      scenario: meta,
      results: {
        waterfall_data: JSON.stringify(waterfall),
        costben_data: JSON.stringify(costben),
      },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("print-cover")).toBeInTheDocument());

    expect(screen.getByTestId("print-cover")).toBeInTheDocument();
    expect(screen.getByTestId("print-executive-summary")).toBeInTheDocument();
    expect(screen.getByTestId("print-scenario-inputs")).toBeInTheDocument();
    expect(screen.getByTestId("print-key-results")).toBeInTheDocument();
    expect(screen.getByTestId("print-visuals")).toBeInTheDocument();
    expect(screen.getByTestId("print-methodology")).toBeInTheDocument();

    expect(screen.getByTestId("snapshots-slot")).toBeInTheDocument();
    expect(screen.getByTestId("waterfall-chart")).toBeInTheDocument();
    expect(screen.getByTestId("costben-chart")).toBeInTheDocument();
    expect(screen.getByTestId("print-risk-table")).toBeInTheDocument();
    expect(screen.getByTestId("print-costben-table")).toBeInTheDocument();
    expect(screen.getByTestId("print-cover-logos")).toBeInTheDocument();
    expect(screen.getByTestId("bibtex-snippet")).toBeInTheDocument();
    expect(screen.getByTestId("reproducibility-note")).toBeInTheDocument();
    expect(screen.getByTestId("print-methodology-body")).toBeInTheDocument();

    // Cost-benefit rows render sorted by BCR descending; "Retrofit" (5.0) > "Sea wall" (3.0).
    const costbenTable = screen.getByTestId("print-costben-table");
    const rowNames = Array.from(costbenTable.querySelectorAll("tbody tr td:first-child")).map(
      (n) => n.textContent
    );
    expect(rowNames).toEqual(["Retrofit", "Sea wall"]);

    await waitFor(() => expect(document.body.dataset.printReady).toBe("true"));
  });

  it("renders summary-unavailable branch when waterfall_data is missing", async () => {
    mockScenario({
      scenario: meta,
      results: { costben_data: JSON.stringify(costben) },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() =>
      expect(screen.getByTestId("print-summary-unavailable")).toBeInTheDocument()
    );
    expect(screen.getByTestId("print-risk-table-missing")).toBeInTheDocument();
  });

  it("renders not-available branches when both result tables are missing", async () => {
    mockScenario({
      scenario: meta,
      results: {},
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() =>
      expect(screen.getByTestId("print-summary-unavailable")).toBeInTheDocument()
    );
    expect(screen.getByTestId("print-risk-table-missing")).toBeInTheDocument();
    expect(screen.getByTestId("print-costben-table-missing")).toBeInTheDocument();
    expect(screen.queryByTestId("waterfall-chart")).not.toBeInTheDocument();
    expect(screen.queryByTestId("costben-chart")).not.toBeInTheDocument();
  });

  it("renders snapshots-slot placeholder reserved for the next issue", async () => {
    mockScenario({
      scenario: meta,
      results: { waterfall_data: JSON.stringify(waterfall) },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("snapshots-slot")).toBeInTheDocument());
    expect(screen.getByTestId("snapshots-slot")).toBeEmptyDOMElement();
  });
});
