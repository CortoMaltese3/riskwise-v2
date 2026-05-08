import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";

import RiskWiseClient from "../lib/RiskWiseClient";
import logger from "../lib/logger.ts";

import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";

export const useMacroTools = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { setAlertMessage, setAlertSeverity, setAlertShowMessage } = useUIStore.getState();
  const { setCredOutputData, setMacroEconomicChartData, setMacroEconomicChartTitle } =
    useResultsStore.getState();

  const loadCREDOutputData = () => {
    const { activeCredDatasetId } = useResultsStore.getState();
    RiskWiseClient.fetchCREDOutput(activeCredDatasetId)
      .then((response) => {
        setAlertMessage(response.result.status.message);
        response.result.status.code === 2000
          ? setAlertSeverity("success")
          : setAlertSeverity("error");
        setCredOutputData(response.result.data);
      })
      .catch((error) => {
        setAlertShowMessage(true);
        logger.error("macroTools: loadCREDOutputData failed", {
          error: error?.message ?? String(error),
        });
      });
  };

  const generateChartFromCREDData = (credOutputData, filters) => {
    const {
      selectedMacroCountry,
      selectedMacroScenario,
      selectedMacroSector,
      selectedMacroVariable,
    } = filters;

    try {
      // Filter data based on selected filters
      const filteredData = credOutputData.filter(
        (row) =>
          row.country === selectedMacroCountry &&
          row.scenario === selectedMacroScenario &&
          row.economic_sector === selectedMacroSector &&
          row.economic_indicator === selectedMacroVariable
      );

      if (filteredData.length === 0) {
        throw new Error("No data available for the selected filters.");
      }

      // Group data by adaptation value
      const groupedData = filteredData.reduce((acc, row) => {
        const adaptationLabel =
          row.adpatation === null || row.adpatation === "None"
            ? "Without adaptation"
            : `${row.adpatation * 100}% Adaptation`;

        if (!acc[adaptationLabel]) {
          acc[adaptationLabel] = { years: [], values: [] };
        }
        acc[adaptationLabel].years.push(row.year);
        acc[adaptationLabel].values.push(row.proportion_change_from_baseline);

        return acc;
      }, {});

      // "Without adaptation" reads as the negative reference series; the
      // adapted scenario reads as positive. Pull both colours from the
      // semantic viz palette so dark mode picks up the same hues automatically.
      const baselineColor = theme.palette.viz.negative;
      const adaptedColor = theme.palette.viz.positive;
      const datasets = Object.keys(groupedData).map((label) => {
        const isBaseline = label.includes("Without");
        const seriesColor = isBaseline ? baselineColor : adaptedColor;
        return {
          label,
          data: groupedData[label].values,
          borderColor: seriesColor,
          backgroundColor: alpha(seriesColor, 0.2),
          fill: true,
          tension: 0.4,
        };
      });

      const chartData = {
        labels: [...new Set(filteredData.map((row) => row.year))],
        datasets,
      };

      const chartTitle = `${t(`input_macro_variable_${selectedMacroVariable}`)} - ${t(
        `input_macro_sector_${selectedMacroSector}`
      )}`;

      // Update the Zustand store
      setMacroEconomicChartData(chartData);
      setMacroEconomicChartTitle(chartTitle);

      setAlertMessage("Chart generated successfully.");
      setAlertSeverity("success");
      setAlertShowMessage(true);
    } catch (error) {
      setAlertMessage(error.message || "Error generating chart.");
      setAlertSeverity("error");
      setAlertShowMessage(true);
      console.error(error);
    }
  };

  return {
    loadCREDOutputData,
    generateChartFromCREDData,
  };
};
