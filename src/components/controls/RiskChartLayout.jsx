import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Paper, Typography } from "@mui/material";

import RiskWiseClient from "../../lib/RiskWiseClient";
import WaterfallChart from "../charts/WaterfallChart";
import useStore from "../../store";

const STATUS_OK = 2000;

const RiskChartLayout = () => {
  const { t } = useTranslation();
  const setWaterfallChartRef = useStore((state) => state.setWaterfallChartRef);
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
          justifyContent: "center",
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        <Box
          textAlign="center"
          p={3}
          style={{ width: "100%", height: "100%" }}
          aria-label={t("economic_non_economic_risk_display_chart_title")}
        >
          {waterfallData ? (
            <WaterfallChart
              ref={setWaterfallChartRef}
              data={waterfallData}
              errorMessage={errorMessage}
            />
          ) : (
            <Typography variant="body1">
              {errorMessage || t("economic_non_economic_risk_display_chart_loading_error")}
            </Typography>
          )}
        </Box>
      </Paper>
    </div>
  );
};

export default RiskChartLayout;
