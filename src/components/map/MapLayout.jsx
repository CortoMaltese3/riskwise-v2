import React from "react";

import { Box, Paper } from "@mui/material";

import ExposureMap from "./ExposureMap";
import HazardMap from "./HazardMap";
import RiskMap from "./RiskMap";
import MapEmptyState from "./MapEmptyState";
import LoadingSkeleton from "../layout/LoadingSkeleton";
import useStore from "../../store";

const CenteredPlaceholder = ({ children }) => (
  <Box
    sx={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {children}
  </Box>
);

const MapLayout = () => {
  const activeMap = useStore((state) => state.activeMap);
  const isScenarioRunning = useStore((state) => state.isScenarioRunning);
  const isScenarioRunCompleted = useStore((state) => state.isScenarioRunCompleted);

  const renderContent = () => {
    if (isScenarioRunning) {
      return (
        <CenteredPlaceholder>
          <LoadingSkeleton variant="map" data-testid="map-skeleton" />
        </CenteredPlaceholder>
      );
    }
    if (!isScenarioRunCompleted) {
      return (
        <CenteredPlaceholder>
          <MapEmptyState />
        </CenteredPlaceholder>
      );
    }
    return (
      <>
        {activeMap === "exposure" && <ExposureMap />}
        {activeMap === "hazard" && <HazardMap />}
        {activeMap === "impact" && <RiskMap />}
      </>
    );
  };

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
          overflow: "hidden",
        }}
      >
        {renderContent()}
      </Paper>
    </div>
  );
};

export default MapLayout;
