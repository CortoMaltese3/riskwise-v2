import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Button, Stack, Typography } from "@mui/material";
import { Line } from "react-chartjs-2";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";

import useStore from "../../store";
import { isRtl } from "../../i18nConfig";
import { formatNumber } from "../../lib/formatNumber";
import ChartDataTable from "./ChartDataTable";
import ChartInfoPopover from "../help/ChartInfoPopover";

// Register all necessary elements
ChartJS.register(
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartDataLabels
);

const MacroEconomicChart = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const rtl = isRtl(locale);
  const {
    credOutputData,
    selectedMacroCountry,
    selectedMacroScenario,
    selectedMacroSector,
    selectedMacroVariable,
    macroEconomicChartTitle,
    showChartValues,
    toggleShowChartValues,
  } = useStore();

  // Filter data based on selected filters
  const filteredData = credOutputData.filter(
    (row) =>
      row.country === selectedMacroCountry &&
      row.scenario === selectedMacroScenario &&
      row.economic_sector === selectedMacroSector &&
      row.economic_indicator === selectedMacroVariable
  );

  // Group data by adaptation value
  const groupedData = filteredData.reduce((acc, row) => {
    const adaptationKey = row.adpatation === 0 ? "None" : row.adpatation;

    if (!acc[adaptationKey]) {
      acc[adaptationKey] = { years: [], values: [] };
    }
    acc[adaptationKey].years.push(row.year);
    acc[adaptationKey].values.push(row.proportion_change_from_baseline);

    return acc;
  }, {});

  // Build sorted year labels
  const labels =
    filteredData.length > 0
      ? [...new Set(filteredData.map((row) => row.year))].sort((a, b) => a - b)
      : [];

  const datasets = Object.keys(groupedData).map((key) => {
    let borderColor;
    let backgroundColor;

    if (key === "None") {
      // No adaptation
      borderColor = "rgba(255, 99, 132, 1)"; // Red
      backgroundColor = "rgba(255, 99, 132, 0.2)";
    } else if (key === "0.25") {
      // 25% Adaptation
      borderColor = "rgba(255, 206, 86, 1)"; // Yellow
      backgroundColor = "rgba(255, 206, 86, 0.2)";
    } else if (key === "0.33") {
      // 33% Adaptation
      borderColor = "rgba(54, 162, 235, 1)"; // Blue
      backgroundColor = "rgba(54, 162, 235, 0.2)";
    } else if (key === "0.5") {
      // 50% Adaptation
      borderColor = "rgba(255, 159, 64, 1)"; // Orange
      backgroundColor = "rgba(255, 159, 64, 0.2)";
    } else if (key === "0.67") {
      // 67% Adaptation
      borderColor = "rgba(75, 192, 192, 1)"; // Green
      backgroundColor = "rgba(75, 192, 192, 0.2)";
    } else {
      // Fallback for unexpected adaptation values
      borderColor = "rgba(153, 102, 255, 1)"; // Purple
      backgroundColor = "rgba(153, 102, 255, 0.2)";
    }

    const label =
      key === "None"
        ? t("macro_display_chart_no_adaptation")
        : `${formatNumber(parseFloat(key) * 100, locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}% ${t("macro_display_chart_adaptation")}`;

    return {
      label,
      // change proportions to percent values for display
      data: groupedData[key].values.map((v) => v * 100),
      borderColor,
      backgroundColor,
      fill: true,
      tension: 0.4,
    };
  });

  const transformedData = {
    labels,
    datasets,
  };

  const options = {
    // Chart.js honors `rtl: true` by mirroring legend/tooltip layout; combined
    // with the locale-aware tick formatter below, this keeps Arabic renders
    // visually correct without duplicating chart code per locale.
    rtl,
    scales: {
      x: {
        type: "category",
        title: {
          display: true,
          text: t("macro_display_chart_x_axis_label"),
        },
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: t("macro_display_chart_y_axis_label"),
        },
        ticks: {
          callback: (val) =>
            `${formatNumber(Number(val), locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`,
        },
      },
    },
    plugins: {
      legend: { display: true, rtl },
      title: { display: false, text: macroEconomicChartTitle },
      tooltip: {
        rtl,
        callbacks: {
          label: (ctx) =>
            `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y, locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`,
        },
      },
      datalabels: {
        display: showChartValues,
        align: "top",
        color: "rgba(33, 33, 33, 0.9)",
        font: { size: 10, weight: 600 },
        formatter: (value) =>
          `${formatNumber(Number(value), locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`,
      },
    },
  };

  const tableHeaders = [t("macro_display_chart_x_axis_label"), ...datasets.map((d) => d.label)];
  const tableRows = labels.map((year, i) => [
    year,
    ...datasets.map((d) =>
      d.data[i] == null
        ? ""
        : `${formatNumber(d.data[i], locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`
    ),
  ]);

  const ariaLabel = macroEconomicChartTitle
    ? `${macroEconomicChartTitle}. ${datasets.length} series across ${labels.length} years.`
    : t("macro_display_chart_not_available");

  return (
    <Box
      sx={{
        margin: "auto",
        bgcolor: "card.bg",
        border: "2px solid var(--mui-palette-primary-dark)",
        borderRadius: "16px",
        padding: "16px",
        marginBottom: "16px",
        overflow: "hidden",
      }}
    >
      <Box sx={{ height: "100%", overflowY: "auto" }}>
        {filteredData.length > 0 ? (
          <>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 1 }}
            >
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <Typography variant="subtitle1" component="h3" sx={{ m: 0 }}>
                  {macroEconomicChartTitle}
                </Typography>
                <ChartInfoPopover
                  titleKey="chart_info_macro_title"
                  bodyKey="chart_info_macro_body"
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
            <Line data={transformedData} options={options} aria-label={ariaLabel} role="img" />
            <ChartDataTable
              caption={macroEconomicChartTitle}
              headers={tableHeaders}
              rows={tableRows}
              summaryLabel={t("chart_data_table_summary")}
            />
          </>
        ) : (
          <Typography variant="h6" align="center" color="textSecondary">
            {t("macro_display_chart_not_available")}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default MacroEconomicChart;
