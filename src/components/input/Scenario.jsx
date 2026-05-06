import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import useStore from "../../store";
import ContextualTooltip from "../help/ContextualTooltip";
import { cardTitleSx, disabledFieldSx, getInputCardSx } from "./inputCardStyles";

const Scenario = () => {
  const { selectedScenario, setSelectedCard, setSelectedTab } = useStore();
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
    setSelectedCard("scenario");
    setSelectedTab(0);
  };

  useEffect(() => {
    setCardState(selectedScenario ? "valid" : "default");
  }, [selectedScenario]);

  return (
    <Card
      variant="outlined"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      sx={getInputCardSx(cardState, { clicked })}
    >
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
          <Typography id="scenario-dropdown" variant="h6" component="div" m={0} sx={cardTitleSx}>
            {t("scenario_title")}
          </Typography>
          <ContextualTooltip titleKey="input_tooltip_scenario" />
        </Stack>
        <TextField
          id="scenario"
          fullWidth
          variant="outlined"
          value={selectedScenario ? t(`input_scenario_scenarios_${selectedScenario}`) : ""}
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
