import React from "react";

import CountryMacroCard from "./CountryMacroCard";
import MacroEconomicVariableCard from "./MacroEconomicVariableCard";
import ScenarioMacroCard from "./ScenarioMacroCard";
import SectorMacroCard from "./SectorMacroCard";
import useUIStore from "../../store/useUIStore";

const ViewMacroCard = () => {
  const selectedMacroCard = useUIStore((s) => s.selectedMacroCard);

  return (
    <>
      {selectedMacroCard === "country" && <CountryMacroCard />}
      {selectedMacroCard === "scenario" && <ScenarioMacroCard />}
      {selectedMacroCard === "sector" && <SectorMacroCard />}
      {selectedMacroCard === "macroVariable" && <MacroEconomicVariableCard />}
    </>
  );
};

export default ViewMacroCard;
