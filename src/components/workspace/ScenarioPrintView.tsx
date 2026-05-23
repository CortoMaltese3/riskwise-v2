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
import { isRtl } from "../../i18nConfig";
import gizLogo from "../../assets/giz_logo.png";
import unuEhsLogo from "../../assets/unu_ehs_logo.png";

import { useScenarioMeta } from "./scenarioPrintView/hooks/useScenarioMeta";
import { useCurrentUser } from "./scenarioPrintView/hooks/useCurrentUser";
import {
  useSnapshotFigures,
  type SnapshotFigure,
} from "./scenarioPrintView/hooks/useSnapshotFigures";
import { computeExecutiveSummary } from "./scenarioPrintView/utils/executiveSummary";
import type { SurfaceKey } from "./scenarioPrintView/utils/surfaceGrouping";

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

const SHA_PREFIX_LEN = 8;

// Maps backend snapshot_type values to i18n keys for the fallback heading
// used when a snapshot has no user-provided title.
const SNAPSHOT_TYPE_LABEL_KEYS: Record<string, string> = {
  map: "snapshot_type_map",
  waterfall: "snapshot_type_waterfall",
  cost_benefit: "snapshot_type_cost_benefit",
};

const shortSha = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  return value.slice(0, SHA_PREFIX_LEN);
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

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <Typography variant="h5" gutterBottom>
    {children}
  </Typography>
);

