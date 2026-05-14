import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import ContextualTooltip from "../help/ContextualTooltip";
import { cardTitleSx, disabledFieldSx, getInputCardSx } from "./inputCardStyles";

const AnnualGrowth = () => {
  const selectedAppOption = useWorkspaceStore((s) => s.selectedAppOption);
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedAnnualGrowth = useWorkspaceStore((s) => s.selectedAnnualGrowth);
  const selectedExposure = useWorkspaceStore((s) => s.selectedExposure);
  const selectedExposureCategory = useWorkspaceStore((s) => s.selectedExposureCategory);
  const setAlertMessage = useUIStore((s) => s.setAlertMessage);
  const setAlertSeverity = useUIStore((s) => s.setAlertSeverity);
  const setAlertShowMessage = useUIStore((s) => s.setAlertShowMessage);
  const openInputEditor = useUIStore((s) => s.openInputEditor);
  const setSelectedCard = useUIStore((s) => s.setSelectedCard);
  const { t } = useTranslation();
  const [clicked, setClicked] = useState(false);
  const [cardState, setCardState] = useState("default");
  const [growth, setGrowth] = useState(selectedAnnualGrowth);

  // ERA mode pins the annual growth rate per-country; card is not clickable.
  const isEraLocked = selectedAppOption === "era";
  // Economic-category exposures (and Custom uploads, which default to economic
  // for engine display rounding — see RunScenarioButton) follow the GDP rate;
  // non-economic follows the population rate.
  const isEconomic = selectedExposureCategory !== "non_economic";

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
    openInputEditor();
  };

  useEffect(() => {
    setCardState(isEraLocked && selectedCountry ? "valid" : "default");
    if (isEraLocked) {
      if (selectedCountry === "thailand") {
        setGrowth(isEconomic ? 2.94 : -0.22);
      } else if (selectedCountry === "egypt") {
        setGrowth(isEconomic ? 4 : 1.29);
      } else {
        setGrowth(selectedAnnualGrowth);
      }
    } else {
      setGrowth(selectedAnnualGrowth);
    }
  }, [isEraLocked, selectedCountry, selectedAnnualGrowth, isEconomic]);

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
            {t("input_annual_growth_title")}
          </Typography>
          <ContextualTooltip titleKey="input_tooltip_annual_growth" />
        </Stack>
        <TextField
          id="annual-growth-textfield"
          fullWidth
          variant="outlined"
          value={selectedExposure ? `${growth}%` : ""}
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
