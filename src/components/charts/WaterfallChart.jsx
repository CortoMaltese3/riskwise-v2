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

const TOTAL_KEYS = new Set(["risk_present", "risk_future"]);
const COLOR_TOTAL = "rgba(59, 145, 157, 0.85)";
const COLOR_INCREASE = "rgba(220, 60, 60, 0.85)";
const COLOR_DECREASE = "rgba(75, 192, 120, 0.85)";
const PATTERN_TOTAL = 0;
const PATTERN_INCREASE = 1;
const PATTERN_DECREASE = 2;

const formatValue = (value, unit, locale) => {
  const formatted = formatNumber(Number(value), locale);
  return unit ? `${formatted} ${unit}` : formatted;
};

const buildAriaLabel = (t, data, unit, locale) => {
  const present = data.categories.find((c) => c.key === "risk_present");
  const future = data.categories.find((c) => c.key === "risk_future");
  const parts = [t("economic_non_economic_risk_display_chart_title")];
  if (present && future) {
    parts.push(
      `${data.present_year}: ${formatValue(present.value, unit, locale)}, ${data.future_year}: ${formatValue(future.value, unit, locale)}`
    );
  }
  return parts.join(" — ");
};

const WaterfallChart = React.forwardRef(function WaterfallChart({ data, errorMessage }, ref) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const rtl = isRtl(locale);
  const internalRef = useRef(null);
  const chartRef = ref ?? internalRef;
  const showChartValues = useStore((state) => state.showChartValues);
  const toggleShowChartValues = useStore((state) => state.toggleShowChartValues);

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

  const patternIndices = data.categories.map((c) => {
    if (TOTAL_KEYS.has(c.key)) return PATTERN_TOTAL;
    return c.value >= 0 ? PATTERN_INCREASE : PATTERN_DECREASE;
  });

  const patterns = colors.map((color, i) => patternForIndex(color, patternIndices[i]));

  const chartData = {
    labels,
    datasets: [
      {
        label: t("economic_non_economic_risk_display_chart_title"),
        data: barData,
        backgroundColor: patterns,
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
    rtl,
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: unit || "Impact" },
        ticks: {
          callback: (val) => formatNumber(Number(val), locale, { maximumFractionDigits: 0 }),
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
            const category = data.categories[ctx.dataIndex];
            return formatValue(category.value, unit, locale);
          },
        },
      },
      datalabels: {
        display: showChartValues,
        anchor: "end",
        align: "end",
        color: "rgba(33, 33, 33, 0.9)",
        font: { size: 11, weight: 600 },
        formatter: (_value, ctx) => {
          const category = data.categories[ctx.dataIndex];
          return formatNumber(category.value, locale);
        },
      },
    },
  };

  const tableHeaders = [
    t("chart_data_table_header_category"),
    t("chart_data_table_header_value") + (unit ? ` (${unit})` : ""),
  ];
  const tableRows = data.categories.map((c) => [c.label, formatNumber(c.value, locale)]);

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
            titleKey="chart_info_waterfall_title"
            bodyKey="chart_info_waterfall_body"
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
        <Bar
          ref={chartRef}
          data={chartData}
          options={options}
          aria-label={buildAriaLabel(t, data, unit, locale)}
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

export default WaterfallChart;
