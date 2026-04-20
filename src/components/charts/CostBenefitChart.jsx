import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Box, Typography } from "@mui/material";
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

ChartJS.register(BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

const COLOR_PROFITABLE = "rgba(75, 192, 120, 0.85)";
const COLOR_MARGINAL = "rgba(59, 145, 157, 0.85)";
const COLOR_UNPROFITABLE = "rgba(220, 60, 60, 0.85)";

const formatCurrency = (value, unit) => {
  const formatted = Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
};

const formatRatio = (value) =>
  Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });

const colorFor = (ratio) => {
  if (ratio >= 1) return COLOR_PROFITABLE;
  if (ratio > 0) return COLOR_MARGINAL;
  return COLOR_UNPROFITABLE;
};

const CostBenefitChart = React.forwardRef(function CostBenefitChart({ data, errorMessage }, ref) {
  const { t } = useTranslation();
  const internalRef = useRef(null);
  const chartRef = ref ?? internalRef;

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
  const colors = ratios.map(colorFor);

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

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: t("economic_non_economic_adaptation_chart_ratio_label"),
        },
        ticks: {
          callback: (val) => Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 }),
        },
      },
    },
    plugins: {
      legend: { display: false },
      title: { display: true, text: titleText },
      tooltip: {
        callbacks: {
          title: (items) => items[0]?.label ?? "",
          label: (ctx) => {
            const measure = data.measures[ctx.dataIndex];
            return [
              `${t("economic_non_economic_adaptation_chart_tooltip_cost")}: ${formatCurrency(measure.cost, unit)}`,
              `${t("economic_non_economic_adaptation_chart_tooltip_benefit")}: ${formatCurrency(measure.benefit, unit)}`,
              `${t("economic_non_economic_adaptation_chart_tooltip_ratio")}: ${formatRatio(measure.benefit_cost_ratio)}`,
            ];
          },
        },
      },
    },
  };

  return (
    <Box sx={{ width: "100%", height: "100%", minHeight: 320 }}>
      <Bar ref={chartRef} data={chartData} options={options} />
    </Box>
  );
});

export default CostBenefitChart;
