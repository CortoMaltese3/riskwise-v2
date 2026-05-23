import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const getScenarioMock = vi.fn();
vi.mock("../../../../lib/RiskWiseClient", () => ({
  default: {
    getScenario: (...args: unknown[]) => getScenarioMock(...args),
  },
}));

import { useScenarioMeta } from "./useScenarioMeta";

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
};

const waterfall = {
  present_year: 2020,
  future_year: 2080,
  measurement_unit: "USD",
  categories: [{ key: "risk_present", label: "Present", value: 100, base: 0 }],
};

const costben = {
  currency_unit: "USD",
  present_year: 2020,
  future_year: 2080,
  measures: [{ name: "Sea wall", cost: 1000, benefit: 3000, benefit_cost_ratio: 3.0 }],
};

beforeEach(() => {
  getScenarioMock.mockReset();
});

describe("useScenarioMeta", () => {
  it("populates meta, waterfallData, and costbenData on the happy path", async () => {
    getScenarioMock.mockResolvedValue({
      success: true,
      result: {
        data: {
          scenario: meta,
          results: {
            waterfall_data: JSON.stringify(waterfall),
            costben_data: JSON.stringify(costben),
          },
        },
      },
    });

    const { result } = renderHook(() => useScenarioMeta("scn-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.meta).toEqual(meta);
    expect(result.current.waterfallData).toEqual(waterfall);
    expect(result.current.costbenData).toEqual(costben);
    expect(result.current.error).toBeNull();
  });

  it("surfaces the error message from a failed IpcResult envelope", async () => {
    getScenarioMock.mockResolvedValue({
      success: false,
      error: {
        code: "scenario_not_found",
        message: "Scenario scn-missing not found",
        detail: null,
        error_id: "req-1",
        request_id: "req-1",
      },
    });

    const { result } = renderHook(() => useScenarioMeta("scn-missing"));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBe("Scenario scn-missing not found");
    expect(result.current.meta).toBeNull();
    expect(result.current.waterfallData).toBeNull();
    expect(result.current.costbenData).toBeNull();
  });

  it("leaves waterfallData and costbenData null when the results map omits them", async () => {
    getScenarioMock.mockResolvedValue({
      success: true,
      result: { data: { scenario: meta, results: {} } },
    });

    const { result } = renderHook(() => useScenarioMeta("scn-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.meta).toEqual(meta);
    expect(result.current.waterfallData).toBeNull();
    expect(result.current.costbenData).toBeNull();
  });

  it("ignores malformed nested JSON instead of crashing", async () => {
    getScenarioMock.mockResolvedValue({
      success: true,
      result: {
        data: {
          scenario: meta,
          results: {
            waterfall_data: "{not json",
            costben_data: JSON.stringify(costben),
          },
        },
      },
    });

    const { result } = renderHook(() => useScenarioMeta("scn-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.meta).toEqual(meta);
    // Corrupt waterfall payload leaves the slot null; the cost-benefit payload
    // still parses and populates so the renderer can show partial results.
    expect(result.current.waterfallData).toBeNull();
    expect(result.current.costbenData).toEqual(costben);
  });

  it("captures a thrown error from the client", async () => {
    getScenarioMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useScenarioMeta("scn-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBe("network down");
  });
});
