import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Typography } from "@mui/material";

import useUIStore from "../../store/useUIStore";

const MacroEconomicResultsCard = () => {
  const { t } = useTranslation();
  const activeViewControl = useUIStore((s) => s.activeViewControl);

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {/* Result Details section */}
      <Box
        sx={{
          bgcolor: "secondary.light",
          padding: 2,
          borderRadius: (theme) => theme.spacing(0.5),
        }}
      >
        <Typography
          variant="h6"
          sx={{
            borderBottom: 1,
            borderBottomColor: "text.secondary",
            paddingBottom: 1,
            color: "text.secondary",
            textAlign: "center",
          }}
        >
          {t("macroeceonomic_results_information_title")}
        </Typography>

        <Typography variant="body1" sx={{ marginTop: 2, flexGrow: 1, color: "text.secondary" }}>
          {activeViewControl === "display_macro_chart"
            ? t("macroeceonomic_results_information_text")
                .split("/n")
                .map((line, index) => <p key={index}>{line}</p>)
            : ""}
        </Typography>
      </Box>
    </Box>
  );
};

export default MacroEconomicResultsCard;
