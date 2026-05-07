import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardActionArea, Typography, CardContent } from "@mui/material";
import useStore from "../../store";
import { layoutTransition } from "../../theme/theme";

const MacroEconomicVariableCard = () => {
  const { credOutputData, selectedMacroCountry, selectedMacroVariable, setSelectedMacroVariable } =
    useStore();
  const { t } = useTranslation();

  // Extract distinct economic indicators
  const variables = Array.from(
    new Set(
      credOutputData
        .filter((row) => row.country === selectedMacroCountry)
        .map((row) => row.economic_indicator)
    )
  );

  const handleCardSelect = (variable) => {
    if (selectedMacroVariable === variable) {
      setSelectedMacroVariable(""); // Deselect if already selected
    } else {
      setSelectedMacroVariable(variable);
    }
  };

  const isButtonSelected = (variable) => selectedMacroVariable === variable;

  return (
    <Card
      sx={{
        maxWidth: 800,
        margin: "auto",
        bgcolor: "primary.bg",
        border: 2,
        borderColor: "primary.dark",
        borderRadius: (theme) => theme.spacing(2),
        marginBottom: 2,
      }}
    >
      <CardContent>
        <Typography
          gutterBottom
          variant="h5"
          component="div"
          color="text.primary"
          sx={{
            textAlign: "center",
            fontWeight: "bold",
            backgroundColor: "secondary.main",
            borderRadius: (theme) => theme.spacing(1),
            padding: 1,
            marginBottom: 3,
          }}
        >
          {t("card_macro_economic_variable_title")}
        </Typography>
        {variables.map((variable) => (
          <CardActionArea
            key={variable}
            onClick={() => handleCardSelect(variable)}
            sx={{
              backgroundColor: isButtonSelected(variable) ? "secondary.main" : "secondary.light",
              borderRadius: (theme) => theme.spacing(1),
              margin: 2,
              marginLeft: 0,
              textAlign: "center",
              py: 1,
              px: 0,
              transition: layoutTransition(["transform"]),
              "&:active": {
                transform: "scale(0.96)", // Slightly scale down when clicked
              },
            }}
          >
            <Typography variant="body1" color="text.primary" sx={{ textAlign: "center" }}>
              {t(`card_macro_variable_${variable}`)}
            </Typography>
          </CardActionArea>
        ))}
        <Box
          sx={{
            padding: 2,
            backgroundColor: "surface.muted",
            borderRadius: (theme) => theme.spacing(1),
          }}
        >
          <Typography variant="body2" color="text.primary">
            {t("card_macro_variable_remarks")}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default MacroEconomicVariableCard;
