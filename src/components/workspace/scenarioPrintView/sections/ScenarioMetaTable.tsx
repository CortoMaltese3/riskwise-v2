import React, { useMemo } from "react";
import { Box, Table, TableBody, TableCell, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { ScenarioWorkspaceItem } from "../../../../lib/RiskWiseClient";
import { formatDate, shortSha } from "../utils/formatting";

export const LabelRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <TableRow>
    <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd", width: 200, py: 0.75 }}>
      {label}
    </TableCell>
    <TableCell sx={{ border: "1px solid #ddd", py: 0.75 }}>{value ?? "—"}</TableCell>
  </TableRow>
);

export interface ScenarioMetaTableProps {
  meta: ScenarioWorkspaceItem;
  locale: string;
  renderTableCaption: (descriptionKey: string) => React.ReactNode;
}

export const ScenarioMetaTable = ({ meta, locale, renderTableCaption }: ScenarioMetaTableProps) => {
  const { t } = useTranslation();

  const provenanceRows = useMemo<Array<[string, string]>>(() => {
    const computedAt = meta.computed_at ?? meta.created_at;
    return (
      [
        ["App Version", meta.app_version],
        ["Engine Version", meta.engine_version],
        ["Computed At", computedAt ? formatDate(computedAt, locale) : undefined],
        ["Entity Data SHA-256 (8-char prefix)", shortSha(meta.entity_data_sha256)],
        ["Hazard Data SHA-256 (8-char prefix)", shortSha(meta.hazard_data_sha256)],
        ["Country Config SHA-256 (8-char prefix)", shortSha(meta.country_config_sha256)],
        ["Random Seed", meta.random_seed != null ? String(meta.random_seed) : undefined],
      ] as Array<[string, string | undefined]>
    ).filter((row): row is [string, string] => Boolean(row[1]));
  }, [meta, locale]);

  return (
    <Box
      data-testid="print-methodology"
      sx={{ "@media print": { pageBreakInside: "avoid", pageBreakBefore: "always" } }}
    >
      <Typography variant="h5" gutterBottom>
        {t("print_section_methodology")}
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }} data-testid="print-methodology-body">
        {t("print_methodology_body")}
      </Typography>

      <Table size="small" sx={{ mb: 1 }} data-testid="print-provenance-table">
        <TableBody>
          {provenanceRows.map(([label, value]) => (
            <TableRow key={label}>
              <TableCell
                sx={{ fontWeight: "bold", border: "1px solid #ddd", width: 260, py: 0.75 }}
              >
                {label}
              </TableCell>
              <TableCell
                sx={{
                  border: "1px solid #ddd",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  wordBreak: "break-all",
                  py: 0.75,
                }}
              >
                {value}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {renderTableCaption("print_caption_table_provenance")}
      <Typography
        variant="body2"
        sx={{ fontStyle: "italic", mb: 2 }}
        data-testid="reproducibility-note"
      >
        {t("print_reproducibility_note")}
      </Typography>
    </Box>
  );
};

export default ScenarioMetaTable;
