import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import ContextualTooltip from "../help/ContextualTooltip";
import { cardTitleSx, disabledFieldSx, getInputCardSx } from "./inputCardStyles";

const Hazard = () => {
  const isValidHazard = useWorkspaceStore((s) => s.isValidHazard);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
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
    setSelectedCard("hazard");
    setSelectedTab(0);
  };

  useEffect(() => {
    if (selectedHazard && isValidHazard) {
      setCardState("valid");
    } else if (selectedHazard && !isValidHazard) {
      setCardState("invalid");
    } else {
      setCardState("default");
    }
  }, [selectedHazard, isValidHazard]);

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
          <Typography id="hazard-dropdown" variant="h6" component="div" m={0} sx={cardTitleSx}>
            {t("hazard_title")}
          </Typography>
          <ContextualTooltip titleKey="input_tooltip_hazard" />
        </Stack>
        <TextField
          id="hazard"
          fullWidth
          variant="outlined"
          value={selectedHazard ? t(`input_hazard_${selectedHazard}`) : ""}
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

export default Hazard;
