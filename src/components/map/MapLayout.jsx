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
        sx={{
          flex: 1,
          borderRadius: (theme) => theme.spacing(2),
          marginBottom: 2,
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
