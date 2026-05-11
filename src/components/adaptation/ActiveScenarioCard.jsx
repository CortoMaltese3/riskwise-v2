import React from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, Stack, Typography } from "@mui/material";

import useResultsStore from "../../store/useResultsStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { exposureCategoryMap } from "../../data/exposureCatalog";
import { formatNumber } from "../../lib/formatNumber";
import { SummaryRow as Row } from "./SummaryRow";

const EM_DASH = "—";

const resolveExposureLabel = (selectedExposure, selectedExposureCategory, t) => {
  if (!selectedExposure) return EM_DASH;
  const category = exposureCategoryMap[selectedExposure] ?? selectedExposureCategory ?? null;
  if (!category) return selectedExposure;
  return t(`input_exposure_${category}_${selectedExposure}`);
};

const resolveScenarioLabel = (selectedScenario, t) => {
  if (!selectedScenario) return EM_DASH;
  if (selectedScenario === "historical") return t("scenario_historical_label");
  return t(`input_scenario_scenarios_${selectedScenario}`);
};

const resolveTimeHorizonLabel = (selectedTimeHorizon) => {
  if (!Array.isArray(selectedTimeHorizon) || selectedTimeHorizon.length !== 2) return EM_DASH;
  const [present, future] = selectedTimeHorizon;
  if (present == null || future == null) return EM_DASH;
  return `${present} – ${future}`;
};

const resolveGrowthLabel = (selectedAnnualGrowth, locale) => {
  if (selectedAnnualGrowth == null) return EM_DASH;
  const formatted = formatNumber(selectedAnnualGrowth, locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted}%`;
};

const ActiveScenarioCard = () => {
  const { t, i18n } = useTranslation();
  const isScenarioRunCompleted = useResultsStore((s) => s.isScenarioRunCompleted);
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
  const selectedScenario = useWorkspaceStore((s) => s.selectedScenario);
  const selectedTimeHorizon = useWorkspaceStore((s) => s.selectedTimeHorizon);
  const selectedExposure = useWorkspaceStore((s) => s.selectedExposure);
  const selectedExposureCategory = useWorkspaceStore((s) => s.selectedExposureCategory);
  const selectedAnnualGrowth = useWorkspaceStore((s) => s.selectedAnnualGrowth);

  if (!isScenarioRunCompleted) return null;

  const countryLabel = selectedCountry ? t(`input_country_${selectedCountry}`) : EM_DASH;
  const hazardLabel = selectedHazard ? t(`input_hazard_${selectedHazard}`) : EM_DASH;
  const scenarioLabel = resolveScenarioLabel(selectedScenario, t);
  const timeHorizonLabel = resolveTimeHorizonLabel(selectedTimeHorizon);
  const exposureLabel = resolveExposureLabel(selectedExposure, selectedExposureCategory, t);
  const growthLabel = resolveGrowthLabel(selectedAnnualGrowth, i18n.language);

  return (
    <Card variant="outlined" sx={{ mt: 2, pb: 1 }} data-testid="active-scenario-card">
      <CardContent>
        <Typography variant="h6" component="div" sx={{ mb: 1 }}>
          {t("adaptation_active_scenario_title")}
        </Typography>
        <Stack spacing={0.5}>
          <Row label={t("adaptation_active_scenario_country")} value={countryLabel} />
          <Row label={t("adaptation_active_scenario_hazard")} value={hazardLabel} />
          <Row label={t("adaptation_active_scenario_scenario")} value={scenarioLabel} />
          <Row label={t("adaptation_active_scenario_time_horizon")} value={timeHorizonLabel} />
          <Row label={t("adaptation_active_scenario_exposure")} value={exposureLabel} />
          <Row label={t("adaptation_active_scenario_annual_growth")} value={growthLabel} />
        </Stack>
      </CardContent>
    </Card>
  );
};

export default ActiveScenarioCard;
