import React from "react";
import { useTranslation } from "react-i18next";
import { Button, LinearProgress, Stack, Typography } from "@mui/material";

import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import { SCENARIO_PHASES, buildRunSummary, isNumericProgress } from "../../store/scenarioPhases";
import HomeCard from "./HomeCard";

const PHASE_CONFIG = {
  [SCENARIO_PHASES.RUNNING]: {
    titleKey: "home_active_run_title_running",
    showProgressBar: true,
    showViewResults: false,
  },
  [SCENARIO_PHASES.CANCELLING]: {
    titleKey: "home_active_run_title_cancelling",
    showProgressBar: true,
    showViewResults: false,
  },
  [SCENARIO_PHASES.COMPLETED]: {
    titleKey: "home_active_run_title_completed",
    showProgressBar: false,
    showViewResults: true,
  },
  [SCENARIO_PHASES.FAILED]: {
    titleKey: "home_active_run_title_failed",
    showProgressBar: false,
    showViewResults: false,
  },
};

const ActiveRunCard = () => {
  const { t } = useTranslation();
  const scenarioPhase = useResultsStore((s) => s.scenarioPhase);
  const activeRunSummary = useResultsStore((s) => s.activeRunSummary);
  const resetScenarioPhase = useResultsStore((s) => s.resetScenarioPhase);
  const modalMessage = useUIStore((s) => s.modalMessage);
  const progress = useUIStore((s) => s.progress);
  const setActiveSection = useUIStore((s) => s.setActiveSection);
  const setSelectedTab = useUIStore((s) => s.setSelectedTab);

  if (scenarioPhase === null) return null;

  const config = PHASE_CONFIG[scenarioPhase];
  if (!config) return null;

  const summaryLine = buildRunSummary(t, "home_active_run_summary", activeRunSummary);
  const hasNumericProgress = isNumericProgress(scenarioPhase, progress);

  const handleViewResults = () => {
    setActiveSection("workspace");
    if (activeRunSummary?.landingTab) {
      setSelectedTab(activeRunSummary.landingTab);
    }
    resetScenarioPhase();
  };

  return (
    <HomeCard data-testid="home-active-run-card" title={t(config.titleKey)}>
      <Stack spacing={1}>
        {summaryLine && (
          <Typography variant="body2" color="text.secondary">
            {summaryLine}
          </Typography>
        )}
        {config.showProgressBar && (
          <>
            <Typography
              variant="body2"
              color="text.secondary"
              aria-live="polite"
              data-testid="home-active-run-step-label"
            >
              {modalMessage || "Starting…"}
            </Typography>
            <LinearProgress
              variant={hasNumericProgress ? "determinate" : "indeterminate"}
              value={hasNumericProgress ? progress : undefined}
              sx={{ height: 6, borderRadius: 4 }}
            />
          </>
        )}
        {config.showViewResults && (
          <Button
            size="small"
            variant="text"
            onClick={handleViewResults}
            data-testid="home-active-run-view-results"
            sx={{ alignSelf: "flex-end" }}
          >
            {t("home_active_run_view_results")}
          </Button>
        )}
      </Stack>
    </HomeCard>
  );
};

export default ActiveRunCard;
