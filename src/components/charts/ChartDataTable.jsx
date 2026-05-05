import React from "react";
import { useTranslation } from "react-i18next";

import { Box } from "@mui/material";

// Screen-reader / keyboard / print fallback for Chart.js canvases.
// The <canvas> is an opaque image to assistive tech; this component emits
// the same values as semantic <table> markup so the numbers remain
// discoverable (WCAG 1.1.1, 1.3.1). Wrapped in <details> so sighted users
// get a compact UI but the table itself stays in the DOM even when
// collapsed — which is also why it shows in print/PDF exports.

const ChartDataTable = ({ caption, headers, rows, summaryLabel }) => {
  const { t } = useTranslation();
  const label = summaryLabel ?? t("chart_data_table_summary");

  if (
    !Array.isArray(rows) ||
    rows.length === 0 ||
    !Array.isArray(headers) ||
    headers.length === 0
  ) {
    return null;
  }

  return (
    <Box
      component="details"
      className="chart-data-table"
      sx={{
        mt: 1,
        "& > summary": {
          cursor: "pointer",
          py: 0.5,
          px: 1,
          fontSize: "0.875rem",
          color: "text.secondary",
        },
        "& table": {
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.875rem",
          mt: 1,
        },
        "& th, & td": {
          border: 1,
          borderColor: "divider",
          py: 0.5,
          px: 1,
          textAlign: "left",
        },
        "& th": {
          backgroundColor: "action.hover",
          fontWeight: 600,
        },
        "@media print": {
          "& > summary": { display: "none" },
          "&[open] > *, & > *": { display: "revert" },
          "& table": { display: "table" },
        },
      }}
    >
      <summary>{label}</summary>
      <table>
        {caption ? <caption style={{ textAlign: "left" }}>{caption}</caption> : null}
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
};

export default ChartDataTable;
