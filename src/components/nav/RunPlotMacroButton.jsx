import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Button } from "@mui/material";
import InsightsIcon from "@mui/icons-material/Insights";

import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { useMacroTools } from "../../utils/macroTools";

const RunPlotMacroButton = () => {
  const { t } = useTranslation();
  const credOutputData = useResultsStore((s) => s.credOutputData);
  const selectedMacroCountry = useWorkspaceStore((s) => s.selectedMacroCountry);
  const selectedMacroScenario = useWorkspaceStore((s) => s.selectedMacroScenario);
  const selectedMacroSector = useWorkspaceStore((s) => s.selectedMacroSector);
  const selectedMacroVariable = useWorkspaceStore((s) => s.selectedMacroVariable);
  const setActiveViewControl = useUIStore((s) => s.setActiveViewControl);

  const { generateChartFromCREDData } = useMacroTools();

  const [isPlotButtonDisabled, setIsPlotButtonDisabled] = useState(true);

  const isValid = () =>
    selectedMacroCountry && selectedMacroScenario && selectedMacroSector && selectedMacroVariable;

  useEffect(() => {
    setIsPlotButtonDisabled(!isValid());
  }, [selectedMacroCountry, selectedMacroScenario, selectedMacroSector, selectedMacroVariable]);

  const handleRunButton = () => {
    const filters = {
      selectedMacroCountry,
      selectedMacroScenario,
      selectedMacroSector,
      selectedMacroVariable,
    };

    generateChartFromCREDData(credOutputData, filters);
    setActiveViewControl("display_macro_chart");
  };

  return (
    <Box sx={{ textAlign: "center", mt: 2 }}>
      <Button
        disabled={isPlotButtonDisabled}
        onClick={handleRunButton}
        startIcon={<InsightsIcon />}
        sx={{
          bgcolor: "secondary.main",
          "&:hover": { bgcolor: "secondary.light" },
        }}
        variant="contained"
      >
        {t("run_macro_plot_button")}
      </Button>
    </Box>
  );
};

export default RunPlotMacroButton;
