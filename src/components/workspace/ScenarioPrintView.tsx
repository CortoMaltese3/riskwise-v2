import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Table, TableBody, TableCell, TableRow, Typography } from "@mui/material";

import { formatDate as formatDateI18n, formatDateTime } from "../../lib/formatDate";

// JSX chart components without TS prop declarations — cast to avoid forwardRef
// inference issues when importing untyped JSX sources into a TS file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import WaterfallChartImport from "../charts/WaterfallChart";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import CostBenefitChartImport from "../charts/CostBenefitChart";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WaterfallChartView = WaterfallChartImport as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CostBenefitChartView = CostBenefitChartImport as any;

interface ScenarioMeta {
  id: string;
  name: string | null;
  country: string | null;
  hazard_type: string | null;
  scenario: string | null;
  ref_year: number | null;
  future_year: number | null;
  annual_growth: number | null;
  exposure_economic: string | null;
  exposure_non_economic: string | null;
  created_at: string | null;
}

interface WaterfallCategory {
  key: string;
  label: string;
  value: number;
  base: number;
}

interface WaterfallData {
  present_year: number;
  future_year: number;
  measurement_unit: string;
  categories: WaterfallCategory[];
}

interface CostBenefitMeasure {
  name: string;
  cost: number;
  benefit: number;
  benefit_cost_ratio: number;
}

interface CostBenefitData {
  currency_unit: string;
  present_year: number;
  future_year: number;
  measures: CostBenefitMeasure[];
}

interface Provenance {
  app_version?: string;
  engine_version?: string;
  climada_version?: string;
  entity_data_sha256?: string;
  hazard_data_sha256?: string;
  country_config_sha256?: string;
  random_seed?: number;
}

const formatDate = (iso: string | null, locale: string) => {
  if (!iso) return "—";
  try {
    return formatDateI18n(iso, locale);
  } catch {
    return String(iso);
  }
};

const LabelRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <TableRow>
    <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd", width: 200, py: 0.75 }}>
      {label}
    </TableCell>
    <TableCell sx={{ border: "1px solid #ddd", py: 0.75 }}>{value ?? "—"}</TableCell>
  </TableRow>
);

const parseJsonResult = <T,>(json: string, setter: (v: T) => void) => {
  try {
    setter(JSON.parse(json) as T);
  } catch {
    // leave state unchanged
  }
};

const ScenarioPrintView = ({ scenarioId }: { scenarioId: string }) => {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const [meta, setMeta] = useState<ScenarioMeta | null>(null);
  const [waterfallData, setWaterfallData] = useState<WaterfallData | null>(null);
  const [costbenData, setCostbenData] = useState<CostBenefitData | null>(null);
  const [provenance, setProvenance] = useState<Provenance>({});
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await window.api.http.request(
          "GET",
          `/api/v1/scenarios/${encodeURIComponent(scenarioId)}`,
          null
        );
        if (!res.success) {
          setError(res.error.message);
          return;
        }
        const payload = (
          res.result as { data: { scenario: ScenarioMeta; results: Record<string, string> } }
        ).data;
        setMeta(payload.scenario);
        if (payload.results.waterfall_data)
          parseJsonResult<WaterfallData>(payload.results.waterfall_data, setWaterfallData);
        if (payload.results.costben_data)
          parseJsonResult<CostBenefitData>(payload.results.costben_data, setCostbenData);
        if (payload.results.impact_summary) {
          parseJsonResult<{ provenance?: Provenance }>(payload.results.impact_summary, (s) =>
            setProvenance(s.provenance ?? {})
          );
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoaded(true);
      }
    };
    fetchData();
  }, [scenarioId]);

  useEffect(() => {
    if (loaded) document.body.dataset.printReady = "true";
  }, [loaded]);

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">Error loading scenario: {error}</Typography>
      </Box>
    );
  }

  if (!meta) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Loading scenario data…</Typography>
      </Box>
    );
  }

  const provenanceRows: Array<[string, string]> = (
    [
      ["App Version", provenance.app_version],
      ["Engine Version", provenance.engine_version],
      ["CLIMADA Version", provenance.climada_version],
      ["Computed At", meta.created_at ? formatDate(meta.created_at, locale) : undefined],
      ["Entity Data SHA-256", provenance.entity_data_sha256],
      ["Hazard Data SHA-256", provenance.hazard_data_sha256],
      ["Country Config SHA-256", provenance.country_config_sha256],
      ["Random Seed", provenance.random_seed != null ? String(provenance.random_seed) : undefined],
    ] as Array<[string, string | undefined]>
  ).filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <>
      <style>{`@media print { button { display: none !important; } }`}</style>

      <Box
        sx={{
          p: "24px",
          maxWidth: 960,
          mx: "auto",
          fontFamily: "Inter, sans-serif",
          "@media print": { p: "12px" },
        }}
      >
        <Typography variant="h4" gutterBottom>
          {meta.name ?? meta.id}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Generated {formatDateTime(new Date(), locale)}
        </Typography>

        <Typography variant="h5" gutterBottom>
          Scenario Parameters
        </Typography>
        <Table size="small" sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}>
          <TableBody>
            <LabelRow label="Country" value={meta.country} />
            <LabelRow label="Hazard" value={meta.hazard_type} />
            <LabelRow label="Climate Scenario" value={meta.scenario} />
            <LabelRow
              label="Time Horizon"
              value={
                meta.ref_year && meta.future_year ? `${meta.ref_year} – ${meta.future_year}` : null
              }
            />
            <LabelRow label="Exposure (Economic)" value={meta.exposure_economic} />
            <LabelRow label="Exposure (Non-Economic)" value={meta.exposure_non_economic} />
            {meta.annual_growth != null && (
              <LabelRow label="Annual Growth" value={`${meta.annual_growth}%`} />
            )}
          </TableBody>
        </Table>

        {waterfallData && (
          <Box sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}>
            <Typography variant="h5" gutterBottom>
              Risk Analysis
            </Typography>
            <Box sx={{ height: 380 }}>
              <WaterfallChartView data={waterfallData} />
            </Box>
          </Box>
        )}

        {costbenData && costbenData.measures.length > 0 && (
          <Box sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}>
            <Typography variant="h5" gutterBottom>
              Cost-Benefit Analysis
            </Typography>
            <Box sx={{ height: 380 }}>
              <CostBenefitChartView data={costbenData} />
            </Box>
          </Box>
        )}

        <Box sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}>
          <Typography variant="h5" gutterBottom>
            Impact Map
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The interactive impact map is available in the Risk Wise application.
          </Typography>
        </Box>

        <Box sx={{ "@media print": { pageBreakInside: "avoid" } }}>
          <Typography variant="h5" gutterBottom>
            Provenance
          </Typography>
          <Table size="small">
            <TableBody>
              {provenanceRows.map(([label, value]) => (
                <TableRow key={label}>
                  <TableCell
                    sx={{ fontWeight: "bold", border: "1px solid #ddd", width: 200, py: 0.75 }}
                  >
                    {label}
                  </TableCell>
                  <TableCell
                    sx={{
                      border: "1px solid #ddd",
                      fontFamily: "monospace",
                      fontSize: "0.75rem",
                      wordBreak: "break-all",
                      py: 0.75,
                    }}
                  >
                    {value}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </>
  );
};

export default ScenarioPrintView;
