import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Box, Paper } from "@mui/material";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";

import RiskWiseClient from "../../lib/RiskWiseClient";
import CostBenefitChart from "../charts/CostBenefitChart";
import EmptyChartState from "../layout/EmptyChartState";
import LoadingSkeleton from "../layout/LoadingSkeleton";
import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";

const STATUS_OK = 2000;

const renderCostBenefitBody = ({
  isLoading,
  costBenefitData,
  errorMessage,
  scenarioRunCode,
  setCostBenefitChartRef,
  appliedCount,
  selectedCount,
  t,
}) => {
  if (isLoading) {
    return <LoadingSkeleton variant="chart" data-testid="cost-benefit-skeleton" />;
  }
  if (!costBenefitData) {
    return (
      <EmptyChartState
        data-testid="adaptation-empty-state-no-data"
        icon={BarChartOutlinedIcon}
        message={errorMessage || t("economic_non_economic_adaptation_display_chart_loading_error")}
      />
    );
  }
  if (Array.isArray(costBenefitData.measures) && costBenefitData.measures.length === 0) {
    return (
      <EmptyChartState
        data-testid="adaptation-empty-state-no-measures"
        icon={BarChartOutlinedIcon}
        message={t("adaptation_empty_state_no_measures")}
      />
    );
  }
  return (
    <CostBenefitChart
      key={scenarioRunCode}
      ref={setCostBenefitChartRef}
      data={costBenefitData}
      errorMessage={errorMessage}
      appliedCount={appliedCount}
      selectedCount={selectedCount}
    />
  );
};

const AdaptationChartLayout = () => {
  const { t } = useTranslation();
  const setCostBenefitChartRef = useUIStore((state) => state.setCostBenefitChartRef);
  // Re-keying on `scenarioRunCode` re-mounts the chart on each new run so the
  // first-mount intro animation replays. The macro chart deliberately does
  // NOT get this key — dropdown changes should update silently.
  const scenarioRunCode = useWorkspaceStore((state) => state.scenarioRunCode);
  const selectedMeasureIds = useWorkspaceStore((state) => state.selectedMeasureIds);
  const lastRunSkippedMeasures = useWorkspaceStore((state) => state.lastRunSkippedMeasures);
  const costBenefitData = useResultsStore((state) => state.costBenefitData);
  const errorMessage = useResultsStore((state) => state.costBenefitError);
  const isLoading = useResultsStore((state) => state.isCostBenefitLoading);
  const beginCostBenefitFetch = useResultsStore((state) => state.beginCostBenefitFetch);
  const endCostBenefitFetch = useResultsStore((state) => state.endCostBenefitFetch);

  useEffect(() => {
    let cancelled = false;
    beginCostBenefitFetch();
    (async () => {
      const response = await RiskWiseClient.fetchCostBenefitData();
      if (cancelled) return;
      if (!response.success) {
        endCostBenefitFetch({ error: response.error.message });
        return;
      }
      const { data, status } = response.result;
      if (status.code !== STATUS_OK) {
        endCostBenefitFetch({ error: status.message });
        return;
      }
      endCostBenefitFetch({ data });
    })();
    return () => {
      cancelled = true;
    };
  }, [beginCostBenefitFetch, endCostBenefitFetch]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Paper
        elevation={3}
        sx={{
          flex: 1,
          minHeight: 0,
          borderRadius: (theme) => theme.spacing(2),
          marginBottom: 2,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            width: "100%",
            p: 3,
            display: "flex",
            flexDirection: "column",
          }}
          aria-label={t("economic_non_economic_adaptation_chart_title")}
        >
          {(() => {
            // Applied = selected minus the names the backend silently
            // filtered out. The chart subtitle reads both to render
            // "Cost-benefit for {applied}/{selected} measures" when
            // applied < selected (issue #450).
            const selectedCount = selectedMeasureIds.length;
            const skippedCount = lastRunSkippedMeasures.length;
            const appliedCount = Math.max(0, selectedCount - skippedCount);
            return renderCostBenefitBody({
              isLoading,
              costBenefitData,
              errorMessage,
              scenarioRunCode,
              setCostBenefitChartRef,
              appliedCount,
              selectedCount,
              t,
            });
          })()}
        </Box>
      </Paper>
    </div>
  );
};

export default AdaptationChartLayout;
