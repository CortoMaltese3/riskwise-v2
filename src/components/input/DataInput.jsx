import React from "react";

import { Box, Grid } from "@mui/material";

import AnnualGrowth from "./AnnualGrowth";
import Country from "./Country";
import DataInputViewTitle from "../title/DataInputViewTitle";
import Exposure from "./Exposure";
import Hazard from "./Hazard";
import ImpactFunctionCard from "./ImpactFunctionCard";
import Scenario from "./Scenario";
import TimeHorizon from "./TimeHorizon";
import useUIStore from "../../store/useUIStore";
import { TABS } from "../main/tabs";

const DataInput = () => {
  const selectedTab = useUIStore((s) => s.selectedTab);

  if (selectedTab !== TABS.PARAMETERS && selectedTab !== TABS.RISK) {
    return null;
  }

  return (
    <>
      {/* DataInput title section */}
      <DataInputViewTitle />

      {/* DataInput parameters section. The wrapper has no background — cards
          sit directly on the page surface (matching the Macroeconomic input
          panel) so the input column reads as a column of floating cards
          rather than a tinted panel containing them. */}
      <Box sx={{ padding: 1 }}>
        <Grid container spacing={0.5}>
          <Grid item xs={12} data-tour="country-selector">
            <Country />
          </Grid>
          <Grid item xs={12} data-tour="hazard-selector">
            <Hazard />
          </Grid>
          <Grid item xs={12}>
            <Scenario />
          </Grid>
          <Grid item xs={12}>
            <TimeHorizon />
          </Grid>
          <Grid item xs={12}>
            <Exposure />
          </Grid>
          <Grid item xs={12} data-tour="impact-function-card">
            <ImpactFunctionCard />
          </Grid>
          <Grid item xs={12}>
            <AnnualGrowth />
          </Grid>
        </Grid>
      </Box>
    </>
  );
};

export default DataInput;
