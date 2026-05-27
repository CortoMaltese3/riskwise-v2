import React from "react";
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { CostBenefitPayload, WaterfallPayload } from "../../../../lib/RiskWiseClient";
import type { SnapshotFigure } from "../hooks/useSnapshotFigures";
import type { SurfaceCounts, SurfaceKey } from "../utils/surfaceGrouping";

import WaterfallChart from "../../../charts/WaterfallChart";
import CostBenefitChart from "../../../charts/CostBenefitChart";

// Maps backend snapshot_type values to i18n keys for the fallback heading
// used when a snapshot has no user-provided title.
const SNAPSHOT_TYPE_LABEL_KEYS: Record<string, string> = {
  map: "snapshot_type_map",
  waterfall: "snapshot_type_waterfall",
  cost_benefit: "snapshot_type_cost_benefit",
};

export interface FiguresGridProps {
  figuresBySurface: Record<SurfaceKey, SnapshotFigure[]>;
  availableSurfaceCounts: SurfaceCounts;
  waterfallData: WaterfallPayload | null;
  costbenData: CostBenefitPayload | null;
  showWaterfall: boolean;
  showCostBenefit: boolean;
  hasCostbenMeasures: boolean;
  hasOtherVisuals: boolean;
  formatNumberLocale: (value: number) => string;
  renderFigureCaption: (descriptionKey: string) => React.ReactNode;
  renderTableCaption: (descriptionKey: string) => React.ReactNode;
  nextFigureNumber: () => number;
  onImageSettled: () => void;
}

