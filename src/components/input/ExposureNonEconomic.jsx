import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardContent, TextField, Typography } from "@mui/material";
import useStore from "../../store";
import { disabledFieldSx, getInputCardSx } from "./inputCardStyles";

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
        <Box>
          <Typography id="exposure-dropdown" gutterBottom variant="h6" component="div" m={0}>
            {t("input_exposure_non_economic_title")}
          </Typography>
          {selectedExposureNonEconomic && (
            <TextField
              id="exposure-non-economic-textfield"
              fullWidth
              variant="outlined"
              value={t(`input_exposure_non_economic_${selectedExposureNonEconomic}`)}
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

export default ExposureNonEconomic;
