import React from "react";

import AnnualGrowthCard from "./AnnualGrowthCard";
import CountryCard from "./CountryCard";
import ExposureCard from "./ExposureCard";
import HazardCard from "./HazardCard";
import ImpactFunctionCard from "./ImpactFunctionCard";
import MeasuresCard from "./MeasuresCard";
import ScenarioCard from "./ScenarioCard";
import TimeHorizonCard from "./TimeHorizonCard";
import useUIStore from "../../store/useUIStore";

const ViewCard = () => {
  const selectedCard = useUIStore((s) => s.selectedCard);

  return (
    <>
      {selectedCard === "country" && <CountryCard />}
      {selectedCard === "hazard" && <HazardCard />}
      {selectedCard === "scenario" && <ScenarioCard />}
      {selectedCard === "timeHorizon" && <TimeHorizonCard />}
      {selectedCard === "annualGrowth" && <AnnualGrowthCard />}
      {selectedCard === "exposure" && <ExposureCard />}
      {selectedCard === "impactFunction" && <ImpactFunctionCard />}
      {selectedCard === "measures" && <MeasuresCard />}
    </>
  );
};

export default ViewCard;
