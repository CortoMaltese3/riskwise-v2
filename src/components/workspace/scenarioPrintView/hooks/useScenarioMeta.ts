import { useEffect, useState } from "react";

import RiskWiseClient from "../../../../lib/RiskWiseClient";
import type { WaterfallData } from "../utils/executiveSummary";

export interface ScenarioMeta {
  id: string;
  name: string | null;
  country: string | null;
  hazard_type: string | null;
  scenario: string | null;
  ref_year: number | null;
  future_year: number | null;
  annual_growth: number | null;
  exposure_type: string | null;
  asset_type: string | null;
  created_at: string | null;
  app_version?: string | null;
  engine_version?: string | null;
  climada_version?: string | null;
  entity_data_sha256?: string | null;
  hazard_data_sha256?: string | null;
  country_config_sha256?: string | null;
  random_seed?: number | null;
  computed_at?: string | null;
}

export interface CostBenefitMeasure {
  name: string;
  cost: number;
  benefit: number;
  benefit_cost_ratio: number;
}

export interface CostBenefitData {
  currency_unit: string;
  present_year: number;
  future_year: number;
  measures: CostBenefitMeasure[];
}

export interface UseScenarioMetaResult {
  meta: ScenarioMeta | null;
  waterfallData: WaterfallData | null;
  costbenData: CostBenefitData | null;
  error: string | null;
  loaded: boolean;
}

const parseJsonResult = <T>(json: string, setter: (v: T) => void) => {
  try {
    setter(JSON.parse(json) as T);
  } catch {
    // Leave state unchanged: a corrupt nested JSON envelope must not block the
    // rest of the print view from rendering.
  }
};

export const useScenarioMeta = (scenarioId: string): UseScenarioMetaResult => {
  const [meta, setMeta] = useState<ScenarioMeta | null>(null);
  const [waterfallData, setWaterfallData] = useState<WaterfallData | null>(null);
  const [costbenData, setCostbenData] = useState<CostBenefitData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await RiskWiseClient.getScenario(scenarioId);
        if (cancelled) return;
        if (!res.success) {
          setError(res.error.message);
          return;
        }
        const payload = (
          res.result as unknown as {
            data: { scenario: ScenarioMeta; results: Record<string, string> };
          }
        ).data;
        setMeta(payload.scenario);
        if (payload.results.waterfall_data)
          parseJsonResult<WaterfallData>(payload.results.waterfall_data, setWaterfallData);
        if (payload.results.costben_data)
          parseJsonResult<CostBenefitData>(payload.results.costben_data, setCostbenData);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [scenarioId]);

  return { meta, waterfallData, costbenData, error, loaded };
};

export default useScenarioMeta;
