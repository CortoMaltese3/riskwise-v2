import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, Stack, Typography, TextField } from "@mui/material";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import ContextualTooltip from "../help/ContextualTooltip";
import { TABS } from "../main/tabs";
import { cardTitleSx, disabledFieldSx, getInputCardSx } from "./inputCardStyles";

const Country = () => {
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const setSelectedCard = useUIStore((s) => s.setSelectedCard);
  const setSelectedTab = useUIStore((s) => s.setSelectedTab);
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
    setSelectedCard("country");
    setSelectedTab(TABS.PARAMETERS);
  };

  useEffect(() => {
    setCardState(selectedCountry ? "valid" : "default");
  }, [selectedCountry]);

  return (
    <Card
      variant="outlined"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      sx={getInputCardSx(cardState, { clicked })}
    >
      <CardContent sx={{ p: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
          <Typography id="country-label" variant="h6" component="div" m={0} sx={cardTitleSx}>
            {t("country")}
          </Typography>
          <ContextualTooltip titleKey="input_tooltip_country" />
        </Stack>
        <TextField
          id="country"
          fullWidth
          variant="outlined"
          value={selectedCountry ? t(`input_country_${selectedCountry}`) : ""}
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

export default Country;
