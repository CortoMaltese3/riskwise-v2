import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import useStore from "../../store";
import ContextualTooltip from "../help/ContextualTooltip";
import { cardTitleSx, disabledFieldSx, getInputCardSx } from "./inputCardStyles";

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

  let titleKey = "input_annual_growth_title";
  if (selectedExposureEconomic) titleKey = "input_annual_gdp_growth_title";
  else if (selectedExposureNonEconomic) titleKey = "input_annual_population_growth_title";

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
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
          <Typography id="annual-growth-label" variant="h6" component="div" m={0} sx={cardTitleSx}>
            {t(titleKey)}
          </Typography>
          <ContextualTooltip titleKey="input_tooltip_annual_growth" />
        </Stack>
        <TextField
          id="annual-growth-textfield"
          fullWidth
          variant="outlined"
          value={selectedExposureEconomic || selectedExposureNonEconomic ? `${growth}%` : ""}
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

export default AnnualGrowth;
