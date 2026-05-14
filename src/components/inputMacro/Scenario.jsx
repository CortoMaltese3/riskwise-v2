import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, TextField, Typography } from "@mui/material";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { cardTitleSx, disabledFieldSx, getInputCardSx } from "../input/inputCardStyles";

const Scenario = () => {
  const selectedMacroScenario = useWorkspaceStore((s) => s.selectedMacroScenario);
  const setActiveViewControl = useUIStore((s) => s.setActiveViewControl);
  const setSelectedMacroCard = useUIStore((s) => s.setSelectedMacroCard);
  const { t } = useTranslation();
  const [clicked, setClicked] = useState(false);
  const cardState = selectedMacroScenario ? "valid" : "default";

  const handleMouseDown = () => {
    setClicked(true);
  };

  const handleMouseUp = () => {
    setClicked(false);
  };

  const handleClick = () => {
    setSelectedMacroCard("scenario");
    setActiveViewControl("display_macro_parameters");
  };

  return (
    <Card
      variant="outlined"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      sx={getInputCardSx(cardState, { clicked })}
    >
      <CardContent sx={{ p: 1 }}>
        <Typography
          id="scenario-dropdown"
          gutterBottom
          variant="h6"
          component="div"
          m={0}
          sx={cardTitleSx}
        >
          {t("scenario_title")}
        </Typography>
        <TextField
          id="scenario"
          fullWidth
          variant="outlined"
          value={
            selectedMacroScenario ? t(`input_scenario_scenarios_${selectedMacroScenario}`) : ""
          }
          placeholder={t("input_card_placeholder")}
          disabled
          InputProps={{
            readOnly: true,
          }}
          sx={disabledFieldSx}
        />
      </CardContent>
    </Card>
  );
};

export default Scenario;
