import React from "react";
import { useTranslation } from "react-i18next";

import { Typography } from "@mui/material";

import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { tabIndex } from "../main/tabs";

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

  // The ERA/Explore explanatory copy bundle is keyed by the legacy numeric
  // tab index (e.g. ``..._1_0_display_map_hazard``). Renaming all ~350
  // keys per locale is out of scope for #247, so we translate the enum
  // back to its historical position before composing the lookup key.
  const tabIdx = tabIndex(selectedTab);

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
          `${tabIdx}_` +
          `${selectedSubTab}_` +
          `${activeViewControl}_` +
          `${activeMap}`
      );
    }
    return t(
      `results_${selectedAppOption}_` +
        `${tabIdx}_` +
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
