import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardContent, Typography, TextField } from "@mui/material";
import useStore from "../../store";
import { disabledFieldSx, getInputCardSx } from "./inputCardStyles";

const Country = () => {
  const { selectedCountry, setSelectedCard, setSelectedTab } = useStore();
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
    setSelectedTab(0);
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
      <CardContent sx={{ p: 2 }}>
        <Box>
          <Typography id="country-label" gutterBottom variant="h6" component="div" m={0}>
            {t("country")}
          </Typography>
          {selectedCountry && (
            <TextField
              id="country"
              fullWidth
              variant="outlined"
              value={t(`input_country_${selectedCountry}`)}
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

export default Country;
