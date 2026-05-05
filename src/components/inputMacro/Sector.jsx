import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, TextField, Typography } from "@mui/material";
import useStore from "../../store";
import { disabledFieldSx, getInputCardSx } from "../input/inputCardStyles";

const Sector = () => {
  const { setSelectedMacroCard, setActiveViewControl, selectedMacroSector } = useStore();
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
    setSelectedMacroCard("sector");
    setActiveViewControl("display_macro_parameters");
  };

  useEffect(() => {
    setCardState(selectedMacroSector ? "valid" : "default");
  }, [selectedMacroSector]);

  return (
    <Card
      variant="outlined"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      sx={getInputCardSx(cardState, { clicked })}
    >
      <CardContent sx={{ p: 2 }}>
        <Typography id="sector-title" gutterBottom variant="h6" component="div" m={0}>
          {t("input_macro_sector_title")}
        </Typography>
        <TextField
          id="sector-textfield"
          fullWidth
          variant="outlined"
          value={selectedMacroSector ? t(`input_macro_sector_${selectedMacroSector}`) : ""}
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

export default Sector;
