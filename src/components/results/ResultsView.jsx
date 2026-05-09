import React from "react";

import { Box } from "@mui/material";

import ResultsViewTitle from "../title/ResultsViewTitle";
import EconomicResultsCard from "./EconomicResultsCard";
import MacroEconomicResultsCard from "./MacroEconomicResultsCard";
import OutputResultsCard from "./OutputResultsCard";
import LoadingSkeleton from "../layout/LoadingSkeleton";
import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import { TABS } from "../main/tabs";

const ResultsView = () => {
  const selectedTab = useUIStore((state) => state.selectedTab);
  const isScenarioRunning = useResultsStore((state) => state.isScenarioRunning);

  if (selectedTab === TABS.PARAMETERS) {
    return null;
  }

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <ResultsViewTitle selectedTab={selectedTab} />
        {isScenarioRunning ? (
          <LoadingSkeleton data-testid="results-skeleton" />
        ) : (
          <>
            {selectedTab === TABS.RISK && <EconomicResultsCard />}
            {selectedTab === TABS.MACRO && <MacroEconomicResultsCard />}
            {selectedTab === TABS.REPORTS && <OutputResultsCard />}
          </>
        )}
      </Box>
    </Box>
  );
};

export default ResultsView;
