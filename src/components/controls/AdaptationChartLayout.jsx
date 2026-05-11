import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Paper, Typography } from "@mui/material";

import RiskWiseClient from "../../lib/RiskWiseClient";
import CostBenefitChart from "../charts/CostBenefitChart";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";

const STATUS_OK = 2000;

const AdaptationChartLayout = () => {
  const { t } = useTranslation();
  const setCostBenefitChartRef = useUIStore((state) => state.setCostBenefitChartRef);
  // Re-keying on `scenarioRunCode` re-mounts the chart on each new run (#370)
  // so the first-mount intro animation replays. The macro chart deliberately
  // does NOT get this key — dropdown changes should update silently.
  const scenarioRunCode = useWorkspaceStore((state) => state.scenarioRunCode);
  const [costBenefitData, setCostBenefitData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await RiskWiseClient.fetchCostBenefitData();
      if (cancelled) return;
      if (!response.success) {
        setErrorMessage(response.error.message);
        setCostBenefitData(null);
        return;
      }
      const { data, status } = response.result;
      if (status.code !== STATUS_OK) {
        setErrorMessage(status.message);
        setCostBenefitData(null);
        return;
      }
      setErrorMessage("");
      setCostBenefitData(data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
          {costBenefitData ? (
            <CostBenefitChart
              key={scenarioRunCode}
              ref={setCostBenefitChartRef}
              data={costBenefitData}
              errorMessage={errorMessage}
            />
          ) : (
            <Typography variant="body1">
              {errorMessage || t("economic_non_economic_adaptation_display_chart_loading_error")}
            </Typography>
          )}
        </Box>
      </Paper>
    </div>
  );
};

export default AdaptationChartLayout;
