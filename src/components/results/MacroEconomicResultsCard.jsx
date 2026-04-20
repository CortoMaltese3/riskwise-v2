import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Typography } from "@mui/material";

import useStore from "../../store";

const MacroEconomicResultsCard = () => {
  const { t } = useTranslation();
  const { activeViewControl } = useStore();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "85vh" }}>
      {/* Result Details section */}
      <Box
        sx={{
          bgcolor: "accent.light",
          padding: 2,
          borderRadius: "4px",
        }}
      >
        <Typography
          variant="h6"
          sx={{
            borderBottom: "1px solid var(--mui-palette-surface-mutedText)",
            paddingBottom: 1,
            color: "surface.mutedText",
            textAlign: "center",
          }}
        >
          {t("macroeceonomic_results_information_title")}
        </Typography>

        <Typography variant="body1" sx={{ marginTop: 2, flexGrow: 1, color: "surface.mutedText" }}>
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
