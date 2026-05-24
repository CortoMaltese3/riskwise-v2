import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Box, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { Bar } from "react-chartjs-2";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
  type Chart,
  type ChartOptions,
} from "chart.js";

import { isRtl } from "../../i18nConfig";
import { bidiIsolate } from "../../lib/bidi";
import { formatNumber, formatNumberWithUnit } from "../../lib/formatNumber";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { buildChartThemeOptions } from "../../utils/chartTheme";
import { prefersReducedMotion } from "../../utils/prefersReducedMotion";
import ChartDataTable from "./ChartDataTable";
import ChartInfoPopover from "../help/ChartInfoPopover";
import type { CostBenefitMeasure, CostBenefitPayload } from "../../lib/RiskWiseClient";

ChartJS.register(BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

// react-chartjs-2 calls back with `undefined` (not just `null`) when the
// canvas unmounts, so the ref handle must include `undefined` to remain
// assignable to its `ChartJSOrUndefined<"bar">` ref shape.
type CostBenefitChartHandle = Chart<"bar"> | undefined;

export interface CostBenefitChartProps {
  data: CostBenefitPayload | null | undefined;
  errorMessage?: string;
  animate?: boolean;
  appliedCount?: number | null;
  selectedCount?: number | null;
}

interface VizColors {
  profitable: string;
  marginal: string;
  unprofitable: string;
}

const formatCurrency = (value: number, unit: string, locale: string) =>
  formatNumberWithUnit(Number(value), unit, locale);

const formatRatio = (value: number, locale: string) => formatNumber(Number(value), locale);

// Cost-benefit bars are all future projections, so there's no axis along
// which hatching could carry meaning — keep every bar solid (#412 C1).
// Profitable / marginal / unprofitable map onto the semantic viz tokens
// (#298). Bars render at 0.85 alpha against the chart canvas.
const colorForRatio = (ratio: number, colors: VizColors) => {
  if (ratio >= 1) return colors.profitable;
  if (ratio > 0) return colors.marginal;
  return colors.unprofitable;
};

// Cap the rendered chart at this many pixels so the plot area stays
// data-proportional instead of stretching to fill the available column
// (#412 C2). The cap was raised from the original 520 once the layout
// review (May 2026) showed the lower value left large empty bands on
// 1080p+ screens; 720 keeps the bars from looking absurdly stretched
// while reclaiming most of the wasted vertical space.
const MAX_CHART_HEIGHT = 720;

// Plugin: dashed horizontal line at y=1 with a "Break-even" label so the
// Profitable / Marginal / Loss framing in the summary card matches the chart
// (#412 B2).
const buildBreakEvenPlugin = (lineColor: string, labelText: string, font: string) => ({
  id: "cost-benefit-break-even",
  afterDatasetsDraw(chart: Chart<"bar">) {
    const yScale = chart.scales?.y;
    const xScale = chart.scales?.x;
    if (!yScale || !xScale) return;
    const y = yScale.getPixelForValue(1);
    if (!Number.isFinite(y)) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(xScale.left, y);
    ctx.lineTo(xScale.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = lineColor;
    ctx.font = font;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(labelText, xScale.right - 4, y - 2);
    ctx.restore();
  },
});

const CostBenefitChart = React.forwardRef<CostBenefitChartHandle, CostBenefitChartProps>(
  function CostBenefitChart(
    { data, errorMessage, animate = true, appliedCount = null, selectedCount = null },
    ref
  ) {
    const { t, i18n } = useTranslation();
    const locale = i18n.language;
    const rtl = isRtl(locale);
    const internalRef = useRef<CostBenefitChartHandle | null>(null);
    const chartRef = ref ?? internalRef;
    const theme = useTheme();
    const vizColors: VizColors = {
      profitable: alpha(theme.palette.viz.positive, 0.85),
      marginal: alpha(theme.palette.viz.neutral, 0.85),
      unprofitable: alpha(theme.palette.viz.negative, 0.85),
    };
    // Theme-aware axis / tooltip / gridline colours (issue #289).
    const chartThemeOptions = buildChartThemeOptions(theme);

    // Pull the picker's enriched measure list to look up display labels
    // by engine name. The picker fetch already resolved the catalog join
    // (entity ``TP`` → catalog ``adaptation_measures_trees_planting``), so
    // joining here keeps the chart in sync without depending on whatever
    // ``display_name`` the backend may or may not have persisted into the
    // cost-benefit JSON for this run.
    const adaptationMeasures = useWorkspaceStore(
      (s: { adaptationMeasures: Array<Record<string, unknown>> }) => s.adaptationMeasures
    );
    const displayKeyByName = React.useMemo(() => {
      const map = new Map<string, string | null>();
      for (const m of adaptationMeasures) {
        const name = m?.name as string | undefined;
        if (name) {
          const displayName = (m.displayName as string | undefined) ?? null;
          const displayNameSnake = (m.display_name as string | undefined) ?? null;
          map.set(name, displayName ?? displayNameSnake ?? null);
        }
      }
      return map;
    }, [adaptationMeasures]);

    useEffect(() => {
      return () => {
        if (chartRef && typeof chartRef === "object" && "current" in chartRef) {
          chartRef.current = null;
        }
      };
    }, [chartRef]);

    // First-mount animation only (#370): once the chart has painted, drop
    // further animation so subsequent dataset updates don't replay the intro.
    // The parent layout re-mounts via `key={scenarioRunCode}` to replay it on
    // each new scenario run.
    useEffect(() => {
      if (!chartRef || typeof chartRef === "function") return;
      const chart = chartRef.current;
      if (!chart) return;
      chart.options.animation = false;
    }, [chartRef]);

    if (!data || !Array.isArray(data.measures) || data.measures.length === 0) {
      return (
        <Box sx={{ textAlign: "center", p: 3 }}>
          <Typography variant="body1">
            {errorMessage || t("economic_non_economic_adaptation_display_chart_loading_error")}
          </Typography>
        </Box>
      );
    }

    // Bind `measures` to a local so the early-return narrowing survives the
    // tooltip callback closure — TS resets `data.measures` to `T[] | undefined`
    // at the closure boundary.
    const measures = data.measures;
    const unit = data.currency_unit || "";
    // Engine output ships an opaque short code in ``measure_name`` ("GR",
    // "TP", ...) which we surface as ``name`` on the payload. Resolve the
    // i18n key in this order: (1) the picker's enriched catalog join from
    // the workspace store, (2) ``display_name`` persisted on the cost-
    // benefit payload by the backend (#429), (3) raw engine name. (1)
    // catches the case where this run's payload was written before the
    // backend lookup ran or the catalog row had no ``code`` set.
    const labelFor = (m: CostBenefitMeasure) => {
      const key = displayKeyByName.get(m.name) || m.display_name;
      return key ? t(key) : m.name;
    };
    const labels = measures.map((m) => bidiIsolate(labelFor(m), locale));
    const ratios = measures.map((m) => m.benefit_cost_ratio);
    const colors = ratios.map((r) => colorForRatio(r, vizColors));

    const chartData = {
      labels,
      datasets: [
        {
          label: bidiIsolate(t("economic_non_economic_adaptation_chart_ratio_label"), locale),
          data: ratios,
          backgroundColor: colors,
          borderColor: colors,
          borderWidth: 1,
        },
      ],
    };

    const titleText = `${t("economic_non_economic_adaptation_chart_title")} ${data.present_year} - ${data.future_year}`;

    // Always reserve at least 0.2 of headroom above the tallest profitable
    // bar; floor at 1.5 so the y=1 break-even line is never glued to the top
    // of the plot area (#412 B5). Finite-only filter guards against Infinity
    // ratios from zero-cost measures.
    const finiteRatios = ratios.filter((r) => Number.isFinite(r));
    const maxRatio = finiteRatios.length > 0 ? Math.max(...finiteRatios) : 1;
    const suggestedMax = Math.max(1.5, maxRatio + 0.2);

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      // Mount-only intro animation (#370); see `prefersReducedMotion` for the
      // OS-level opt-out path and `WaterfallChart` for the matching pattern.
      // `animate={false}` from a caller (e.g. the PDF print view, #439) forces
      // a deterministic, animation-free render so the captured frame matches
      // the on-screen final state.
      animation:
        animate === false || prefersReducedMotion()
          ? false
          : { duration: 600, easing: "easeOutQuart" },
      // `mode: "index"` still resolves tooltips to the nearest x-axis
      // category, but `position: "average"` anchors the tooltip above the
      // bar centre instead of tracking the cursor (#412 B4).
      interaction: { mode: "index", intersect: false },
      rtl,
      scales: {
        x: {
          ...chartThemeOptions.scales.x,
          ticks: {
            ...chartThemeOptions.scales.x.ticks,
            // Spelt-out measure names can be long ("Recharging wells"); rotate
            // up to 45° so the labels stay legible, and let Chart.js auto-skip
            // when even that won't fit rather than silently truncating
            // (#412 B1).
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            autoSkipPadding: 8,
          },
        },
        y: {
          ...chartThemeOptions.scales.y,
          beginAtZero: true,
          suggestedMax,
          title: {
            ...chartThemeOptions.scales.y.title,
            display: true,
            text: t("economic_non_economic_adaptation_chart_ratio_label"),
          },
          ticks: {
            ...chartThemeOptions.scales.y.ticks,
            callback: (val: number | string) =>
              bidiIsolate(formatNumber(Number(val), locale), locale),
          },
        },
      },
      plugins: {
        legend: { display: false, rtl },
        title: { display: false, text: titleText },
        tooltip: {
          rtl,
          position: "average",
          ...chartThemeOptions.plugins.tooltip,
          callbacks: {
            title: (items: Array<{ label?: string }>) => bidiIsolate(items[0]?.label ?? "", locale),
            label: (ctx: { dataIndex: number }) => {
              const measure = measures[ctx.dataIndex];
              return [
                `${t("economic_non_economic_adaptation_chart_tooltip_cost")}: ${formatCurrency(measure.cost, unit, locale)}`,
                `${t("economic_non_economic_adaptation_chart_tooltip_benefit")}: ${formatCurrency(measure.benefit, unit, locale)}`,
                `${t("economic_non_economic_adaptation_chart_tooltip_ratio")}: ${formatRatio(measure.benefit_cost_ratio, locale)}`,
              ].map((line) => bidiIsolate(line, locale));
            },
          },
        },
      },
    };

    const breakEvenColor = alpha(theme.palette.text.primary, 0.65);
    const breakEvenFont = `${theme.typography.caption.fontSize} ${theme.typography.fontFamily}`;
    const plugins = [
      buildBreakEvenPlugin(breakEvenColor, t("chart_break_even_label"), breakEvenFont),
    ];

    const ariaLabel = `${titleText}. ${measures
      .map((m) => `${labelFor(m)}: ${formatRatio(m.benefit_cost_ratio, locale)}`)
      .join(", ")}`;

    const tableHeaders = [
      t("economic_non_economic_adaptation_chart_tooltip_measure") ||
        t("chart_data_table_header_category"),
      t("economic_non_economic_adaptation_chart_tooltip_cost") + (unit ? ` (${unit})` : ""),
      t("economic_non_economic_adaptation_chart_tooltip_benefit") + (unit ? ` (${unit})` : ""),
      t("economic_non_economic_adaptation_chart_tooltip_ratio"),
    ];
    const tableRows = measures.map((m) => [
      labelFor(m),
      formatNumber(m.cost, locale),
      formatNumber(m.benefit, locale),
      formatRatio(m.benefit_cost_ratio, locale),
    ]);

    return (
      <Box
        sx={{
          width: "100%",
          flex: 1,
          minHeight: 320,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mb: 1 }}>
          <Typography variant="subtitle1" component="h3" sx={{ m: 0 }}>
            {titleText}
          </Typography>
          <ChartInfoPopover
            titleKey="chart_info_cost_benefit_title"
            bodyKey="chart_info_cost_benefit_body"
            ariaLabelKey="chart_info_cost_benefit_title"
          />
        </Stack>
        {/* Surface the silent-backend-filter signal (issue #450). The chip
         * renders only when the run dropped at least one of the user's
         * selected measures so the cost-benefit chart can't go on
         * pretending it covered every pick. */}
        {Number.isInteger(appliedCount) &&
          Number.isInteger(selectedCount) &&
          (appliedCount as number) < (selectedCount as number) && (
            <Typography
              variant="caption"
              color="warning.main"
              sx={{ mb: 1 }}
              data-testid="cost-benefit-applied-subtitle"
            >
              {t("economic_non_economic_adaptation_chart_applied_subtitle", {
                applied: appliedCount,
                selected: selectedCount,
              })}
            </Typography>
          )}
        <Box
          sx={{
            position: "relative",
            flex: 1,
            minHeight: 240,
            maxHeight: MAX_CHART_HEIGHT,
          }}
        >
          <Bar
            ref={chartRef}
            data={chartData}
            options={options as ChartOptions<"bar">}
            plugins={plugins}
            aria-label={ariaLabel}
            role="img"
          />
        </Box>
        <ChartDataTable
          caption={titleText}
          headers={tableHeaders}
          rows={tableRows}
          summaryLabel={t("chart_data_table_summary")}
        />
      </Box>
    );
  }
);

export default CostBenefitChart;
