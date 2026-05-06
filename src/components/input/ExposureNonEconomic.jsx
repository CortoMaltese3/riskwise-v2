import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import useStore from "../../store";
import ContextualTooltip from "../help/ContextualTooltip";
import { cardTitleSx, disabledFieldSx, getInputCardSx } from "./inputCardStyles";

const ExposureNonEconomic = () => {
  const {
    isValidExposureNonEconomic,
    selectedExposureEconomic,
    selectedExposureNonEconomic,
    setAlertMessage,
    setAlertSeverity,
    setAlertShowMessage,
    setSelectedCard,
    setSelectedTab,
  } = useStore();
  const { t } = useTranslation();
  const [clicked, setClicked] = useState(false);
  const [cardState, setCardState] = useState("default");

  const handleMouseDown = () => {
    if (selectedExposureEconomic) return;
    setClicked(true);
  };

  const handleMouseUp = () => {
    if (selectedExposureEconomic) return;
    setClicked(false);
  };

  const handleClick = () => {
    if (selectedExposureEconomic) {
      setAlertMessage(t("alert_message_exposure_non_economic_select_asset"));
      setAlertSeverity("info");
      setAlertShowMessage(true);
      return;
    }
    setSelectedCard("exposureNonEconomic");
    setSelectedTab(0);
  };

  useEffect(() => {
    if (selectedExposureNonEconomic && isValidExposureNonEconomic) {
      setCardState("valid");
    } else if (selectedExposureNonEconomic && !isValidExposureNonEconomic) {
      setCardState("invalid");
    } else if (selectedExposureEconomic) {
      setCardState("neutral");
    } else {
      setCardState("default");
    }
  }, [isValidExposureNonEconomic, selectedExposureEconomic, selectedExposureNonEconomic]);

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
          <Typography id="exposure-dropdown" variant="h6" component="div" m={0} sx={cardTitleSx}>
            {t("input_exposure_non_economic_title")}
          </Typography>
          <ContextualTooltip titleKey="input_tooltip_exposure_non_economic" />
        </Stack>
        <TextField
          id="exposure-non-economic-textfield"
          fullWidth
          variant="outlined"
          value={
            selectedExposureNonEconomic
              ? t(`input_exposure_non_economic_${selectedExposureNonEconomic}`)
              : ""
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

export default ExposureNonEconomic;
