// Shared chart payload types. Defined here so the chart components own their
// contract and the print-view utilities that derive numbers from the same
// payloads (executive summary, scenario meta hook) can import the same shape
// without creating a backward dependency from charts into the print view.

export interface WaterfallCategory {
  key: string;
  label: string;
  value: number;
  base: number;
}

export interface WaterfallData {
  present_year: number;
  future_year: number;
  measurement_unit: string;
  categories: WaterfallCategory[];
}

export interface CostBenefitMeasure {
  name: string;
  cost: number;
  benefit: number;
  benefit_cost_ratio: number;
  // Optional i18n key persisted alongside the engine `name` short code so the
  // chart can resolve a human label without the workspace store (#429).
  display_name?: string | null;
}

export interface CostBenefitData {
  currency_unit: string;
  present_year: number;
  future_year: number;
  measures: CostBenefitMeasure[];
}