const ScenarioPrintView = ({
  scenarioId,
  snapshotIds,
  includeWaterfall = true,
  includeCostBenefit = true,
}: {
  scenarioId: string;
  snapshotIds?: string[];
  includeWaterfall?: boolean;
  includeCostBenefit?: boolean;
}) => {
  const { i18n, t } = useTranslation();
  const locale = i18n.language;
  const { formatNumber: formatNumberLocale } = useReportLocale();
  const { meta, waterfallData, costbenData, error, loaded } = useScenarioMeta(scenarioId);
  const currentUser = useCurrentUser();
  const { figures, snapshotsResolved, availableSurfaceCounts, allImagesSettled, onImageSettled } =
    useSnapshotFigures(scenarioId, snapshotIds);

  const [generatedAt] = useState(() => new Date());

  // Readiness gate also waits for the username fetch and every snapshot
  // <img> to fire onLoad or onError, so printToPDF doesn't capture
  // half-loaded blob URLs.
  const printReady = loaded && currentUser !== undefined && snapshotsResolved && allImagesSettled;
  useEffect(() => {
    if (!printReady) return;
    document.body.dataset.printReady = "true";
    return () => {
      delete document.body.dataset.printReady;
    };
  }, [printReady]);

  const provenanceRows = useMemo<Array<[string, string]>>(() => {
    if (!meta) return [];
    const computedAt = meta.computed_at ?? meta.created_at;
    return (
      [
        ["App Version", meta.app_version],
        ["Engine Version", meta.engine_version],
        ["Computed At", computedAt ? formatDate(computedAt, locale) : undefined],
        ["Entity Data SHA-256 (8-char prefix)", shortSha(meta.entity_data_sha256)],
        ["Hazard Data SHA-256 (8-char prefix)", shortSha(meta.hazard_data_sha256)],
        ["Country Config SHA-256 (8-char prefix)", shortSha(meta.country_config_sha256)],
        ["Random Seed", meta.random_seed != null ? String(meta.random_seed) : undefined],
      ] as Array<[string, string | undefined]>
    ).filter((row): row is [string, string] => Boolean(row[1]));
  }, [meta, locale]);

  const executiveSummary = useMemo(
    () => (waterfallData ? computeExecutiveSummary(waterfallData) : null),
    [waterfallData]
  );

  const hasCostbenMeasures = !!(costbenData && costbenData.measures.length > 0);
  const showWaterfall = includeWaterfall && Boolean(waterfallData);
  const showCostBenefit = includeCostBenefit && hasCostbenMeasures;

  const figuresBySurface = useMemo(() => {
    const buckets: Record<SurfaceKey, SnapshotFigure[]> = {
      hazard: [],
      exposure: [],
      impact: [],
      adaptation: [],
      other: [],
    };
    for (const fig of figures) buckets[fig.surface].push(fig);
    return buckets;
  }, [figures]);

  const hasOtherVisuals = figuresBySurface.other.length > 0;

  const tocEntries = useMemo(() => {
    const entries = [
      t("print_section_input_parameters"),
      t("print_section_executive_summary"),
      t("print_section_hazard"),
      t("print_section_exposure"),
    ];
    // Impact / Cost-Benefit TOC entries still appear when their data is
    // present even if the chart toggle is unchecked, because the section
    // itself still renders (description + slot).
    // Section keeps its TOC entry whenever the data exists; the chart toggle
    // only suppresses the chart, not the surrounding description and slot.
    if (waterfallData) entries.push(t("print_section_impact"));
    if (hasCostbenMeasures) entries.push(t("print_section_cost_benefit_adaptation"));
    if (hasOtherVisuals) entries.push(t("print_section_other_visuals"));
    entries.push(t("print_section_methodology"), t("print_section_disclaimer"));
    return entries;
  }, [t, waterfallData, hasCostbenMeasures, hasOtherVisuals]);

  const dateString = useMemo(
    () =>
      formatDateI18n(generatedAt, locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    [generatedAt, locale]
  );
  const timeString = useMemo(
    () =>
      formatDateTime(generatedAt, locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    [generatedAt, locale]
  );
  const disclaimerParagraphs = useMemo(
    () =>
      t("print_disclaimer_body")
        .split("\n")
        .filter((p) => p.trim().length > 0),
    [t]
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

  // Counters mutate during the single render pass and never escape it. The
  // global Figure counter is incremented in DOM order across the auto chart
  // figures and the per-surface snapshot slots, so numbering stays
  // continuous regardless of which sections are populated.
  let tableCount = 0;
  let figureCount = 0;
  const nextTableNumber = () => ++tableCount;
  const nextFigureNumber = () => ++figureCount;

  const renderCaption = (kind: "table" | "figure", number: number, descriptionKey: string) => {
    const labelKey = kind === "table" ? "table_label" : "figure_label";
    return (
      <Typography
        variant="caption"
        data-testid={`caption-${kind}`}
        sx={{ display: "block", fontStyle: "italic", mt: 0.5, mb: 1.5 }}
      >
        {`${t(labelKey, { number })} — ${t(descriptionKey)}`}
      </Typography>
    );
  };
  const renderTableCaption = (number: number, descriptionKey: string) =>
    renderCaption("table", number, descriptionKey);
  const renderFigureCaption = (number: number, descriptionKey: string) =>
    renderCaption("figure", number, descriptionKey);

  const renderSnapshotFigure = (fig: SnapshotFigure) => {
    const figureLabel = t("figure_label", { number: nextFigureNumber() });
    const typeKey = SNAPSHOT_TYPE_LABEL_KEYS[fig.snapshotType];
    const typeLabel = typeKey ? t(typeKey) : fig.snapshotType.replace(/_/g, " ");
    const headingText = fig.title
      ? `${figureLabel} — ${fig.title}`
      : `${figureLabel} — ${typeLabel}`;
    return (
      <Box
        key={fig.id}
        data-testid={`snapshot-figure-${fig.id}`}
        sx={{ mb: 3, "@media print": { pageBreakInside: "avoid" } }}
      >
        <Typography variant="subtitle1" gutterBottom>
          {headingText}
        </Typography>
        <Box
          component="img"
          src={fig.imageUrl}
          alt={fig.title ?? typeLabel}
          onLoad={onImageSettled}
          onError={onImageSettled}
          sx={{
            display: "block",
            maxWidth: "100%",
            maxHeight: "80vh",
            "@media print": { pageBreakInside: "avoid" },
          }}
        />
        {fig.caption && (
          <Typography variant="caption" sx={{ display: "block", fontStyle: "italic", mt: 0.5 }}>
            {fig.caption}
          </Typography>
        )}
      </Box>
    );
  };

  // Section slot contents: per-surface snapshots, or — when the scenario has
  // map snapshots in this surface that the user did not pick — a single
  // italic line telling the reader they exist in the application.
  const renderSlotContents = (surface: SurfaceKey, sectionLabel: string) => {
    const surfaceFigures = figuresBySurface[surface];
    if (surfaceFigures.length > 0) {
      return surfaceFigures.map((fig) => renderSnapshotFigure(fig));
    }
    if (availableSurfaceCounts[surface] > 0) {
      return (
        <Typography
          variant="body2"
          data-testid={`snapshots-available-note-${surface}`}
          sx={{ fontStyle: "italic", mt: 1 }}
        >
          {t("print_section_snapshots_available_note", { section: sectionLabel })}
        </Typography>
      );
    }
    return null;
  };

  // Print view is forced to the light scheme regardless of the stored app
  // theme mode (issue #289). PDF rendering is for human consumption on
  // typically-light printed pages; rendering chart axes and table borders
  // in dark-mode colours would produce illegible exports. Setting
  // `data-mui-color-scheme="light"` on the outer Box scopes MUI's CSS
  // variables to the light scheme within this subtree, so every nested
  // component reads light-scheme palette values even when `<html>` is set
  // to dark.
  return (
    <>
      <style>{`@media print { button { display: none !important; } }`}</style>

      <Box
        data-testid="print-root"
        data-mui-color-scheme="light"
        dir={isRtl(locale) ? "rtl" : "ltr"}
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
                <strong>{t("time_horizon_title")}:</strong> {horizon}
              </Typography>
              {meta.id ? (
                <Typography
                  variant="body1"
                  data-testid="print-cover-run-code"
                  sx={{ fontSize: "0.85em" }}
                >
                  <strong>{t("print_cover_run_code")}:</strong>{" "}
                  <Box component="span" sx={{ fontFamily: "monospace" }}>
                    {meta.id}
                  </Box>
                </Typography>
              ) : null}
            </Stack>
          </Box>

          <Box
            data-testid="print-cover-logos"
            dir="ltr"
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

        {/* Section 2 — Mini Table of Contents */}
        <Box data-testid="print-toc" sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}>
          <Typography variant="subtitle1" gutterBottom>
            {t("print_toc_title")}:
          </Typography>
          <Typography variant="body2" data-testid="print-toc-entries">
            {tocEntries.join(" · ")}
          </Typography>
        </Box>

        {/* Section 3 — Input Parameters + creation metadata */}
        <Box
          data-testid="print-input-parameters"
          sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
        >
          <SectionHeading>{t("print_section_input_parameters")}</SectionHeading>
          <Table size="small" data-testid="print-input-parameters-table">
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
          {renderTableCaption(nextTableNumber(), "print_caption_table_parameters")}

          <Box data-testid="print-creation-metadata" sx={{ mt: 2 }}>
            <Stack spacing={0.25}>
              <Typography variant="body2" data-testid="print-creation-user">
                <strong>{t("print_creation_user")}:</strong>{" "}
                {currentUser || t("print_creation_user_fallback")}
              </Typography>
              <Typography variant="body2" data-testid="print-creation-date">
                <strong>{t("print_creation_date")}:</strong> {dateString}
              </Typography>
              <Typography variant="body2" data-testid="print-creation-time">
                <strong>{t("print_creation_time")}:</strong> {timeString}
              </Typography>
            </Stack>
          </Box>
        </Box>

        {/* Section 4 — Executive Summary */}
        <Box
          data-testid="print-executive-summary"
          sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
        >
          <SectionHeading>{t("print_section_executive_summary")}</SectionHeading>
          {executiveSummary ? (
            <>
              <Table size="small" data-testid="print-executive-summary-table">
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
              {renderTableCaption(nextTableNumber(), "print_caption_table_executive_summary")}
            </>
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

        {/* Section 5 — Hazard */}
        <Box
          data-testid="print-section-hazard"
          sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
        >
          <SectionHeading>{t("print_section_hazard")}</SectionHeading>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t("print_section_hazard_description")}
          </Typography>
          <Box data-testid="snapshots-slot-hazard">
            {renderSlotContents("hazard", t("print_section_hazard"))}
          </Box>
        </Box>

        {/* Section 6 — Exposure */}
        <Box
          data-testid="print-section-exposure"
          sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
        >
          <SectionHeading>{t("print_section_exposure")}</SectionHeading>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t("print_section_exposure_description")}
          </Typography>
          <Box data-testid="snapshots-slot-exposure">
            {renderSlotContents("exposure", t("print_section_exposure"))}
          </Box>
        </Box>

        {/* Section 7 — Impact */}
        <Box
          data-testid="print-section-impact"
          sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
        >
          <SectionHeading>{t("print_section_impact")}</SectionHeading>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t("print_section_impact_description")}
          </Typography>
          {waterfallData ? (
            <>
              {showWaterfall && (
                <>
                  <Box sx={{ height: 380, mb: 1 }}>
                    <WaterfallChartView data={waterfallData} animate={false} />
                  </Box>
                  {renderFigureCaption(nextFigureNumber(), "print_caption_figure_waterfall")}
                </>
              )}

              <Table size="small" data-testid="print-risk-table" sx={{ mt: 2 }}>
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
                    const totalYearByKey: Record<string, number> = {
                      risk_present: waterfallData.present_year,
                      risk_future: waterfallData.future_year,
                    };
                    const totalYear = totalYearByKey[cat.key] ?? null;
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
              {renderTableCaption(nextTableNumber(), "print_caption_table_risk_decomposition")}
            </>
          ) : (
            <Typography variant="body2" color="text.secondary" data-testid="print-impact-missing">
              {t("print_section_no_results")}
            </Typography>
          )}
          <Box data-testid="snapshots-slot-impact">
            {renderSlotContents("impact", t("print_section_impact"))}
          </Box>
        </Box>

        {/* Section 8 — Cost-Benefit / Adaptation */}
        <Box
          data-testid="print-section-cost-benefit"
          sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
        >
          <SectionHeading>{t("print_section_cost_benefit_adaptation")}</SectionHeading>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t("print_section_cost_benefit_description")}
          </Typography>
          {showCostBenefit && costbenData && (
            <>
              <Box sx={{ height: 380, mb: 1 }}>
                <CostBenefitChartView data={costbenData} animate={false} />
              </Box>
              {renderFigureCaption(nextFigureNumber(), "print_caption_figure_cost_benefit")}

              <Table size="small" data-testid="print-costben-table" sx={{ mt: 2 }}>
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
              {renderTableCaption(nextTableNumber(), "print_caption_table_cost_benefit_summary")}
            </>
          )}
          {!hasCostbenMeasures && (
            <Typography variant="body2" color="text.secondary" data-testid="print-costben-missing">
              {t("print_section_no_results")}
            </Typography>
          )}
          <Box data-testid="snapshots-slot-cost-benefit">
            {renderSlotContents("adaptation", t("print_section_cost_benefit_adaptation"))}
          </Box>
        </Box>

        {/* Other Visuals — rendered only when at least one selected snapshot
            had no surface tag. Sits between Cost-Benefit and Methodology so
            the per-domain ordering above stays intact. */}
        {hasOtherVisuals && (
          <Box
            data-testid="print-section-other-visuals"
            sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
          >
            <SectionHeading>{t("print_section_other_visuals")}</SectionHeading>
            <Box data-testid="snapshots-slot-other">
              {figuresBySurface.other.map((fig) => renderSnapshotFigure(fig))}
            </Box>
          </Box>
        )}

        {/* Section 9 — Methodology & Provenance */}
        <Box
          data-testid="print-methodology"
          sx={{ "@media print": { pageBreakInside: "avoid", pageBreakBefore: "always" } }}
        >
          <SectionHeading>{t("print_section_methodology")}</SectionHeading>
          <Typography variant="body2" sx={{ mb: 2 }} data-testid="print-methodology-body">
            {t("print_methodology_body")}
          </Typography>

          <Table size="small" sx={{ mb: 1 }} data-testid="print-provenance-table">
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
          {renderTableCaption(nextTableNumber(), "print_caption_table_provenance")}
          <Typography
            variant="body2"
            sx={{ fontStyle: "italic", mb: 2 }}
            data-testid="reproducibility-note"
          >
            {t("print_reproducibility_note")}
          </Typography>
        </Box>

        {/* Section 10 — Disclaimer (own page) */}
        <Box
          data-testid="print-disclaimer"
          sx={{ "@media print": { pageBreakInside: "avoid", pageBreakBefore: "always" }, mt: 4 }}
        >
          <SectionHeading>{t("print_section_disclaimer")}</SectionHeading>
          <Stack spacing={1.5} data-testid="print-disclaimer-body">
            {disclaimerParagraphs.map((paragraph, idx) => (
              <Typography key={idx} variant="body2">
                {paragraph}
              </Typography>
            ))}
          </Stack>
        </Box>
      </Box>
    </>
  );
};

export default ScenarioPrintView;
