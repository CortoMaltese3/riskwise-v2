import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Button, Chip, Stack, Typography } from "@mui/material";

import ImpactFunctionDialog from "../dialogs/ImpactFunctionDialog";
import ResultsTypography from "./ResultsTypography";
import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import { layoutTransition } from "../../theme/theme";

const EconomicResultsCard = () => {
  const activeMap = useUIStore((s) => s.activeMap);
  const activeViewControl = useUIStore((s) => s.activeViewControl);
  const setActiveMap = useUIStore((s) => s.setActiveMap);
  const activeRunSummary = useResultsStore((s) => s.activeRunSummary);
  const { t } = useTranslation();
  const [impactFunctionDialogOpen, setImpactFunctionDialogOpen] = useState(false);
  // The override the dispatched run carried, if any. The dialog uses
  // ``pendingOverride`` to render the actual modified curve the engine
  // saw — the canonical ``runImpactFunction`` is the comparison baseline
  // (#453).
  const runOverride = activeRunSummary?.impactFunctionOverride ?? null;
  const runImpactFunction = activeRunSummary?.impactFunction ?? null;
  const isModified = runOverride != null;

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
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="center"
          spacing={1}
          sx={{
            borderBottom: 1,
            borderBottomColor: "text.secondary",
            paddingBottom: 1,
            color: "text.secondary",
          }}
        >
          <Typography variant="h6" sx={{ color: "text.secondary" }}>
            {t("results_eco_details")}
          </Typography>
          {isModified && (
            <Chip
              color="warning"
              size="small"
              label={t("impact_function_modified_badge")}
              data-testid="results-impact-function-modified-badge"
            />
          )}
        </Stack>

        <ResultsTypography />
        {runImpactFunction && (
          <Stack direction="row" justifyContent="center" sx={{ mt: 2 }}>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              onClick={() => setImpactFunctionDialogOpen(true)}
              data-testid="results-view-impact-function"
            >
              {t("results_view_impact_function")}
            </Button>
          </Stack>
        )}
      </Box>
      <ImpactFunctionDialog
        open={impactFunctionDialogOpen}
        onClose={() => setImpactFunctionDialogOpen(false)}
        impactFunction={runImpactFunction}
        pendingOverride={runOverride}
        mode="era"
      />
    </Box>
  );
};

export default EconomicResultsCard;
