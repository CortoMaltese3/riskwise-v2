import { describe, it, expect } from "vitest";

import { computeExecutiveSummary, TOTAL_KEYS, type WaterfallData } from "./executiveSummary";

const baseData = (overrides: Partial<WaterfallData> = {}): WaterfallData => ({
  present_year: 2020,
  future_year: 2080,
  measurement_unit: "USD",
  categories: [
    { key: "risk_present", label: "Present", value: 100, base: 0 },
    { key: "climate_change", label: "Climate Change", value: 50, base: 100 },
    { key: "economic_growth", label: "Economic Growth", value: 20, base: 150 },
    { key: "risk_future", label: "Future", value: 170, base: 0 },
  ],
  ...overrides,
});

describe("computeExecutiveSummary", () => {
  it("derives present/future values, change, %, and top driver from the happy path", () => {
    const summary = computeExecutiveSummary(baseData());
    expect(summary).toEqual({
      presentYear: 2020,
      futureYear: 2080,
      presentValue: 100,
      futureValue: 170,
      absoluteChange: 70,
      percentChange: 70,
      topDriverLabel: "Climate Change",
      topDriverValue: 50,
      unit: "USD",
    });
  });

  it("returns null when the risk_present category is missing", () => {
    const data = baseData({
      categories: [{ key: "risk_future", label: "Future", value: 170, base: 0 }],
    });
    expect(computeExecutiveSummary(data)).toBeNull();
  });

  it("returns null when the risk_future category is missing", () => {
    const data = baseData({
      categories: [{ key: "risk_present", label: "Present", value: 100, base: 0 }],
    });
    expect(computeExecutiveSummary(data)).toBeNull();
  });

  it("sets percentChange to null when present value is zero (avoid divide-by-zero)", () => {
    const data = baseData({
      categories: [
        { key: "risk_present", label: "Present", value: 0, base: 0 },
        { key: "climate_change", label: "Climate Change", value: 30, base: 0 },
        { key: "risk_future", label: "Future", value: 30, base: 0 },
      ],
    });
    const summary = computeExecutiveSummary(data);
    expect(summary?.percentChange).toBeNull();
    expect(summary?.absoluteChange).toBe(30);
  });

  it("returns null top-driver fields when no non-total categories are present", () => {
    const data = baseData({
      categories: [
        { key: "risk_present", label: "Present", value: 100, base: 0 },
        { key: "risk_future", label: "Future", value: 170, base: 0 },
      ],
    });
    const summary = computeExecutiveSummary(data);
    expect(summary?.topDriverLabel).toBeNull();
    expect(summary?.topDriverValue).toBeNull();
  });

  it("picks the single non-total category as the top driver", () => {
    const data = baseData({
      categories: [
        { key: "risk_present", label: "Present", value: 100, base: 0 },
        { key: "only_driver", label: "Only Driver", value: -42, base: 0 },
        { key: "risk_future", label: "Future", value: 58, base: 0 },
      ],
    });
    const summary = computeExecutiveSummary(data);
    expect(summary?.topDriverLabel).toBe("Only Driver");
    expect(summary?.topDriverValue).toBe(-42);
  });

  it("TOTAL_KEYS contains only the two total category keys", () => {
    expect(TOTAL_KEYS.has("risk_present")).toBe(true);
    expect(TOTAL_KEYS.has("risk_future")).toBe(true);
    expect(TOTAL_KEYS.has("climate_change")).toBe(false);
  });
});
