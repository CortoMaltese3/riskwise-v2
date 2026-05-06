import React from "react";

import { Paper } from "@mui/material";

import ExposureMap from "./ExposureMap";
import HazardMap from "./HazardMap";
import RiskMap from "./RiskMap";
import MapEmptyState from "./MapEmptyState";
import LoadingSkeleton from "../layout/LoadingSkeleton";
import useStore from "../../store";

const MapLayout = () => {
  const activeMap = useStore((state) => state.activeMap);
  const isScenarioRunning = useStore((state) => state.isScenarioRunning);
  const isScenarioRunCompleted = useStore((state) => state.isScenarioRunCompleted);

  const renderContent = () => {
    if (isScenarioRunning) {
      return <LoadingSkeleton variant="map" data-testid="map-skeleton" />;
    }
    if (!isScenarioRunCompleted) {
      return <MapEmptyState />;
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
