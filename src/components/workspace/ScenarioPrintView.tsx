import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import { formatDate as formatDateI18n, formatDateTime } from "../../lib/formatDate";
import { useReportLocale } from "../../hooks/useReportLocale";
import gizLogo from "../../assets/giz_logo.png";
import unuEhsLogo from "../../assets/unu_ehs_logo.png";

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

const SHA_PREFIX_LEN = 8;
const TOTAL_KEYS = new Set(["risk_present", "risk_future"]);

const shortSha = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  return value.slice(0, SHA_PREFIX_LEN);
};

const buildBibtex = (appVersion?: string | null, climadaVersion?: string | null): string => {
  const year = new Date().getFullYear();
  const app = appVersion ?? "?";
  const climada = climadaVersion ?? "?";
  return [
    `@techreport{riskwise${year},`,
    `  title={RISK WISE v2 Scenario Report},`,
    `  institution={UNU-EHS / GIZ},`,
    `  year={${year}},`,
    `  note={App v${app}, CLIMADA v${climada}}`,
    `}`,
  ].join("\n");
};

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

interface ExecutiveSummary {
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

const computeExecutiveSummary = (data: WaterfallData): ExecutiveSummary | null => {
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

const ScenarioPrintView = ({
  scenarioId,
}: {
  scenarioId: string;
  // Passed through from the `snapshots` URL param (issue #352). Not consumed
  // yet — the follow-up issue will use this to render the user's selection.
  snapshotIds?: string[];
}) => {
  const { i18n, t } = useTranslation();
  const locale = i18n.language;
  const { formatNumber: formatNumberLocale } = useReportLocale();
  const [meta, setMeta] = useState<ScenarioMeta | null>(null);
  const [waterfallData, setWaterfallData] = useState<WaterfallData | null>(null);
  const [costbenData, setCostbenData] = useState<CostBenefitData | null>(null);
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

  const provenanceRows = useMemo<Array<[string, string]>>(() => {
    if (!meta) return [];
    const computedAt = meta.computed_at ?? meta.created_at;
    return (
      [
        ["App Version", meta.app_version],
        ["Engine Version", meta.engine_version],
        ["CLIMADA Version", meta.climada_version],
        ["Computed At", computedAt ? formatDate(computedAt, locale) : undefined],
        ["Entity Data SHA-256 (8-char prefix)", shortSha(meta.entity_data_sha256)],
        ["Hazard Data SHA-256 (8-char prefix)", shortSha(meta.hazard_data_sha256)],
        ["Country Config SHA-256 (8-char prefix)", shortSha(meta.country_config_sha256)],
        ["Random Seed", meta.random_seed != null ? String(meta.random_seed) : undefined],
      ] as Array<[string, string | undefined]>
    ).filter((row): row is [string, string] => Boolean(row[1]));
  }, [meta, locale]);

  const bibtex = useMemo(
    () => buildBibtex(meta?.app_version, meta?.climada_version),
    [meta?.app_version, meta?.climada_version]
  );

  const executiveSummary = useMemo(
    () => (waterfallData ? computeExecutiveSummary(waterfallData) : null),
    [waterfallData]
  );

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
        <Typography>{t("print_scenario_loading")}</Typography>
      </Box>
    );
  }

  const formatWithUnit = (value: number, unit: string) =>
    unit ? `${formatNumberLocale(value)} ${unit}` : formatNumberLocale(value);

