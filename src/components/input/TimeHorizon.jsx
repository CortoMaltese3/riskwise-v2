import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, Stack, TextField, Typography } from "@mui/material";

import useStore from "../../store";
import ContextualTooltip from "../help/ContextualTooltip";
import { cardTitleSx, disabledFieldSx, getInputCardSx } from "./inputCardStyles";

const TimeHorizon = () => {
  const {
    selectedAppOption,
    selectedCountry,
    selectedTimeHorizon,
    setAlertMessage,
    setAlertSeverity,
    setAlertShowMessage,
    setSelectedCard,
    setSelectedTab,
  } = useStore();
  const { t } = useTranslation();
  const [clicked, setClicked] = useState(false);
  const [cardState, setCardState] = useState("default");

  // ERA mode locks the time horizon to 2050; card is not clickable.
  const isEraLocked = selectedAppOption === "era";

  const handleMouseDown = () => {
    if (isEraLocked) return;
    setClicked(true);
  };

  const handleMouseUp = () => {
    if (isEraLocked) return;
    setClicked(false);
  };

  const handleClick = () => {
    if (isEraLocked) {
      setAlertMessage(t("alert_message_time_horizon_fixed_time"));
      setAlertSeverity("info");
      setAlertShowMessage(true);
      return;
    }
    setSelectedCard("timeHorizon");
    setSelectedTab(0);
  };

  useEffect(() => {
    setCardState(isEraLocked && selectedCountry ? "valid" : "default");
  }, [isEraLocked, selectedCountry]);

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
          <Typography
            id="time-horizon-dropdown"
            variant="h6"
            component="div"
            m={0}
            sx={cardTitleSx}
          >
            {t("time_horizon_title")}
          </Typography>
          <ContextualTooltip titleKey="input_tooltip_time_horizon" />
        </Stack>
        <TextField
          id="timeHorizon"
          fullWidth
          variant="outlined"
          value={selectedTimeHorizon ? `${selectedTimeHorizon[0]} - ${selectedTimeHorizon[1]}` : ""}
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

export default TimeHorizon;
