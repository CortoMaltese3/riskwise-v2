import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, TextField, Typography } from "@mui/material";
import useStore from "../../store";
import { cardTitleSx, disabledFieldSx, getInputCardSx } from "../input/inputCardStyles";

const Scenario = () => {
  const { selectedMacroScenario, setActiveViewControl, setSelectedMacroCard } = useStore();
  const { t } = useTranslation();
  const [clicked, setClicked] = useState(false);
  const [cardState, setCardState] = useState("default");

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

  useEffect(() => {
    setCardState(selectedMacroScenario ? "valid" : "default");
  }, [selectedMacroScenario]);

  return (
    <Card
      variant="outlined"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      sx={getInputCardSx(cardState, { clicked })}
    >
      <CardContent sx={{ p: 2 }}>
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
