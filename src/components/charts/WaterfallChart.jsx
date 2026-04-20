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

const TOTAL_KEYS = new Set(["risk_present", "risk_future"]);
const COLOR_TOTAL = "rgba(59, 145, 157, 0.85)";
const COLOR_INCREASE = "rgba(220, 60, 60, 0.85)";
const COLOR_DECREASE = "rgba(75, 192, 120, 0.85)";

const formatValue = (value, unit) => {
  const formatted = Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
};

const WaterfallChart = React.forwardRef(function WaterfallChart({ data, errorMessage }, ref) {
  const { t } = useTranslation();
  const internalRef = useRef(null);
  const chartRef = ref ?? internalRef;

  useEffect(() => {
    return () => {
      // Detach ref so the saved instance can't outlive the chart.
      if (chartRef && "current" in chartRef) {
        chartRef.current = null;
      }
    };
  }, [chartRef]);

  if (!data || !Array.isArray(data.categories) || data.categories.length === 0) {
    return (
      <Box textAlign="center" p={3}>
        <Typography variant="body1">
          {errorMessage || t("economic_non_economic_risk_display_chart_loading_error")}
        </Typography>
      </Box>
    );
  }

  const labels = data.categories.map((c) => c.label);
  const unit = data.measurement_unit || "";

  const barData = data.categories.map((c) => {
    if (TOTAL_KEYS.has(c.key)) {
      return [0, c.value];
    }
    return [c.base, c.base + c.value];
  });

  const colors = data.categories.map((c) => {
    if (TOTAL_KEYS.has(c.key)) return COLOR_TOTAL;
    return c.value >= 0 ? COLOR_INCREASE : COLOR_DECREASE;
  });

  const chartData = {
    labels,
    datasets: [
      {
        label: t("economic_non_economic_risk_display_chart_title"),
        data: barData,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 1,
      },
    ],
  };

  const titleText = `${t("economic_non_economic_risk_display_chart_title")} ${data.present_year} - ${data.future_year}`;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: unit || "Impact" },
        ticks: {
          callback: (val) => Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 }),
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
            const category = data.categories[ctx.dataIndex];
            return formatValue(category.value, unit);
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

export default WaterfallChart;
