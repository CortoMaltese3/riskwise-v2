import React from "react";

import AnnualGrowthCard from "./AnnualGrowthCard";
import CountryCard from "./CountryCard";
import ExposureCard from "./ExposureCard";
import HazardCard from "./HazardCard";
import ScenarioCard from "./ScenarioCard";
import TimeHorizonCard from "./TimeHorizonCard";
import useStore from "../../store";

const ViewCard = () => {
  const { selectedCard } = useStore();

  return (
    <>
      {selectedCard === "country" && <CountryCard />}
      {selectedCard === "hazard" && <HazardCard />}
      {selectedCard === "scenario" && <ScenarioCard />}
      {selectedCard === "timeHorizon" && <TimeHorizonCard />}
      {selectedCard === "annualGrowth" && <AnnualGrowthCard />}
      {selectedCard === "exposure" && <ExposureCard />}
    </>
  );
};

export default ViewCard;
