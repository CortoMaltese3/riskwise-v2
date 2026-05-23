import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Stack, Table, TableBody, Typography } from "@mui/material";

import { formatDate as formatDateI18n, formatDateTime } from "../../lib/formatDate";
import { useReportLocale } from "../../hooks/useReportLocale";
import { isRtl } from "../../i18nConfig";

import { useScenarioMeta } from "./scenarioPrintView/hooks/useScenarioMeta";
import { useCurrentUser } from "./scenarioPrintView/hooks/useCurrentUser";
import { useSnapshotFigures } from "./scenarioPrintView/hooks/useSnapshotFigures";
import { computeExecutiveSummary } from "./scenarioPrintView/utils/executiveSummary";
import type { SnapshotFigure } from "./scenarioPrintView/hooks/useSnapshotFigures";
import type { SurfaceKey } from "./scenarioPrintView/utils/surfaceGrouping";

import { CoverPage } from "./scenarioPrintView/sections/CoverPage";
import { ScenarioMetaTable, LabelRow } from "./scenarioPrintView/sections/ScenarioMetaTable";
import { ExecutiveSummarySection } from "./scenarioPrintView/sections/ExecutiveSummarySection";
import { FiguresGrid } from "./scenarioPrintView/sections/FiguresGrid";
import { Disclaimer } from "./scenarioPrintView/sections/Disclaimer";

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

  const horizon =
    meta.ref_year && meta.future_year ? `${meta.ref_year} – ${meta.future_year}` : "—";

  // Counters mutate during the single render pass and never escape it. The
  // global Figure counter is incremented in DOM order across the auto chart
  // figures and the per-surface snapshot slots, so numbering stays
  // continuous regardless of which sections are populated.
  let tableCount = 0;
  let figureCount = 0;
  const nextFigureNumber = () => ++figureCount;

  const renderCaption = (kind: "table" | "figure", number: number, descriptionKey: string) => (
    <Typography
      variant="caption"
      data-testid={`caption-${kind}`}
      sx={{ display: "block", fontStyle: "italic", mt: 0.5, mb: 1.5 }}
    >
      {`${t(kind === "table" ? "table_label" : "figure_label", { number })} — ${t(descriptionKey)}`}
    </Typography>
  );
  const renderTableCaption = (descriptionKey: string) =>
    renderCaption("table", ++tableCount, descriptionKey);
  const renderFigureCaption = (descriptionKey: string) =>
    renderCaption("figure", nextFigureNumber(), descriptionKey);

  // Print view is forced to the light scheme regardless of the stored app
  // theme mode (issue #289). Setting `data-mui-color-scheme="light"` on the
  // outer Box scopes MUI's CSS variables to the light scheme within this
  // subtree, so every nested component reads light-scheme palette values
  // even when `<html>` is set to dark.
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
        <CoverPage meta={meta} horizon={horizon} />

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
          <Typography variant="h5" gutterBottom>
            {t("print_section_input_parameters")}
          </Typography>
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
          {renderTableCaption("print_caption_table_parameters")}

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

        <ExecutiveSummarySection
          summary={executiveSummary}
          formatNumberLocale={formatNumberLocale}
          renderTableCaption={renderTableCaption}
        />

        <FiguresGrid
          figuresBySurface={figuresBySurface}
          availableSurfaceCounts={availableSurfaceCounts}
          waterfallData={waterfallData}
          costbenData={costbenData}
          showWaterfall={showWaterfall}
          showCostBenefit={showCostBenefit}
          hasCostbenMeasures={hasCostbenMeasures}
          hasOtherVisuals={hasOtherVisuals}
          formatNumberLocale={formatNumberLocale}
          renderFigureCaption={renderFigureCaption}
          renderTableCaption={renderTableCaption}
          nextFigureNumber={nextFigureNumber}
          onImageSettled={onImageSettled}
        />

        <ScenarioMetaTable meta={meta} locale={locale} renderTableCaption={renderTableCaption} />

        <Disclaimer paragraphs={disclaimerParagraphs} />
      </Box>
    </>
  );
};

export default ScenarioPrintView;