export const FiguresGrid = ({
  figuresBySurface,
  availableSurfaceCounts,
  waterfallData,
  costbenData,
  showWaterfall,
  showCostBenefit,
  hasCostbenMeasures,
  hasOtherVisuals,
  formatNumberLocale,
  renderFigureCaption,
  renderTableCaption,
  nextFigureNumber,
  onImageSettled,
}: FiguresGridProps) => {
  const { t } = useTranslation();

  const renderSnapshotFigure = (fig: SnapshotFigure) => {
    const figureLabel = t("figure_label", { number: nextFigureNumber() });
    const typeKey = SNAPSHOT_TYPE_LABEL_KEYS[fig.snapshotType];
    const typeLabel = typeKey ? t(typeKey) : fig.snapshotType.replace(/_/g, " ");
    const headingText = fig.title
      ? `${figureLabel} — ${fig.title}`
      : `${figureLabel} — ${typeLabel}`;
    return (
      <Box
        key={fig.id}
        data-testid={`snapshot-figure-${fig.id}`}
        sx={{ mb: 3, "@media print": { pageBreakInside: "avoid" } }}
      >
        <Typography variant="subtitle1" gutterBottom>
          {headingText}
        </Typography>
        <Box
          component="img"
          src={fig.imageUrl}
          alt={fig.title ?? typeLabel}
          onLoad={onImageSettled}
          onError={onImageSettled}
          sx={{
            display: "block",
            maxWidth: "100%",
            maxHeight: "80vh",
            "@media print": { pageBreakInside: "avoid" },
          }}
        />
        {fig.caption && (
          <Typography variant="caption" sx={{ display: "block", fontStyle: "italic", mt: 0.5 }}>
            {fig.caption}
          </Typography>
        )}
      </Box>
    );
  };

  // Section slot contents: per-surface snapshots, or — when the scenario has
  // map snapshots in this surface that the user did not pick — a single
  // italic line telling the reader they exist in the application.
  const renderSlotContents = (surface: SurfaceKey, sectionLabel: string) => {
    const surfaceFigures = figuresBySurface[surface];
    if (surfaceFigures.length > 0) {
      return surfaceFigures.map((fig) => renderSnapshotFigure(fig));
    }
    if (availableSurfaceCounts[surface] > 0) {
      return (
        <Typography
          variant="body2"
          data-testid={`snapshots-available-note-${surface}`}
          sx={{ fontStyle: "italic", mt: 1 }}
        >
          {t("print_section_snapshots_available_note", { section: sectionLabel })}
        </Typography>
      );
    }
    return null;
  };

  return (
    <>
      {/* Section 5 — Hazard */}
      <Box
        data-testid="print-section-hazard"
        sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
      >
        <Typography variant="h5" gutterBottom>
          {t("print_section_hazard")}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {t("print_section_hazard_description")}
        </Typography>
        <Box data-testid="snapshots-slot-hazard">
          {renderSlotContents("hazard", t("print_section_hazard"))}
        </Box>
      </Box>

      {/* Section 6 — Exposure */}
      <Box
        data-testid="print-section-exposure"
        sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
      >
        <Typography variant="h5" gutterBottom>
          {t("print_section_exposure")}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {t("print_section_exposure_description")}
        </Typography>
        <Box data-testid="snapshots-slot-exposure">
          {renderSlotContents("exposure", t("print_section_exposure"))}
        </Box>
      </Box>

      {/* Section 7 — Impact */}
      <Box
        data-testid="print-section-impact"
        sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
      >
        <Typography variant="h5" gutterBottom>
          {t("print_section_impact")}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {t("print_section_impact_description")}
        </Typography>
        {waterfallData ? (
          <>
            {showWaterfall && (
              <>
                <Box sx={{ height: 380, mb: 1 }}>
                  <WaterfallChart data={waterfallData} animate={false} />
                </Box>
                {renderFigureCaption("print_caption_figure_waterfall")}
              </>
            )}

            <Table size="small" data-testid="print-risk-table" sx={{ mt: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd" }}>
                    {t("print_table_col_category")}
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd" }}>
                    {t("print_table_col_value")}
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd" }}>
                    {t("print_table_col_unit")}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {waterfallData.categories.map((cat) => {
                  const totalYearByKey: Record<string, number> = {
                    risk_present: waterfallData.present_year,
                    risk_future: waterfallData.future_year,
                  };
                  const totalYear = totalYearByKey[cat.key] ?? null;
                  const label =
                    totalYear != null ? t("print_table_total", { year: totalYear }) : cat.label;
                  return (
                    <TableRow key={cat.key}>
                      <TableCell sx={{ border: "1px solid #ddd", py: 0.5 }}>{label}</TableCell>
                      <TableCell sx={{ border: "1px solid #ddd", py: 0.5 }}>
                        {formatNumberLocale(cat.value)}
                      </TableCell>
                      <TableCell sx={{ border: "1px solid #ddd", py: 0.5 }}>
                        {waterfallData.measurement_unit}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {renderTableCaption("print_caption_table_risk_decomposition")}
          </>
        ) : (
          <Typography variant="body2" color="text.secondary" data-testid="print-impact-missing">
            {t("print_section_no_results")}
          </Typography>
        )}
        <Box data-testid="snapshots-slot-impact">
          {renderSlotContents("impact", t("print_section_impact"))}
        </Box>
      </Box>

      {/* Section 8 — Cost-Benefit / Adaptation */}
      <Box
        data-testid="print-section-cost-benefit"
        sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
      >
        <Typography variant="h5" gutterBottom>
          {t("print_section_cost_benefit_adaptation")}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {t("print_section_cost_benefit_description")}
        </Typography>
        {showCostBenefit && costbenData && (
          <>
            <Box sx={{ height: 380, mb: 1 }}>
              <CostBenefitChart data={costbenData} animate={false} />
            </Box>
            {renderFigureCaption("print_caption_figure_cost_benefit")}

            <Table size="small" data-testid="print-costben-table" sx={{ mt: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd" }}>
                    {t("print_table_col_measure")}
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd" }}>
                    {`${t("print_table_col_cost")} (${costbenData.currency_unit})`}
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd" }}>
                    {`${t("print_table_col_benefit")} (${costbenData.currency_unit})`}
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold", border: "1px solid #ddd" }}>
                    {t("print_table_col_bcr")}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...(costbenData.measures ?? [])]
                  .sort((a, b) => b.benefit_cost_ratio - a.benefit_cost_ratio)
                  .map((m) => (
                    <TableRow key={m.name}>
                      <TableCell sx={{ border: "1px solid #ddd", py: 0.5 }}>{m.name}</TableCell>
                      <TableCell sx={{ border: "1px solid #ddd", py: 0.5 }}>
                        {formatNumberLocale(m.cost)}
                      </TableCell>
                      <TableCell sx={{ border: "1px solid #ddd", py: 0.5 }}>
                        {formatNumberLocale(m.benefit)}
                      </TableCell>
                      <TableCell sx={{ border: "1px solid #ddd", py: 0.5 }}>
                        {formatNumberLocale(m.benefit_cost_ratio)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            {renderTableCaption("print_caption_table_cost_benefit_summary")}
          </>
        )}
        {!hasCostbenMeasures && (
          <Typography variant="body2" color="text.secondary" data-testid="print-costben-missing">
            {t("print_section_no_results")}
          </Typography>
        )}
        <Box data-testid="snapshots-slot-cost-benefit">
          {renderSlotContents("adaptation", t("print_section_cost_benefit_adaptation"))}
        </Box>
      </Box>

      {/* Other Visuals — rendered only when at least one selected snapshot
          had no surface tag. Sits between Cost-Benefit and Methodology so
          the per-domain ordering above stays intact. */}
      {hasOtherVisuals && (
        <Box
          data-testid="print-section-other-visuals"
          sx={{ mb: 4, "@media print": { pageBreakInside: "avoid" } }}
        >
          <Typography variant="h5" gutterBottom>
            {t("print_section_other_visuals")}
          </Typography>
          <Box data-testid="snapshots-slot-other">
            {figuresBySurface.other.map((fig) => renderSnapshotFigure(fig))}
          </Box>
        </Box>
      )}
    </>
  );
};

export default FiguresGrid;
