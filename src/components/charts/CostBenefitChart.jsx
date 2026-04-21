import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Box, Button, Stack, Typography } from "@mui/material";
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

import useStore from "../../store";
import { isRtl } from "../../i18nConfig";
import { formatNumber } from "../../lib/formatNumber";
import { patternForIndex } from "../../utils/chartPatterns";
import ChartDataTable from "./ChartDataTable";
import ChartInfoPopover from "../help/ChartInfoPopover";

ChartJS.register(BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend, ChartDataLabels);

const COLOR_PROFITABLE = "rgba(75, 192, 120, 0.85)";
const COLOR_MARGINAL = "rgba(59, 145, 157, 0.85)";
const COLOR_UNPROFITABLE = "rgba(220, 60, 60, 0.85)";
const PATTERN_PROFITABLE = 0;
const PATTERN_MARGINAL = 1;
const PATTERN_UNPROFITABLE = 2;

const formatCurrency = (value, unit, locale) => {
  const formatted = formatNumber(Number(value), locale);
  return unit ? `${formatted} ${unit}` : formatted;
};

const formatRatio = (value, locale) => formatNumber(Number(value), locale);

const styleFor = (ratio) => {
  if (ratio >= 1) return { color: COLOR_PROFITABLE, patternIndex: PATTERN_PROFITABLE };
  if (ratio > 0) return { color: COLOR_MARGINAL, patternIndex: PATTERN_MARGINAL };
  return { color: COLOR_UNPROFITABLE, patternIndex: PATTERN_UNPROFITABLE };
};

const CostBenefitChart = React.forwardRef(function CostBenefitChart({ data, errorMessage }, ref) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const rtl = isRtl(locale);
  const internalRef = useRef(null);
  const chartRef = ref ?? internalRef;
  const showChartValues = useStore((state) => state.showChartValues);
  const toggleShowChartValues = useStore((state) => state.toggleShowChartValues);

  useEffect(() => {
    return () => {
      if (chartRef && "current" in chartRef) {
        chartRef.current = null;
      }
    };
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
  const styles = ratios.map(styleFor);
  const colors = styles.map((s) => s.color);
  const patterns = styles.map((s) => patternForIndex(s.color, s.patternIndex));

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
    animation: { duration: 0 },
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
        color: "rgba(33, 33, 33, 0.9)",
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
