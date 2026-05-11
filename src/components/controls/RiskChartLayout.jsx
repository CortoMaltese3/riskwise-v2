import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Paper } from "@mui/material";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";

import RiskWiseClient from "../../lib/RiskWiseClient";
import WaterfallChart from "../charts/WaterfallChart";
import EmptyChartState from "../layout/EmptyChartState";
import LoadingSkeleton from "../layout/LoadingSkeleton";
import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";

const STATUS_OK = 2000;

const RiskChartLayout = () => {
  const { t } = useTranslation();
  const setWaterfallChartRef = useUIStore((state) => state.setWaterfallChartRef);
  const isScenarioRunning = useResultsStore((state) => state.isScenarioRunning);
  const isScenarioRunCompleted = useResultsStore((state) => state.isScenarioRunCompleted);
  // Re-keying on `scenarioRunCode` re-mounts the chart on each new run (#370),
  // triggering a fresh first-mount animation. Without the key, the existing
  // instance would just swap datasets and skip the intro.
  const scenarioRunCode = useWorkspaceStore((state) => state.scenarioRunCode);
  const [waterfallData, setWaterfallData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await RiskWiseClient.fetchWaterfallData();
      if (cancelled) return;
      if (!response.success) {
        setErrorMessage(response.error.message);
        setWaterfallData(null);
        return;
      }
      const { data, status } = response.result;
      if (status.code !== STATUS_OK) {
        setErrorMessage(status.message);
        setWaterfallData(null);
        return;
      }
      setErrorMessage("");
      setWaterfallData(data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderContent = () => {
    if (isScenarioRunning) {
      return <LoadingSkeleton variant="chart" data-testid="waterfall-skeleton" />;
    }
    if (!isScenarioRunCompleted || !waterfallData) {
      return (
        <EmptyChartState
          data-testid="waterfall-empty-state"
          icon={BarChartOutlinedIcon}
          message={t("waterfall_empty_state_message")}
          hint={t("waterfall_empty_state_hint")}
        />
      );
    }
    return (
      <WaterfallChart
        key={scenarioRunCode}
        ref={setWaterfallChartRef}
        data={waterfallData}
        errorMessage={errorMessage}
      />
    );
  };

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
          aria-label={t("economic_non_economic_risk_display_chart_title")}
        >
          {renderContent()}
        </Box>
      </Paper>
    </div>
  );
};

export default RiskChartLayout;
