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
} from "chart.js";

import { isRtl } from "../../i18nConfig";
import { formatNumber, formatNumberWithUnit } from "../../lib/formatNumber";
import { prefersReducedMotion } from "../../utils/prefersReducedMotion";
import ChartDataTable from "./ChartDataTable";
import ChartInfoPopover from "../help/ChartInfoPopover";

ChartJS.register(BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

const formatCurrency = (value, unit, locale) => formatNumberWithUnit(Number(value), unit, locale);

const formatRatio = (value, locale) => formatNumber(Number(value), locale);

// Cost-benefit bars are all future projections, so there's no axis along
// which hatching could carry meaning — keep every bar solid (#412 C1).
// Profitable / marginal / unprofitable map onto the semantic viz tokens
// (#298). Bars render at 0.85 alpha against the chart canvas.
const colorForRatio = (ratio, colors) => {
  if (ratio >= 1) return colors.profitable;
  if (ratio > 0) return colors.marginal;
  return colors.unprofitable;
};

// Cap the rendered chart at this many pixels so the plot area stays
// data-proportional instead of stretching to fill the available column
// (#412 C2). Tunable in one place if a downstream layout wants to override.
const MAX_CHART_HEIGHT = 520;

// Plugin: dashed horizontal line at y=1 with a "Break-even" label so the
// Profitable / Marginal / Loss framing in the summary card matches the chart
// (#412 B2).
const buildBreakEvenPlugin = (lineColor, labelText, font) => ({
  id: "cost-benefit-break-even",
  afterDatasetsDraw(chart) {
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

const CostBenefitChart = React.forwardRef(function CostBenefitChart({ data, errorMessage }, ref) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const rtl = isRtl(locale);
  const internalRef = useRef(null);
  const chartRef = ref ?? internalRef;
  const theme = useTheme();
  const vizColors = {
    profitable: alpha(theme.palette.viz.positive, 0.85),
    marginal: alpha(theme.palette.viz.neutral, 0.85),
    unprofitable: alpha(theme.palette.viz.negative, 0.85),
  };

  useEffect(() => {
    return () => {
      if (chartRef && "current" in chartRef) {
        chartRef.current = null;
      }
    };
  }, [chartRef]);

  // First-mount animation only (#370): once the chart has painted, drop
  // further animation so subsequent dataset updates don't replay the intro.
  // The parent layout re-mounts via `key={scenarioRunCode}` to replay it on
  // each new scenario run.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.options.animation = false;
  }, [chartRef]);

  if (!data || !Array.isArray(data.measures) || data.measures.length === 0) {
    return (
      <Box textAlign="center" p={3}>
        <Typography variant="body1">
          {errorMessage || t("economic_non_economic_adaptation_display_chart_loading_error")}
        </Typography>
      </Box>
    );
  }

  const unit = data.currency_unit || "";
  // Engine output ships an opaque short code in ``measure_name`` ("GR",
  // "TP", ...) which we surface as ``name`` on the payload. The backend
  // also joins each code back to a catalog i18n key in ``display_name``
  // (#429); when present, translate it and use it on the axis / tooltip
  // / a11y label so users see the full measure name. Fall back to the
  // raw name for codes that have no catalog mapping yet.
  const labelFor = (m) => (m.display_name ? t(m.display_name) : m.name);
  const labels = data.measures.map(labelFor);
  const ratios = data.measures.map((m) => m.benefit_cost_ratio);
  const colors = ratios.map((r) => colorForRatio(r, vizColors));

  const chartData = {
    labels,
    datasets: [
      {
        label: t("economic_non_economic_adaptation_chart_ratio_label"),
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
    animation: prefersReducedMotion() ? false : { duration: 600, easing: "easeOutQuart" },
    // `mode: "index"` still resolves tooltips to the nearest x-axis
    // category, but `position: "average"` anchors the tooltip above the
    // bar centre instead of tracking the cursor (#412 B4).
    interaction: { mode: "index", intersect: false },
    rtl,
    scales: {
      x: {
        ticks: {
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
        beginAtZero: true,
        suggestedMax,
        title: {
          display: true,
          text: t("economic_non_economic_adaptation_chart_ratio_label"),
        },
        ticks: {
          callback: (val) => formatNumber(Number(val), locale),
        },
      },
    },
    plugins: {
      legend: { display: false, rtl },
      title: { display: false, text: titleText },
      tooltip: {
        rtl,
        position: "average",
        callbacks: {
          title: (items) => items[0]?.label ?? "",
          label: (ctx) => {
            const measure = data.measures[ctx.dataIndex];
            return [
              `${t("economic_non_economic_adaptation_chart_tooltip_cost")}: ${formatCurrency(measure.cost, unit, locale)}`,
              `${t("economic_non_economic_adaptation_chart_tooltip_benefit")}: ${formatCurrency(measure.benefit, unit, locale)}`,
              `${t("economic_non_economic_adaptation_chart_tooltip_ratio")}: ${formatRatio(measure.benefit_cost_ratio, locale)}`,
            ];
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

  const ariaLabel = `${titleText}. ${data.measures
    .map((m) => `${labelFor(m)}: ${formatRatio(m.benefit_cost_ratio, locale)}`)
    .join(", ")}`;

  const tableHeaders = [
    t("economic_non_economic_adaptation_chart_tooltip_measure") ||
      t("chart_data_table_header_category"),
    t("economic_non_economic_adaptation_chart_tooltip_cost") + (unit ? ` (${unit})` : ""),
    t("economic_non_economic_adaptation_chart_tooltip_benefit") + (unit ? ` (${unit})` : ""),
    t("economic_non_economic_adaptation_chart_tooltip_ratio"),
  ];
  const tableRows = data.measures.map((m) => [
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
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
        <Typography variant="subtitle1" component="h3" sx={{ m: 0 }}>
          {titleText}
        </Typography>
        <ChartInfoPopover
          titleKey="chart_info_cost_benefit_title"
          bodyKey="chart_info_cost_benefit_body"
        />
      </Stack>
      <Box
        sx={{
          position: "relative",
          flex: "0 1 auto",
          minHeight: 240,
          maxHeight: MAX_CHART_HEIGHT,
        }}
      >
        <Bar
          ref={chartRef}
          data={chartData}
          options={options}
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
});

export default CostBenefitChart;
