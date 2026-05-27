import React from "react";
import { Box, Table, TableBody, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { ExecutiveSummary } from "../utils/executiveSummary";
import { LabelRow } from "./ScenarioMetaTable";

export interface ExecutiveSummarySectionProps {
  summary: ExecutiveSummary | null;
  formatNumberLocale: (value: number) => string;
  renderTableCaption: (descriptionKey: string) => React.ReactNode;
}

export const ExecutiveSummarySection = ({
  summary,
  formatNumberLocale,
  renderTableCaption,
}: ExecutiveSummarySectionProps) => {
  const { t } = useTranslation();
  const formatWithUnit = (value: number, unit: string) =>
    unit ? `${formatNumberLocale(value)} ${unit}` : formatNumberLocale(value);

  return (
    <Box
      data-testid="print-executive-summary"
      sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
    >
      <Typography variant="h5" gutterBottom>
        {t("print_section_executive_summary")}
      </Typography>
      {summary ? (
        <>
          <Table size="small" data-testid="print-executive-summary-table">
            <TableBody>
              <LabelRow
                label={t("print_kpi_present_aal", { year: summary.presentYear })}
                value={formatWithUnit(summary.presentValue, summary.unit)}
              />
              <LabelRow
                label={t("print_kpi_future_aal", { year: summary.futureYear })}
                value={formatWithUnit(summary.futureValue, summary.unit)}
              />
              <LabelRow
                label={t("print_kpi_change_absolute")}
                value={formatWithUnit(summary.absoluteChange, summary.unit)}
              />
              <LabelRow
                label={t("print_kpi_change_percent")}
                value={
                  summary.percentChange != null
                    ? `${formatNumberLocale(summary.percentChange)}%`
                    : "—"
                }
              />
              {summary.topDriverLabel != null && summary.topDriverValue != null && (
                <LabelRow
                  label={t("print_kpi_top_driver")}
                  value={`${summary.topDriverLabel} (${formatWithUnit(
                    summary.topDriverValue,
                    summary.unit
                  )})`}
                />
              )}
            </TableBody>
          </Table>
          {renderTableCaption("print_caption_table_executive_summary")}
        </>
      ) : (
        <Typography variant="body2" color="text.secondary" data-testid="print-summary-unavailable">
          {t("print_summary_unavailable")}
        </Typography>
      )}
    </Box>
  );
};

export default ExecutiveSummarySection;
