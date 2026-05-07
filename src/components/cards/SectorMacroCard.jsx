import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardActionArea, Typography, CardContent } from "@mui/material";
import useStore from "../../store";
import { layoutTransition } from "../../theme/theme";

const SectorMacroCard = () => {
  const {
    credOutputData,
    selectedMacroCountry,
    selectedMacroSector,
    selectedMacroVariable,
    setSelectedMacroSector,
  } = useStore();
  const { t } = useTranslation();

  // Extract distinct economic sectors
  const sectors = Array.from(
    new Set(
      credOutputData
        .filter(
          (row) =>
            row.country === selectedMacroCountry && row.economic_indicator === selectedMacroVariable
        )
        .map((row) => row.economic_sector)
    )
  );

  const handleCardSelect = (sector) => {
    if (selectedMacroSector === sector) {
      setSelectedMacroSector(""); // Deselect if already selected
    } else {
      setSelectedMacroSector(sector);
    }
  };

  const isButtonSelected = (sector) => selectedMacroSector === sector;

  return (
    <Card
      sx={{
        maxWidth: 800,
        margin: "auto",
        bgcolor: "primary.bgStrong",
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
          {t("card_macro_sector_title")}
        </Typography>
        {selectedMacroVariable &&
          sectors.map((sector) => (
            <CardActionArea
              key={sector}
              onClick={() => handleCardSelect(sector)}
              sx={{
                backgroundColor: isButtonSelected(sector) ? "secondary.main" : "secondary.light",
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
                {t(`card_macro_sector_${sector}`)}
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
            {t("card_macro_sector_remarks")}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default SectorMacroCard;
