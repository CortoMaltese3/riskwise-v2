import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Button, Collapse, Stack, Typography } from "@mui/material";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import { formatNumber, formatNumberWithUnit } from "../../lib/formatNumber";
import { SummaryRow, SummaryRowSkeleton } from "./SummaryRow";

const EM_DASH = "—";
// At/above this magnitude we render values with compact notation
// (e.g. "137.75M USD") so the summary card never wraps the unit onto its
// own line (#412 B3).
const COMPACT_NOTATION_THRESHOLD = 1_000_000;

// `benefit_cost_ratio` can be `Infinity` when the engine sees a zero-cost
// measure (engine `cost_benefit.py` returns `float("inf")`). Filter to finite
// ratios before picking the max so the summary never surfaces "Infinity";
// fall back to the largest benefit when every measure is zero-cost.
const pickBestMeasure = (measures) => {
  const finite = measures.filter((m) => Number.isFinite(m.benefit_cost_ratio));
  if (finite.length > 0) {
    return finite.reduce((best, m) => (m.benefit_cost_ratio > best.benefit_cost_ratio ? m : best));
  }
  if (measures.length === 0) return null;
  return measures.reduce((best, m) => (m.benefit > best.benefit ? m : best));
};

const formatBestRatio = (best, locale) => {
  if (!best) return EM_DASH;
  if (!Number.isFinite(best.benefit_cost_ratio)) return best.name;
  const ratio = formatNumber(best.benefit_cost_ratio, locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  return `${best.name}: ${ratio}`;
};

const formatTotalWithUnit = (value, unit, locale) => {
  const options =
    Math.abs(value) >= COMPACT_NOTATION_THRESHOLD
      ? { notation: "compact", compactDisplay: "short", maximumFractionDigits: 2 }
      : {};
  return formatNumberWithUnit(value, unit, locale, options);
};

const emptyStats = () => ({
  profitableCount: EM_DASH,
  marginalCount: EM_DASH,
  lossCount: EM_DASH,
  bestRatio: EM_DASH,
  totalCost: EM_DASH,
  totalBenefit: EM_DASH,
});

const computeStats = (data, locale) => {
  if (!data || !Array.isArray(data.measures) || data.measures.length === 0) {
    return emptyStats();
  }
  const { measures, currency_unit: unit = "" } = data;
  const profitableCount = measures.filter((m) => m.benefit_cost_ratio >= 1).length;
  const marginalCount = measures.filter(
    (m) => m.benefit_cost_ratio > 0 && m.benefit_cost_ratio < 1
  ).length;
  const lossCount = measures.filter((m) => m.benefit_cost_ratio <= 0).length;
  const totalCost = measures.reduce((sum, m) => sum + m.cost, 0);
  const totalBenefit = measures.reduce((sum, m) => sum + m.benefit, 0);
  return {
    profitableCount: String(profitableCount),
    marginalCount: String(marginalCount),
    lossCount: String(lossCount),
    bestRatio: formatBestRatio(pickBestMeasure(measures), locale),
    totalCost: formatTotalWithUnit(totalCost, unit, locale),
    totalBenefit: formatTotalWithUnit(totalBenefit, unit, locale),
  };
};

const cardSx = {
  bgcolor: "secondary.light",
  padding: 2,
  borderRadius: (theme) => theme.spacing(0.5),
};

const cardTitleSx = {
  borderBottom: 1,
  borderBottomColor: "text.secondary",
  paddingBottom: 1,
  color: "text.secondary",
  textAlign: "center",
};

const PanelCard = ({ title, children, ...boxProps }) => (
  <Box sx={cardSx} {...boxProps}>
    <Typography variant="h6" sx={cardTitleSx}>
      {title}
    </Typography>
    {children}
  </Box>
);

const AdaptationDisplayPanel = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const costBenefitData = useResultsStore((s) => s.costBenefitData);
  const isLoading = useResultsStore((s) => s.isCostBenefitLoading);
  const resultDetailsOpen = useUIStore((s) => s.resultDetailsOpen);
  const toggleResultDetails = useUIStore((s) => s.toggleResultDetails);

  const stats = computeStats(costBenefitData, locale);

  const rows = [
    { key: "profitable", label: t("adaptation_summary_profitable"), value: stats.profitableCount },
    { key: "marginal", label: t("adaptation_summary_marginal"), value: stats.marginalCount },
    { key: "loss", label: t("adaptation_summary_loss"), value: stats.lossCount },
    { key: "best_ratio", label: t("adaptation_summary_best_ratio"), value: stats.bestRatio },
    { key: "total_cost", label: t("adaptation_summary_total_cost"), value: stats.totalCost },
    {
      key: "total_benefit",
      label: t("adaptation_summary_total_benefit"),
      value: stats.totalBenefit,
    },
  ];

  return (
    <Box
      data-testid="adaptation-display-panel"
      sx={{ display: "flex", flexDirection: "column", gap: 2 }}
    >
      <PanelCard title={t("adaptation_summary_title")} data-testid="adaptation-summary-card">
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          {isLoading
            ? rows.map((r) => (
                <SummaryRowSkeleton
                  key={r.key}
                  label={r.label}
                  data-testid="adaptation-summary-skeleton"
                />
              ))
            : rows.map((r) => (
                <SummaryRow key={r.key} label={r.label} value={r.value} align="right" />
              ))}
        </Stack>
      </PanelCard>

      <PanelCard title={t("adaptation_result_details_title")}>
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
          <Button
            size="small"
            variant="text"
            onClick={toggleResultDetails}
            aria-expanded={resultDetailsOpen}
            aria-controls="adaptation-result-details-body"
            data-testid="adaptation-result-details-toggle"
            endIcon={resultDetailsOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          >
            {resultDetailsOpen ? t("result_details_hide") : t("result_details_show")}
          </Button>
        </Box>
        <Collapse in={resultDetailsOpen} unmountOnExit>
          <Typography
            id="adaptation-result-details-body"
            data-testid="adaptation-result-details-body"
            variant="body2"
            sx={{ marginTop: 1, color: "text.secondary" }}
          >
            {t("adaptation_result_details_body")}
          </Typography>
        </Collapse>
      </PanelCard>
    </Box>
  );
};

export default AdaptationDisplayPanel;
