import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Box, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
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

import useResultsStore from "../../store/useResultsStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { isRtl } from "../../i18nConfig";
import { bidiIsolate } from "../../lib/bidi";
import { formatNumber } from "../../lib/formatNumber";
import { buildChartThemeOptions } from "../../utils/chartTheme";
import { prefersReducedMotion } from "../../utils/prefersReducedMotion";
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
  Filler
);

// Adaptation values render in a fixed order — None (no adaptation) is the
// reference series; the adaptation tiers (0.25, 0.33, 0.5, 0.67, …) read as
// successively-better outcomes. Mapped onto the categorical viz palette so
// dark mode picks up the same hues automatically (#298).
const ADAPTATION_KEY_ORDER = ["None", "0.25", "0.33", "0.5", "0.67"];

const MacroEconomicChart = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const rtl = isRtl(locale);
  const theme = useTheme();
  const chartRef = useRef(null);
  const vizCategorical = theme.palette.viz.categorical;
  // Theme-aware axis / tooltip / gridline colours (issue #289).
  const chartThemeOptions = buildChartThemeOptions(theme);

  // First-mount animation only (#370). Disabling animation after the initial
  // paint means dropdown filter changes (country / scenario / sector /
  // variable) update the chart silently. Unlike the waterfall / cost-benefit
  // charts, this component is NOT remounted by the parent on scenario runs.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.options.animation = false;
  }, []);
  const colorForAdaptationKey = (key) => {
    const idx = ADAPTATION_KEY_ORDER.indexOf(key);
    // Unknown adaptation values fall through to the last categorical hue.
    return vizCategorical[idx >= 0 ? idx : vizCategorical.length - 1];
  };
  const credOutputData = useResultsStore((s) => s.credOutputData);
  const macroEconomicChartTitle = useResultsStore((s) => s.macroEconomicChartTitle);
  const selectedMacroCountry = useWorkspaceStore((s) => s.selectedMacroCountry);
  const selectedMacroScenario = useWorkspaceStore((s) => s.selectedMacroScenario);
  const selectedMacroSector = useWorkspaceStore((s) => s.selectedMacroSector);
  const selectedMacroVariable = useWorkspaceStore((s) => s.selectedMacroVariable);

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
    const seriesColor = colorForAdaptationKey(key);
    const borderColor = seriesColor;
    const backgroundColor = alpha(seriesColor, 0.2);

    const label =
      key === "None"
        ? t("macro_display_chart_no_adaptation")
        : `${formatNumber(parseFloat(key) * 100, locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}% ${t("macro_display_chart_adaptation")}`;

    return {
      label: bidiIsolate(label, locale),
      // change proportions to percent values for display
      data: groupedData[key].values.map((v) => v * 100),
      borderColor,
      backgroundColor,
      fill: true,
      tension: 0.4,
      // Bigger visible markers + a forgiving invisible hover hit area (#370).
      // `pointHitRadius` extends the hover target ~16px beyond each point so
      // tooltips fire from the surrounding plot area, not only when the
      // cursor lands precisely on a data point.
      pointRadius: 4,
      pointHoverRadius: 7,
      pointHitRadius: 16,
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
    responsive: true,
    // Without this, Chart.js sizes the canvas as width/aspectRatio (default 2),
    // so on wide right-panes the empty plot becomes ~700-900px tall and pushes
    // the controls bar past the viewport, triggering a scrollbar in the parent
    // ScrollableRegion. Pair with the fixed-height wrapper below.
    maintainAspectRatio: false,
    // Mount-only intro animation (#370). The post-mount effect disables
    // animation after the first paint so dropdown filter changes update
    // silently. `prefersReducedMotion()` honours the OS-level opt-out.
    animation: prefersReducedMotion() ? false : { duration: 600, easing: "easeOutQuart" },
    // `mode: "index"` + `intersect: false` lets users hover anywhere in the
    // plot area to see the tooltip for the nearest x-value — small markers
    // no longer need a pixel-perfect cursor position.
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        ...chartThemeOptions.scales.x,
        type: "category",
        title: {
          ...chartThemeOptions.scales.x.title,
          display: true,
          text: t("macro_display_chart_x_axis_label"),
        },
      },
      y: {
        ...chartThemeOptions.scales.y,
        beginAtZero: true,
        title: {
          ...chartThemeOptions.scales.y.title,
          display: true,
          text: t("macro_display_chart_y_axis_label"),
        },
        ticks: {
          ...chartThemeOptions.scales.y.ticks,
          callback: (val) =>
            bidiIsolate(
              `${formatNumber(Number(val), locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`,
              locale
            ),
        },
      },
    },
    plugins: {
      legend: { display: true, rtl, labels: chartThemeOptions.plugins.legend.labels },
      title: { display: false, text: macroEconomicChartTitle },
      tooltip: {
        rtl,
        ...chartThemeOptions.plugins.tooltip,
        callbacks: {
          label: (ctx) =>
            bidiIsolate(
              `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y, locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`,
              locale
            ),
        },
      },
    },
  };

  const hasData = filteredData.length > 0;

  const tableHeaders = hasData
    ? [t("macro_display_chart_x_axis_label"), ...datasets.map((d) => d.label)]
    : [];
  const tableRows = hasData
    ? labels.map((year, i) => [
        year,
        ...datasets.map((d) =>
          d.data[i] == null
            ? ""
            : `${formatNumber(d.data[i], locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`
        ),
      ])
    : [];

  const ariaLabel = macroEconomicChartTitle
    ? `${macroEconomicChartTitle}. ${datasets.length} series across ${labels.length} years.`
    : t("macro_display_chart_not_available");

  return (
    <Box
      data-testid="macro-chart-frame"
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: "primary.bgStrong",
        border: 2,
        borderColor: "primary.dark",
        borderRadius: (theme) => theme.spacing(2),
        padding: 2,
        marginBottom: 2,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}
      >
        {hasData && (
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
            <Typography variant="subtitle1" component="h3" sx={{ m: 0 }}>
              {macroEconomicChartTitle}
            </Typography>
            <ChartInfoPopover titleKey="chart_info_macro_title" bodyKey="chart_info_macro_body" />
          </Stack>
        )}
        <Box sx={{ position: "relative", flex: 1, minHeight: 320, mb: 1 }}>
          <Line
            ref={chartRef}
            data={transformedData}
            options={options}
            aria-label={ariaLabel}
            role="img"
          />
        </Box>
        {hasData ? (
          <ChartDataTable
            caption={macroEconomicChartTitle}
            headers={tableHeaders}
            rows={tableRows}
            summaryLabel={t("chart_data_table_summary")}
          />
        ) : (
          <Typography
            variant="body2"
            align="center"
            color="text.secondary"
            data-testid="macro-chart-empty-hint"
            aria-hidden="true"
            sx={{ mt: 1 }}
          >
            {t("macro_display_chart_not_available")}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default MacroEconomicChart;
