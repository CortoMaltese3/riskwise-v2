import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, TextField, Typography } from "@mui/material";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { cardTitleSx, disabledFieldSx, getInputCardSx } from "../input/inputCardStyles";

const MacroEconomicVariable = () => {
  const setSelectedMacroCard = useUIStore((s) => s.setSelectedMacroCard);
  const setActiveViewControl = useUIStore((s) => s.setActiveViewControl);
  const selectedMacroVariable = useWorkspaceStore((s) => s.selectedMacroVariable);
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
    setSelectedMacroCard("macroVariable");
    setActiveViewControl("display_macro_parameters");
  };

  useEffect(() => {
    setCardState(selectedMacroVariable ? "valid" : "default");
  }, [selectedMacroVariable]);

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
        <Typography
          id="macro-variable-title"
          gutterBottom
          variant="h6"
          component="div"
          m={0}
          sx={cardTitleSx}
        >
          {t("input_macro_economic_variable_title")}
        </Typography>
        <TextField
          id="macro-variable-textfield"
          fullWidth
          variant="outlined"
          value={selectedMacroVariable ? t(`input_macro_variable_${selectedMacroVariable}`) : ""}
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

export default MacroEconomicVariable;
