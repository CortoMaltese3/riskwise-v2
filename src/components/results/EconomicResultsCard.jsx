import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Button, Typography } from "@mui/material";

import ResultsTypography from "./ResultsTypography";
import useUIStore from "../../store/useUIStore";
import { layoutTransition } from "../../theme/theme";

const EconomicResultsCard = () => {
  const activeMap = useUIStore((s) => s.activeMap);
  const activeViewControl = useUIStore((s) => s.activeViewControl);
  const setActiveMap = useUIStore((s) => s.setActiveMap);
  const { t } = useTranslation();

  const handleButtonClick = (type) => {
    setActiveMap(type);
  };

  const isButtonSelected = (type) => activeMap === type;

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {/* Button Section with flex column direction */}

      {activeViewControl === "display_map" && (
        <Box sx={{ display: "flex", flexDirection: "column", marginBottom: 2 }}>
          {["hazard", "exposure", "impact"].map((type) => (
            <Button
              key={type}
              variant="contained"
              sx={{
                marginBottom: 2,
                bgcolor: isButtonSelected(type) ? "secondary.main" : "secondary.light",
                transition: layoutTransition(["transform"]),
                "&:active": {
                  transform: "scale(0.96)",
                },
                "&:hover": { bgcolor: "secondary.main" },
              }}
              onClick={() => handleButtonClick(type)}
            >
              {t(`results_eco_button_${type}`)}
            </Button>
          ))}
        </Box>
      )}

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
          {t("results_eco_details")}
        </Typography>

        <ResultsTypography />
      </Box>
    </Box>
  );
};

export default EconomicResultsCard;
