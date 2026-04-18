import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardContent, TextField, Typography } from "@mui/material";
import useStore from "../../store";
import { disabledFieldSx, getInputCardSx } from "./inputCardStyles";

const AnnualGrowth = () => {
  const {
    selectedAppOption,
    selectedCountry,
    selectedAnnualGrowth,
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
  const [growth, setGrowth] = useState(selectedAnnualGrowth);

  // ERA mode pins the annual growth rate per-country; card is not clickable.
  const isEraLocked = selectedAppOption === "era";

  const handleMouseDown = () => {
    if (isEraLocked) return;
    setClicked(true);
  };

  const handleMouseUp = () => {
    if (isEraLocked) return;
    setClicked(false);
  };

  const handleCardClick = () => {
    if (isEraLocked) {
      setAlertMessage(t("alert_message_annual_growth_fixed_growth"));
      setAlertSeverity("info");
      setAlertShowMessage(true);
      return;
    }
    setSelectedCard("annualGrowth");
    setSelectedTab(0);
  };

  useEffect(() => {
    setCardState(isEraLocked && selectedCountry ? "valid" : "default");
    if (isEraLocked) {
      if (selectedCountry === "thailand") {
        setGrowth(selectedExposureEconomic ? 2.94 : -0.22);
      } else if (selectedCountry === "egypt") {
        setGrowth(selectedExposureEconomic ? 4 : 1.29);
      } else {
        setGrowth(selectedAnnualGrowth);
      }
    } else {
      setGrowth(selectedAnnualGrowth);
    }
  }, [
    isEraLocked,
    selectedCountry,
    selectedAnnualGrowth,
    selectedExposureEconomic,
    selectedExposureNonEconomic,
  ]);

  return (
    <Card
      variant="outlined"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleCardClick}
      sx={getInputCardSx(cardState, { clicked })}
    >
      <CardContent>
        {!selectedExposureEconomic && !selectedExposureNonEconomic && (
          <Box>
            <Typography id="annual-growth-slider" gutterBottom variant="h6" component="div" m={0}>
              {t("input_annual_growth_title")}
            </Typography>
          </Box>
        )}

        {selectedExposureEconomic && (
          <Box>
            <Typography
              id="annual-growth-gdp-slider"
              gutterBottom
              variant="h6"
              component="div"
              m={0}
            >
              {selectedExposureEconomic
                ? t("input_annual_gdp_growth_title")
                : t("input_annual_population_growth_title")}
            </Typography>
            <TextField
              id="annual-growth-gdp-textfield"
              fullWidth
              variant="outlined"
              value={`${growth}%`}
              disabled
              aria-readonly={true}
              sx={disabledFieldSx}
            />
          </Box>
        )}

        {selectedExposureNonEconomic && (
          <Box>
            <Typography
              id="annual-growth-population-slider"
              gutterBottom
              variant="h6"
              component="div"
            >
              {t("input_annual_population_growth_title")}
            </Typography>
            <TextField
              id="annual-growth-population-textfield"
              fullWidth
              variant="outlined"
              value={`${growth}%`}
              disabled
              aria-readonly={true}
              sx={disabledFieldSx}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default AnnualGrowth;
