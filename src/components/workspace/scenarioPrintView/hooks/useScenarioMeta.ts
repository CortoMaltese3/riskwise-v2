import { useEffect, useState } from "react";

import RiskWiseClient from "../../../../lib/RiskWiseClient";
import type {
  CostBenefitPayload,
  ScenarioWorkspaceItem,
  WaterfallPayload,
} from "../../../../lib/RiskWiseClient";

export interface UseScenarioMetaResult {
  meta: ScenarioWorkspaceItem | null;
  waterfallData: WaterfallPayload | null;
  costbenData: CostBenefitPayload | null;
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
  const [meta, setMeta] = useState<ScenarioWorkspaceItem | null>(null);
  const [waterfallData, setWaterfallData] = useState<WaterfallPayload | null>(null);
  const [costbenData, setCostbenData] = useState<CostBenefitPayload | null>(null);
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
        const payload = res.result.data;
        setMeta(payload.scenario);
        const results = payload.results;
        if (results?.waterfall_data)
          parseJsonResult<WaterfallPayload>(results.waterfall_data, setWaterfallData);
        if (results?.costben_data)
          parseJsonResult<CostBenefitPayload>(results.costben_data, setCostbenData);
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
