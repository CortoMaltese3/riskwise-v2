// Chart.js does not consume MUI palette tokens — its axis labels, tick text,
// gridlines, legend, and tooltips render with hardcoded greys by default
// (`Chart.defaults.color = '#666'`). On the dark scheme those defaults
// disappear into the dark background. This helper resolves a small set of
// chart-relevant colours from the MUI theme so callers can drop them into
// Chart.js `options` and have axis text / gridlines / tooltips track the
// active scheme without reaching for `useTheme()` in every option path.
//
// Returns a flat `{ scales, plugins }` object whose shape mirrors Chart.js's
// own options tree, so consumers spread the slices they need rather than
// deep-merging unfamiliar option keys.

import { alpha } from "@mui/material/styles";

export const buildChartThemeOptions = (theme) => {
  const textColor = theme.palette.text.primary;
  const mutedColor = theme.palette.text.secondary;
  // Gridlines should be visible but quiet — `divider` is built for this role
  // (MUI uses it for table borders, list separators, etc.) and follows the
  // scheme. Alpha-blended further so dense grids don't compete with bars.
  const gridColor = alpha(theme.palette.divider, 0.6);
  const tooltipBg = theme.palette.background.paper;
  const tooltipBorder = theme.palette.divider;

  return {
    scales: {
      x: {
        ticks: { color: mutedColor },
        title: { color: textColor },
        grid: { color: gridColor },
        border: { color: tooltipBorder },
      },
      y: {
        ticks: { color: mutedColor },
        title: { color: textColor },
        grid: { color: gridColor },
        border: { color: tooltipBorder },
      },
    },
    plugins: {
      legend: {
        labels: { color: textColor },
      },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: textColor,
        bodyColor: textColor,
        borderColor: tooltipBorder,
        borderWidth: 1,
      },
    },
  };
};
