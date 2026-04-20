import React from "react";

import { Paper } from "@mui/material";

import ExposureMap from "./ExposureMap";
import HazardMap from "./HazardMap";
import RiskMap from "./RiskMap";
import LoadingSkeleton from "../layout/LoadingSkeleton";
import useStore from "../../store";

const MapLayout = () => {
  const activeMap = useStore((state) => state.activeMap);
  const isScenarioRunning = useStore((state) => state.isScenarioRunning);

  return (
    <div style={{ height: "80%", display: "flex", flexDirection: "column" }}>
      <Paper
        elevation={3}
        style={{
          flex: 1,
          borderRadius: "15px",
          marginBottom: "16px",
          overflow: "hidden",
        }}
      >
        {isScenarioRunning ? (
          <LoadingSkeleton variant="map" data-testid="map-skeleton" />
        ) : (
          <>
            {activeMap === "exposure" && <ExposureMap />}
            {activeMap === "hazard" && <HazardMap />}
            {activeMap === "impact" && <RiskMap />}
          </>
        )}
      </Paper>
    </div>
  );
};

export default MapLayout;
