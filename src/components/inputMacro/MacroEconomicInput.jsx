import React from "react";

import { Box, Grid } from "@mui/material";

import Country from "./Country";
import MacroEconomicViewTitle from "../title/MacroEconomicViewTitle";
import Sector from "./Sector";
import MacroEconomicVariable from "./MacroEconomicVariable";
import Scenario from "./Scenario";
import useUIStore from "../../store/useUIStore";
import { TABS } from "../main/tabs";

const MacroEconomicInput = () => {
  const selectedTab = useUIStore((s) => s.selectedTab);

  if (!(selectedTab === TABS.MACRO)) {
    return null;
  }

  return (
    <>
      {/* MacroEconomic title section */}
      <MacroEconomicViewTitle />

      {/* MacroEconomic parameters section. No wrapper background — cards
          float directly on the page surface. */}
      <Box sx={{ padding: 1.5 }}>
        <Grid container spacing={1}>
          <Grid item xs={12}>
            <Country />
          </Grid>
          <Grid item xs={12}>
            <Scenario />
          </Grid>
          <Grid item xs={12}>
            <MacroEconomicVariable />
          </Grid>
          <Grid item xs={12}>
            <Sector />
          </Grid>
        </Grid>
      </Box>
    </>
  );
};

export default MacroEconomicInput;
