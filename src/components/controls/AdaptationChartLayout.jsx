import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Box, Paper, Typography } from "@mui/material";

import RiskWiseClient from "../../lib/RiskWiseClient";
import CostBenefitChart from "../charts/CostBenefitChart";
import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";

const STATUS_OK = 2000;

const renderCostBenefitBody = ({
  costBenefitData,
  errorMessage,
  scenarioRunCode,
  setCostBenefitChartRef,
  t,
}) => {
  if (!costBenefitData) {
    return (
      <Typography variant="body1">
        {errorMessage || t("economic_non_economic_adaptation_display_chart_loading_error")}
      </Typography>
    );
  }
  if (Array.isArray(costBenefitData.measures) && costBenefitData.measures.length === 0) {
    return (
      <Typography
        data-testid="adaptation-empty-state-no-measures"
        variant="body1"
        sx={{ fontStyle: "italic" }}
      >
        {t("adaptation_empty_state_no_measures")}
      </Typography>
    );
  }
  return (
    <CostBenefitChart
      key={scenarioRunCode}
      ref={setCostBenefitChartRef}
      data={costBenefitData}
      errorMessage={errorMessage}
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
  const costBenefitData = useResultsStore((state) => state.costBenefitData);
  const errorMessage = useResultsStore((state) => state.costBenefitError);
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
          textAlign="center"
          p={3}
          style={{ width: "100%", height: "100%" }}
          aria-label={t("economic_non_economic_adaptation_chart_title")}
        >
          {renderCostBenefitBody({
            costBenefitData,
            errorMessage,
            scenarioRunCode,
            setCostBenefitChartRef,
            t,
          })}
        </Box>
      </Paper>
    </div>
  );
};

export default AdaptationChartLayout;
