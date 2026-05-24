import React, { useEffect, useMemo, useRef } from "react";
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
import { formatNumber } from "../../lib/formatNumber";
import { patternForIndex } from "../../utils/chartPatterns";
import { buildChartThemeOptions } from "../../utils/chartTheme";
import { prefersReducedMotion } from "../../utils/prefersReducedMotion";
import ChartDataTable from "./ChartDataTable";
import ChartInfoPopover from "../help/ChartInfoPopover";
import type { WaterfallCategory, WaterfallData } from "./types";

ChartJS.register(BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

// react-chartjs-2 calls back with `undefined` (not just `null`) when the
// canvas unmounts, so the ref handle must include `undefined` to remain
// assignable to its `ChartJSOrUndefined<"bar">` ref shape.
type WaterfallChartHandle = Chart<"bar"> | undefined;

export interface WaterfallChartProps {
  data: WaterfallData | null | undefined;
  errorMessage?: string;
  animate?: boolean;
}

const TOTAL_KEYS = new Set(["risk_present", "risk_future"]);
const PRESENT_TOTAL_KEY = "risk_present";
const PATTERN_INCREASE = 1;
const PATTERN_DECREASE = 2;

// Cap the rendered chart at this many pixels so the plot area stays
// data-proportional instead of stretching to fill the available column
// (#412 C2). The cap was raised from the original 520 once the layout
// review (May 2026) showed the lower value left large empty bands on
// 1080p+ screens; 720 keeps four bars from looking absurdly stretched
// while reclaiming most of the wasted vertical space.
const MAX_CHART_HEIGHT = 720;

// When max-bar / min-bar magnitude ratio crosses this threshold the smallest
// bars become unreadable next to the largest — we then label every bar with
// its formatted value (#412 A2).
const VALUE_LABEL_RATIO_THRESHOLD = 10;

// Linear y-axis tick budget (#412 A5). Chart.js's auto-tick can produce huge
// 500k steps that hide small bars; we instead post-process the computed
// min/max into evenly spaced ticks. Alternative considered: symlog scale
// when the magnitude ratio exceeds 50 — kept linear-only for simplicity.
const Y_AXIS_TICK_COUNT = 6;

const formatValue = (value: number, unit: string, locale: string) => {
  const formatted = formatNumber(Number(value), locale);
  return unit ? `${formatted} ${unit}` : formatted;
};

const buildAriaLabel = (
  t: (key: string) => string,
  data: WaterfallData,
  unit: string,
  locale: string
) => {
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

// Chart.js's public `Element` type for a bar doesn't surface the geometric
// fields we need to draw the connector overlay — they live on the BarElement
// subclass at runtime. Narrowing through this shape keeps the cast local to
// the plugin instead of leaking `any` into call sites.
interface BarElementGeometry {
  x: number;
  y: number;
  base: number;
  width: number;
}

// Plugin: draw connector lines between consecutive bar tops so the floating
// waterfall reads as Risk-2024 → +delta → +delta → Risk-2050 (#412 A1).
const buildConnectorPlugin = (
  barData: Array<[number, number]>,
  categories: WaterfallCategory[],
  color: string
) => ({
  id: "waterfall-connectors",
  afterDatasetsDraw(chart: Chart<"bar">) {
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || meta.data.length < 2) return;
    const yScale = chart.scales.y;
    if (!yScale) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    for (let i = 0; i < meta.data.length - 1; i += 1) {
      const bar = meta.data[i] as unknown as BarElementGeometry | undefined;
      const nextBar = meta.data[i + 1] as unknown as BarElementGeometry | undefined;
      if (!bar || !nextBar) continue;
      const fromX = bar.x + bar.width / 2;
      const fromY = yScale.getPixelForValue(barData[i][1]);
      const toX = nextBar.x - nextBar.width / 2;
      // For a final total bar (anchored at 0) the connector should land at
      // the bar's top, not its zero baseline; for floating deltas the
      // connector lands at their `start` so the steps read continuously.
      const nextIsTotal = TOTAL_KEYS.has(categories[i + 1]?.key);
      const toY = yScale.getPixelForValue(nextIsTotal ? barData[i + 1][1] : barData[i + 1][0]);
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
    }
    ctx.restore();
  },
});

// Plugin: render each bar's formatted value above the bar, used when the
// magnitude ratio between the largest and smallest bars makes small bars
// unreadable (#412 A2).
const buildValueLabelsPlugin = (
  values: number[],
  formatter: (value: number) => string,
  color: string,
  font: string
) => ({
  id: "waterfall-value-labels",
  afterDatasetsDraw(chart: Chart<"bar">) {
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    meta.data.forEach((rawBar, i) => {
      const bar = rawBar as unknown as BarElementGeometry | undefined;
      if (!bar) return;
      const value = values[i];
      const label = formatter(value);
      const topY = Math.min(bar.y, bar.base);
      ctx.fillText(label, bar.x, topY - 4);
    });
    ctx.restore();
  },
});

const computeMagnitudeRatio = (categories: WaterfallCategory[]) => {
  const magnitudes = categories.map((c) => Math.abs(c.value)).filter((m) => m > 0);
  if (magnitudes.length < 2) return 1;
  return Math.max(...magnitudes) / Math.min(...magnitudes);
};

const WaterfallChart = React.forwardRef<WaterfallChartHandle, WaterfallChartProps>(
  function WaterfallChart({ data, errorMessage, animate = true }, ref) {
    const { t, i18n } = useTranslation();
    const locale = i18n.language;
    const rtl = isRtl(locale);
    const internalRef = useRef<WaterfallChartHandle | null>(null);
    const chartRef = ref ?? internalRef;
    const theme = useTheme();
    // Increase / decrease / total map onto the semantic viz tokens (#298). An
    // increase in *risk* is bad (negative), a decrease is good (positive); the
    // total bars use the neutral teal so they read as references, not deltas.
    const COLOR_TOTAL = alpha(theme.palette.viz.neutral, 0.85);
    const COLOR_INCREASE = alpha(theme.palette.viz.negative, 0.85);
    const COLOR_DECREASE = alpha(theme.palette.viz.positive, 0.85);
    // Theme-aware pattern stroke keeps the diagonal / increase / decrease
    // textures visible in both light and dark mode (issue #367).
    const patternStroke = theme.palette.viz.patternStroke;
    // Theme-aware axis / tooltip / gridline colours (issue #289). Chart.js's
    // hardcoded grey defaults are invisible against the dark scheme's bg.
    const chartThemeOptions = buildChartThemeOptions(theme);

    useEffect(() => {
      return () => {
        // Detach ref so the saved instance can't outlive the chart.
        if (chartRef && typeof chartRef === "object" && "current" in chartRef) {
          chartRef.current = null;
        }
      };
    }, [chartRef]);

    // First-mount animation only (#370): after the chart paints, drop further
    // animation so dataset updates don't replay the intro. The parent layout
    // re-mounts the component via `key={scenarioRunCode}` to trigger a fresh
    // animated entrance on each new scenario run.
    useEffect(() => {
      if (!chartRef || typeof chartRef === "function") return;
      const chart = chartRef.current;
      if (!chart) return;
      chart.options.animation = false;
    }, [chartRef]);

    const hasData = Boolean(data && Array.isArray(data.categories) && data.categories.length > 0);

    const memoised = useMemo(() => {
      if (!hasData || !data) return null;
      const labels = data.categories.map((c) => bidiIsolate(c.label, locale));
      const unit = data.measurement_unit || "";
      const barData = data.categories.map<[number, number]>((c) => {
        if (TOTAL_KEYS.has(c.key)) return [0, c.value];
        return [c.base, c.base + c.value];
      });
      const colors = data.categories.map((c) => {
        if (TOTAL_KEYS.has(c.key)) return COLOR_TOTAL;
        return c.value >= 0 ? COLOR_INCREASE : COLOR_DECREASE;
      });
      // Hatching is reserved for projected / future-derived bars (#412 C1):
      // Risk-2024 (the historical baseline) stays solid; the two contribution
      // deltas and Risk-2050 all derive from future scenarios and carry the
      // increase/decrease texture.
      const backgrounds = data.categories.map((c, i) => {
        if (c.key === PRESENT_TOTAL_KEY) return colors[i];
        const patternIndex = c.value >= 0 ? PATTERN_INCREASE : PATTERN_DECREASE;
        return patternForIndex(colors[i], patternIndex, patternStroke);
      });
      const presence = {
        total: data.categories.some((c) => TOTAL_KEYS.has(c.key)),
        increase: data.categories.some((c) => !TOTAL_KEYS.has(c.key) && c.value >= 0),
        decrease: data.categories.some((c) => !TOTAL_KEYS.has(c.key) && c.value < 0),
      };
      return { labels, unit, barData, colors, backgrounds, presence };
    }, [data, hasData, locale, COLOR_TOTAL, COLOR_INCREASE, COLOR_DECREASE, patternStroke]);

    if (!hasData || !data || !memoised) {
      return (
        <Box sx={{ textAlign: "center", p: 3 }}>
          <Typography variant="body1">
            {errorMessage || t("economic_non_economic_risk_display_chart_loading_error")}
          </Typography>
        </Box>
      );
    }

    const { labels, unit, barData, colors, backgrounds, presence } = memoised;

    const chartData = {
      labels,
      datasets: [
        {
          label: bidiIsolate(t("economic_non_economic_risk_display_chart_title"), locale),
          data: barData,
          backgroundColor: backgrounds,
          borderColor: colors,
          borderWidth: 1,
        },
      ],
    };

    const baseTitle = `${t("economic_non_economic_risk_display_chart_title")} ${data.present_year} - ${data.future_year}`;
    // Inline the unit into the H3 instead of running it down a rotated y-axis
    // (#412 A6); the y-axis title is suppressed in `options.scales.y` below.
    const titleText = unit ? `${baseTitle} (${unit})` : baseTitle;

    const magnitudeRatio = computeMagnitudeRatio(data.categories);
    const showValueLabels = magnitudeRatio >= VALUE_LABEL_RATIO_THRESHOLD;

    const valueLabelFormatter = (value: number) =>
      formatNumber(Number(value), locale, { maximumFractionDigits: 0 });

    // Custom legend entries — render only the swatches that match the bars in
    // the current dataset (#412 A4).
    const legendItems: Array<{
      text: string;
      fillStyle: string;
      strokeStyle: string;
      lineWidth: number;
    }> = [];
    if (presence.total) {
      legendItems.push({
        text: t("chart_legend_total"),
        fillStyle: COLOR_TOTAL,
        strokeStyle: COLOR_TOTAL,
        lineWidth: 1,
      });
    }
    if (presence.increase) {
      legendItems.push({
        text: t("chart_legend_increases_risk"),
        fillStyle: COLOR_INCREASE,
        strokeStyle: COLOR_INCREASE,
        lineWidth: 1,
      });
    }
    if (presence.decrease) {
      legendItems.push({
        text: t("chart_legend_reduces_risk"),
        fillStyle: COLOR_DECREASE,
        strokeStyle: COLOR_DECREASE,
        lineWidth: 1,
      });
    }

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      // Mount-only intro animation (#370). `prefersReducedMotion()` honours the
      // OS-level reduce-motion setting; otherwise we use Chart.js's canonical
      // fast-then-settle easing to match the rest of the UI's motion language.
      // `animate={false}` from a caller (e.g. the PDF print view, #439) forces
      // a deterministic, animation-free render so the captured frame matches
      // the on-screen final state.
      animation:
        animate === false || prefersReducedMotion()
          ? false
          : { duration: 600, easing: "easeOutQuart" },
      // `mode: "index"` + `intersect: false` makes tooltips fire on the nearest
      // x-category from anywhere in the plot area, not only when the cursor sits
      // directly on a bar.
      interaction: { mode: "index", intersect: false },
      rtl,
      layout: {
        // Reserve a bit of top padding so value labels (when shown) don't
        // collide with the legend.
        padding: { top: showValueLabels ? 24 : 8 },
      },
      scales: {
        x: chartThemeOptions.scales.x,
        y: {
          ...chartThemeOptions.scales.y,
          beginAtZero: true,
          title: { display: false },
          ticks: {
            ...chartThemeOptions.scales.y.ticks,
            maxTicksLimit: 8,
            callback: (val: number | string) =>
              bidiIsolate(formatNumber(Number(val), locale, { maximumFractionDigits: 0 }), locale),
          },
          // Replace Chart.js's default tick layout with a fixed 6-tick scale so
          // the smallest bars stay distinguishable from the y-axis baseline at
          // any magnitude (#412 A5).
          afterBuildTicks: (axis: { min: number; max: number; ticks: { value: number }[] }) => {
            const min = axis.min;
            const max = axis.max;
            if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return;
            const step = (max - min) / (Y_AXIS_TICK_COUNT - 1);
            axis.ticks = Array.from({ length: Y_AXIS_TICK_COUNT }, (_, i) => ({
              value: min + step * i,
            }));
          },
        },
      },
      plugins: {
        legend: {
          display: legendItems.length > 0,
          rtl,
          position: "top",
          align: "end",
          onClick: () => {},
          labels: {
            boxWidth: 12,
            generateLabels: () => legendItems,
          },
        },
        title: { display: false, text: titleText },
        tooltip: {
          rtl,
          ...chartThemeOptions.plugins.tooltip,
          callbacks: {
            title: (items: Array<{ label?: string }>) => bidiIsolate(items[0]?.label ?? "", locale),
            label: (ctx: { dataIndex: number }) => {
              const category = data.categories[ctx.dataIndex];
              return bidiIsolate(formatValue(category.value, unit, locale), locale);
            },
          },
        },
      },
    };

    const valueLabelColor = theme.palette.text.primary;
    const valueLabelFont = `${theme.typography.caption.fontSize} ${theme.typography.fontFamily}`;
    const connectorColor = alpha(theme.palette.text.primary, 0.5);

    const plugins = [buildConnectorPlugin(barData, data.categories, connectorColor)];
    if (showValueLabels) {
      plugins.push(
        buildValueLabelsPlugin(
          data.categories.map((c) => c.value),
          valueLabelFormatter,
          valueLabelColor,
          valueLabelFont
        )
      );
    }

    const tableHeaders = [
      t("chart_data_table_header_category"),
      t("chart_data_table_header_value") + (unit ? ` (${unit})` : ""),
    ];
    const tableRows = data.categories.map((c) => [c.label, formatNumber(c.value, locale)]);

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
            titleKey="chart_info_waterfall_title"
            bodyKey="chart_info_waterfall_body"
            ariaLabelKey="chart_info_waterfall_title"
          />
        </Stack>
        <Box sx={{ position: "relative", flex: 1, minHeight: 240, maxHeight: MAX_CHART_HEIGHT }}>
          {/* Chart.js's `ChartOptions<"bar">` shape is finicky around the
              tick/tooltip callback signatures we pass; the surrounding logic
              is exercised by the existing chart tests and a single cast keeps
              the chart contract local to this file. */}
          <Bar
            ref={chartRef}
            data={chartData}
            options={options as ChartOptions<"bar">}
            plugins={plugins}
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
  }
);

export default WaterfallChart;