  const horizon =
    meta.ref_year && meta.future_year ? `${meta.ref_year} – ${meta.future_year}` : "—";

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
        {/* Section 1 — Cover page */}
        <Box
          data-testid="print-cover"
          sx={{
            minHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            alignItems: "center",
            textAlign: "center",
            py: 6,
            "@media print": {
              pageBreakAfter: "always",
              pageBreakInside: "avoid",
              minHeight: "95vh",
            },
          }}
        >
          <Box sx={{ width: "100%", mt: 6 }}>
            <Typography variant="h3" gutterBottom>
              {t("print_cover_title")}
            </Typography>
            <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>
              {meta.name ?? meta.id}
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 4 }}>
              <Typography variant="body1">
                <strong>{t("country")}:</strong> {meta.country ?? "—"}
              </Typography>
              <Typography variant="body1">
                <strong>{t("hazard_title")}:</strong> {meta.hazard_type ?? "—"}
              </Typography>
              <Typography variant="body1">
                <strong>{t("print_label_climate_scenario")}:</strong> {meta.scenario ?? "—"}
              </Typography>
              <Typography variant="body1">
                <strong>{t("time_horizon_title")}:</strong> {horizon}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
              {t("print_generated_at", { date: formatDateTime(new Date(), locale) })}
            </Typography>
            <Stack spacing={0.25} sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {t("print_cover_app_version")}: {meta.app_version ?? "—"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("print_cover_engine_version")}: {meta.engine_version ?? "—"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("print_cover_climada_version")}: {meta.climada_version ?? "—"}
              </Typography>
            </Stack>
          </Box>

          <Box
            data-testid="print-cover-logos"
            sx={{
              mt: 6,
              mb: 2,
              display: "flex",
              flexDirection: "row",
              gap: 6,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Box
              component="img"
              src={gizLogo}
              alt="GIZ"
              sx={{ height: 60, objectFit: "contain" }}
            />
            <Box
              component="img"
              src={unuEhsLogo}
              alt="UNU-EHS"
              sx={{ height: 60, objectFit: "contain" }}
            />
          </Box>
        </Box>

        {/* Section 2 — Executive Summary */}
        <Box
          data-testid="print-executive-summary"
          sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
        >
          <Typography variant="h5" gutterBottom>
            {t("print_section_executive_summary")}
          </Typography>
          {executiveSummary ? (
            <Table size="small">
              <TableBody>
                <LabelRow
                  label={t("print_kpi_present_aal", { year: executiveSummary.presentYear })}
                  value={formatWithUnit(executiveSummary.presentValue, executiveSummary.unit)}
                />
                <LabelRow
                  label={t("print_kpi_future_aal", { year: executiveSummary.futureYear })}
                  value={formatWithUnit(executiveSummary.futureValue, executiveSummary.unit)}
                />
                <LabelRow
                  label={t("print_kpi_change_absolute")}
                  value={formatWithUnit(executiveSummary.absoluteChange, executiveSummary.unit)}
                />
                <LabelRow
                  label={t("print_kpi_change_percent")}
                  value={
                    executiveSummary.percentChange != null
                      ? `${formatNumberLocale(executiveSummary.percentChange)}%`
                      : "—"
                  }
                />
                {executiveSummary.topDriverLabel != null &&
                  executiveSummary.topDriverValue != null && (
                    <LabelRow
                      label={t("print_kpi_top_driver")}
                      value={`${executiveSummary.topDriverLabel} (${formatWithUnit(
                        executiveSummary.topDriverValue,
                        executiveSummary.unit
                      )})`}
                    />
                  )}
              </TableBody>
            </Table>
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              data-testid="print-summary-unavailable"
            >
              {t("print_summary_unavailable")}
            </Typography>
          )}
        </Box>

        {/* Section 3 — Scenario Inputs */}
        <Box
          data-testid="print-scenario-inputs"
          sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
        >
          <Typography variant="h5" gutterBottom>
            {t("print_section_scenario_inputs")}
          </Typography>
          <Table size="small">
            <TableBody>
              <LabelRow label={t("country")} value={meta.country} />
              <LabelRow label={t("hazard_title")} value={meta.hazard_type} />
              <LabelRow label={t("print_label_climate_scenario")} value={meta.scenario} />
              <LabelRow
                label={t("time_horizon_title")}
                value={
                  meta.ref_year && meta.future_year
                    ? `${meta.ref_year} – ${meta.future_year}`
                    : null
                }
              />
              <LabelRow
                label={
                  meta.asset_type === "non_economic"
                    ? t("print_label_exposure_non_economic")
                    : t("print_label_exposure_economic")
                }
                value={meta.exposure_type}
              />
              {meta.annual_growth != null && (
                <LabelRow
                  label={t("annual_growth")}
                  value={`${formatNumberLocale(meta.annual_growth)}%`}
                />
              )}
            </TableBody>
          </Table>
        </Box>

        {/* Section 4 — Key Results Tables */}
        <Box
          data-testid="print-key-results"
          sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
        >
          <Typography variant="h5" gutterBottom>
            {t("print_section_key_results")}
          </Typography>

          <Typography variant="subtitle1" gutterBottom>
            {t("print_table_risk_decomposition")}
          </Typography>
          {waterfallData ? (
            <Table size="small" data-testid="print-risk-table" sx={{ mb: 3 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd" }}>
                    {t("print_table_col_category")}
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd" }}>
                    {t("print_table_col_value")}
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd" }}>
                    {t("print_table_col_unit")}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {waterfallData.categories.map((cat) => {
                  const totalYear =
                    cat.key === "risk_present"
                      ? waterfallData.present_year
                      : cat.key === "risk_future"
                        ? waterfallData.future_year
                        : null;
                  const label =
                    totalYear != null ? t("print_table_total", { year: totalYear }) : cat.label;
                  return (
                    <TableRow key={cat.key}>
                      <TableCell sx={{ border: "1px solid #ddd", py: 0.5 }}>{label}</TableCell>
                      <TableCell sx={{ border: "1px solid #ddd", py: 0.5 }}>
                        {formatNumberLocale(cat.value)}
                      </TableCell>
                      <TableCell sx={{ border: "1px solid #ddd", py: 0.5 }}>
                        {waterfallData.measurement_unit}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              data-testid="print-risk-table-missing"
              sx={{ mb: 3 }}
            >
              {t("print_table_not_available")}
            </Typography>
          )}

          <Typography variant="subtitle1" gutterBottom>
            {t("print_table_costben_summary")}
          </Typography>
          {costbenData && costbenData.measures.length > 0 ? (
            <Table size="small" data-testid="print-costben-table">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd" }}>
                    {t("print_table_col_measure")}
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd" }}>
                    {`${t("print_table_col_cost")} (${costbenData.currency_unit})`}
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd" }}>
                    {`${t("print_table_col_benefit")} (${costbenData.currency_unit})`}
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd" }}>
                    {t("print_table_col_bcr")}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...costbenData.measures]
                  .sort((a, b) => b.benefit_cost_ratio - a.benefit_cost_ratio)
                  .map((m) => (
                    <TableRow key={m.name}>
                      <TableCell sx={{ border: "1px solid #ddd", py: 0.5 }}>{m.name}</TableCell>
                      <TableCell sx={{ border: "1px solid #ddd", py: 0.5 }}>
                        {formatNumberLocale(m.cost)}
                      </TableCell>
                      <TableCell sx={{ border: "1px solid #ddd", py: 0.5 }}>
                        {formatNumberLocale(m.benefit)}
                      </TableCell>
                      <TableCell sx={{ border: "1px solid #ddd", py: 0.5 }}>
                        {formatNumberLocale(m.benefit_cost_ratio)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              data-testid="print-costben-table-missing"
            >
              {t("print_table_not_available")}
            </Typography>
          )}
        </Box>

        {/* Section 5 — Visuals */}
        <Box
          data-testid="print-visuals"
          sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
        >
          <Typography variant="h5" gutterBottom>
            {t("print_section_visuals")}
          </Typography>

          {waterfallData && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                {t("print_section_risk_analysis")}
              </Typography>
              <Box sx={{ height: 380 }}>
                <WaterfallChartView data={waterfallData} />
              </Box>
            </Box>
          )}

          {costbenData && costbenData.measures.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                {t("print_section_cost_benefit")}
              </Typography>
              <Box sx={{ height: 380 }}>
                <CostBenefitChartView data={costbenData} />
              </Box>
            </Box>
          )}

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              {t("print_section_impact_map")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("print_section_impact_map_note")}
            </Typography>
          </Box>

          {/* Snapshot embedding lands in the next issue; the slot is reserved here. */}
          <Box data-testid="snapshots-slot" />
        </Box>

        {/* Section 6 — Methodology & Provenance */}
        <Box
          data-testid="print-methodology"
          sx={{ "@media print": { pageBreakInside: "avoid", pageBreakBefore: "always" } }}
        >
          <Typography variant="h5" gutterBottom>
            {t("print_section_methodology")}
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }} data-testid="print-methodology-body">
            {t("print_methodology_body")}
          </Typography>

          <Table size="small" sx={{ mb: 2 }}>
            <TableBody>
              {provenanceRows.map(([label, value]) => (
                <TableRow key={label}>
                  <TableCell
                    sx={{ fontWeight: "bold", border: "1px solid #ddd", width: 260, py: 0.75 }}
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
          <Typography
            variant="body2"
            sx={{ fontStyle: "italic", mb: 2 }}
            data-testid="reproducibility-note"
          >
            {t("print_reproducibility_note")}
          </Typography>
          <Typography variant="subtitle2" gutterBottom>
            {t("print_citation_title")}
          </Typography>
          <Box
            component="pre"
            data-testid="bibtex-snippet"
            sx={{
              fontFamily: "Consolas, monospace",
              fontSize: "0.75rem",
              backgroundColor: "#f5f5f5",
              border: "1px solid #ddd",
              p: 1.5,
              m: 0,
              whiteSpace: "pre-wrap",
            }}
          >
            {bibtex}
          </Box>
        </Box>
      </Box>
    </>
  );
};

export default ScenarioPrintView;
