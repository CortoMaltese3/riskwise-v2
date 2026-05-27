import type { WaterfallCategory, WaterfallPayload } from "../../../../lib/RiskWiseClient";

export interface ExecutiveSummary {
  presentYear: number;
  futureYear: number;
  presentValue: number;
  futureValue: number;
  absoluteChange: number;
  percentChange: number | null;
  topDriverLabel: string | null;
  topDriverValue: number | null;
  unit: string;
}

export const TOTAL_KEYS = new Set(["risk_present", "risk_future"]);

export const computeExecutiveSummary = (data: WaterfallPayload): ExecutiveSummary | null => {
  const present = data.categories.find((c) => c.key === "risk_present");
  const future = data.categories.find((c) => c.key === "risk_future");
  if (!present || !future) return null;

  const drivers = data.categories.filter((c) => !TOTAL_KEYS.has(c.key));
  const topDriver = drivers.reduce<WaterfallCategory | null>((best, c) => {
    if (!best) return c;
    return Math.abs(c.value) > Math.abs(best.value) ? c : best;
  }, null);

  const absoluteChange = future.value - present.value;
  const percentChange = present.value !== 0 ? (absoluteChange / present.value) * 100 : null;

  return {
    presentYear: data.present_year,
    futureYear: data.future_year,
    presentValue: present.value,
    futureValue: future.value,
    absoluteChange,
    percentChange,
    topDriverLabel: topDriver?.label ?? null,
    topDriverValue: topDriver?.value ?? null,
    unit: data.measurement_unit,
  };
};
