import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardContent, TextField, Typography } from "@mui/material";
import useStore from "../../store";
import { disabledFieldSx, getInputCardSx } from "./inputCardStyles";

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
        <Box>
          <Typography id="scenario-dropdown" gutterBottom variant="h6" component="div" m={0}>
            {t("scenario_title")}
          </Typography>

          {selectedScenario && (
            <TextField
              id="scenario"
              fullWidth
              variant="outlined"
              value={t(`input_scenario_scenarios_${selectedScenario}`)}
              disabled
              InputProps={{
                readOnly: true,
              }}
              sx={disabledFieldSx}
            />
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default Scenario;
