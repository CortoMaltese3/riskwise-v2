import React from "react";
import { useTranslation } from "react-i18next";

import { Typography } from "@mui/material";

import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";

const ResultsTypography = () => {
  const activeMap = useUIStore((s) => s.activeMap);
  const activeViewControl = useUIStore((s) => s.activeViewControl);
  const selectedTab = useUIStore((s) => s.selectedTab);
  const selectedSubTab = useUIStore((s) => s.selectedSubTab);
  const selectedAppOption = useWorkspaceStore((s) => s.selectedAppOption);
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
  const selectedExposure = useWorkspaceStore((s) => s.selectedExposure);
  const { t } = useTranslation();

  const getText = () => {
    if (selectedAppOption === "era") {
      if (!selectedAppOption || !selectedCountry || !selectedHazard || !selectedExposure) {
        return "";
      }
      return t(
        `results_${selectedAppOption}_` +
          `${selectedCountry}_` +
          `${selectedHazard}_` +
          `${selectedExposure}_` +
          `${selectedTab}_` +
          `${selectedSubTab}_` +
          `${activeViewControl}_` +
          `${activeMap}`
      );
    }
    return t(
      `results_${selectedAppOption}_` +
        `${selectedTab}_` +
        `${selectedSubTab}_` +
        `${activeViewControl}_` +
        `${activeMap}`
    );
  };

  return (
    <Typography variant="body1" sx={{ marginTop: 2, flexGrow: 1, color: "text.secondary" }}>
      {getText()}
    </Typography>
  );
};

export default ResultsTypography;
