import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardContent, TextField, Typography } from "@mui/material";
import useStore from "../../store";
import { disabledFieldSx, getInputCardSx } from "./inputCardStyles";

const ExposureEconomic = () => {
  const {
    isValidExposureEconomic,
    setAlertMessage,
    setAlertSeverity,
    setAlertShowMessage,
    setSelectedCard,
    setSelectedTab,
    selectedCountry,
    selectedExposureEconomic,
    selectedExposureNonEconomic,
    selectedHazard,
  } = useStore();
  const { t } = useTranslation();
  const [clicked, setClicked] = useState(false);
  const [cardState, setCardState] = useState("default");

  // Thailand + heatwaves has no economic asset dataset — card is non-clickable.
  const isHeatwavesThailand = selectedCountry === "thailand" && selectedHazard === "heatwaves";
  const isLocked = selectedExposureNonEconomic || isHeatwavesThailand;

  const handleMouseDown = () => {
    if (isLocked) return;
    setClicked(true);
  };

  const handleMouseUp = () => {
    if (isLocked) return;
    setClicked(false);
  };

  const handleClick = () => {
    if (selectedExposureNonEconomic) {
      setAlertMessage(t("alert_message_exposure_economic_select_asset"));
      setAlertSeverity("info");
      setAlertShowMessage(true);
      return;
    }
    if (isHeatwavesThailand) {
      setAlertMessage(t("alert_message_exposure_economic_no_asset"));
      setAlertSeverity("info");
      setAlertShowMessage(true);
      return;
    }
    setSelectedCard("exposureEconomic");
    setSelectedTab(0);
  };

  useEffect(() => {
    if (selectedExposureEconomic && isValidExposureEconomic) {
      setCardState("valid");
    } else if (selectedExposureEconomic && !isValidExposureEconomic) {
      setCardState("invalid");
    } else if (selectedExposureNonEconomic || isHeatwavesThailand) {
      setCardState("neutral");
    } else {
      setCardState("default");
    }
  }, [
    isValidExposureEconomic,
    selectedExposureEconomic,
    selectedExposureNonEconomic,
    isHeatwavesThailand,
  ]);

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
            {t("input_exposure_economic_title")}
          </Typography>
          {selectedExposureEconomic && (
            <TextField
              id="exposure-economic-textfield"
              fullWidth
              variant="outlined"
              value={t(`input_exposure_economic_${selectedExposureEconomic}`)}
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

export default ExposureEconomic;
