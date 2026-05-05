import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Paper, Typography } from "@mui/material";

import RiskWiseClient from "../../lib/RiskWiseClient";
import CostBenefitChart from "../charts/CostBenefitChart";
import useStore from "../../store";

const STATUS_OK = 2000;

const AdaptationChartLayout = () => {
  const { t } = useTranslation();
  const setCostBenefitChartRef = useStore((state) => state.setCostBenefitChartRef);
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
    <div style={{ height: "80%", display: "flex", flexDirection: "column" }}>
      <Paper
        elevation={3}
        sx={{
          flex: 1,
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
          aria-label={t("economic_non_economic_adaptation_chart_title")}
        >
          {costBenefitData ? (
            <CostBenefitChart
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
