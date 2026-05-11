import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Box, Button, Stack, Typography } from "@mui/material";
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
import ChartDataLabels from "chartjs-plugin-datalabels";

import useUIStore from "../../store/useUIStore";
import { isRtl } from "../../i18nConfig";
import { formatNumber, formatNumberWithUnit } from "../../lib/formatNumber";
import { patternForIndex } from "../../utils/chartPatterns";
import { prefersReducedMotion } from "../../utils/prefersReducedMotion";
import ChartDataTable from "./ChartDataTable";
import ChartInfoPopover from "../help/ChartInfoPopover";

ChartJS.register(BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend, ChartDataLabels);

const PATTERN_PROFITABLE = 0;
const PATTERN_MARGINAL = 1;
const PATTERN_UNPROFITABLE = 2;

const formatCurrency = (value, unit, locale) => formatNumberWithUnit(Number(value), unit, locale);

const formatRatio = (value, locale) => formatNumber(Number(value), locale);

// Profitable / marginal / unprofitable map onto the semantic viz tokens
// (#298). Bars render at 0.85 alpha against the chart canvas.
const styleForRatio = (ratio, colors) => {
  if (ratio >= 1) return { color: colors.profitable, patternIndex: PATTERN_PROFITABLE };
  if (ratio > 0) return { color: colors.marginal, patternIndex: PATTERN_MARGINAL };
  return { color: colors.unprofitable, patternIndex: PATTERN_UNPROFITABLE };
};

const CostBenefitChart = React.forwardRef(function CostBenefitChart({ data, errorMessage }, ref) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const rtl = isRtl(locale);
  const internalRef = useRef(null);
  const chartRef = ref ?? internalRef;
  const showChartValues = useUIStore((state) => state.showChartValues);
  const toggleShowChartValues = useUIStore((state) => state.toggleShowChartValues);
  const theme = useTheme();
  const vizColors = {
    profitable: alpha(theme.palette.viz.positive, 0.85),
    marginal: alpha(theme.palette.viz.neutral, 0.85),
    unprofitable: alpha(theme.palette.viz.negative, 0.85),
  };
  // Theme-aware pattern stroke keeps the profitable / marginal / unprofitable
  // textures visible in both light and dark mode (issue #367).
  const patternStroke = theme.palette.viz.patternStroke;

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
  const labels = data.measures.map((m) => m.name);
  const ratios = data.measures.map((m) => m.benefit_cost_ratio);
  const styles = ratios.map((r) => styleForRatio(r, vizColors));
  const colors = styles.map((s) => s.color);
  const patterns = styles.map((s) => patternForIndex(s.color, s.patternIndex, patternStroke));

  const chartData = {
    labels,
    datasets: [
      {
        label: t("economic_non_economic_adaptation_chart_ratio_label"),
        data: ratios,
        backgroundColor: patterns,
        borderColor: colors,
        borderWidth: 1,
      },
    ],
  };

  const titleText = `${t("economic_non_economic_adaptation_chart_title")} ${data.present_year} - ${data.future_year}`;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    // Mount-only intro animation (#370); see `prefersReducedMotion` for the
    // OS-level opt-out path and `WaterfallChart` for the matching pattern.
    animation: prefersReducedMotion() ? false : { duration: 600, easing: "easeOutQuart" },
    // `mode: "index"` + `intersect: false` resolves tooltips to the nearest
    // x-axis category, so hovering anywhere in the plot area fires the tooltip
    // for the closest bar.
    interaction: { mode: "index", intersect: false },
    rtl,
    scales: {
      y: {
        beginAtZero: true,
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
      datalabels: {
        display: showChartValues,
        anchor: "end",
        align: "end",
        color: alpha(theme.palette.text.primary, 0.9),
        font: { size: 11, weight: 600 },
        formatter: (value) => formatNumber(value, locale),
      },
    },
  };

  const ariaLabel = `${titleText}. ${data.measures
    .map((m) => `${m.name}: ${formatRatio(m.benefit_cost_ratio, locale)}`)
    .join(", ")}`;

  const tableHeaders = [
    t("economic_non_economic_adaptation_chart_tooltip_measure") ||
      t("chart_data_table_header_category"),
    t("economic_non_economic_adaptation_chart_tooltip_cost") + (unit ? ` (${unit})` : ""),
    t("economic_non_economic_adaptation_chart_tooltip_benefit") + (unit ? ` (${unit})` : ""),
    t("economic_non_economic_adaptation_chart_tooltip_ratio"),
  ];
  const tableRows = data.measures.map((m) => [
    m.name,
    formatNumber(m.cost, locale),
    formatNumber(m.benefit, locale),
    formatRatio(m.benefit_cost_ratio, locale),
  ]);

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        minHeight: 320,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="subtitle1" component="h3" sx={{ m: 0 }}>
            {titleText}
          </Typography>
          <ChartInfoPopover
            titleKey="chart_info_cost_benefit_title"
            bodyKey="chart_info_cost_benefit_body"
          />
        </Stack>
        <Button
          size="small"
          variant={showChartValues ? "contained" : "outlined"}
          onClick={toggleShowChartValues}
          aria-pressed={showChartValues}
        >
          {showChartValues ? t("chart_hide_values") : t("chart_show_values")}
        </Button>
      </Stack>
      <Box sx={{ flex: 1, minHeight: 240 }}>
        <Bar ref={chartRef} data={chartData} options={options} aria-label={ariaLabel} role="img" />
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
