import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardContent, Slider, Typography } from "@mui/material";
import useStore from "../../store";

const populationMarks = [
  { value: -2, label: "-2%" },
  { value: 4, label: "4%" },
];
const gdpMarks = [
  { value: 0, label: "0%" },
  { value: 6, label: "6%" },
];

const valueText = (value) => {
  return `${value}`;
};

const AnnualGrowthCard = () => {
  const {
    selectedAnnualGrowth,
    selectedExposureEconomic,
    selectedExposureNonEconomic,
    setSelectedAnnualGrowth,
  } = useStore();
  const { t } = useTranslation();

  const handleGrowthCardSelect = (event, value) => {
    setSelectedAnnualGrowth(value);
  };

  return (
    <Card
      sx={{
        maxWidth: 800,
        margin: "auto",
        bgcolor: "card.bg",
        border: 2,
        borderColor: "primary.dark",
        borderRadius: (theme) => theme.spacing(2),
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
            backgroundColor: "accent.main",
            borderRadius: (theme) => theme.spacing(1),
            padding: 1,
            marginBottom: 2,
          }}
        >
          {t("card_annualgrowth_title")}
        </Typography>
        {selectedExposureEconomic && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center", // Center children horizontally
              backgroundColor: "accent.light",
              borderRadius: (theme) => theme.spacing(1),
              marginBottom: 2,
            }}
          >
            {/* GDP Box */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center", // Center children horizontally
                backgroundColor: "accent.light",
                borderRadius: (theme) => theme.spacing(1),
                py: 2.5,
                px: 0,
                width: "80%", // Take up half of the parent container
                paddingRight: 2,
                marginRight: 2,
              }}
            >
              <Typography
                id="gdp-slider"
                gutterBottom
                variant="body1"
                component="div"
                textAlign="center"
                color="text.primary"
              >
                {t("card_annualgrowth_gdp_subtitle")}
              </Typography>
              <Slider
                aria-label={t("input_gdp_selector_aria")}
                defaultValue={0}
                getAriaValueText={valueText}
                onChange={handleGrowthCardSelect} // Updated to the handleSelect function
                step={0.1}
                marks={gdpMarks}
                min={gdpMarks[0].value}
                max={gdpMarks[1].value}
                valueLabelDisplay="on" // Changed to "on" to always show the value label
                value={selectedAnnualGrowth ? parseFloat(selectedAnnualGrowth) : 0}
                sx={{
                  color: "accent.main", // Slider track and thumb color
                  marginTop: 6,
                  width: "90%", // Adjust width to be less than container to center properly
                  "& .MuiSlider-thumb": {
                    height: 24,
                    width: 24,
                    backgroundColor: "common.white",
                    border: 2,
                    borderColor: "currentColor",
                    "&:focus, &:hover, &.Mui-active": {
                      boxShadow: "inherit",
                    },
                  },
                  "& .MuiSlider-valueLabel": {
                    color: "black",
                    variant: "body2",
                    fontWeight: "bold",
                    borderRadius: (theme) => theme.spacing(2),
                    borderColor: "black",
                    backgroundColor: "accent.main",
                  },
                  "& .MuiSlider-track": {
                    height: 16,
                    borderRadius: 4,
                  },
                  "& .MuiSlider-rail": {
                    color: "slider.disabledRail",
                    opacity: 1,
                    height: 8,
                    borderRadius: 4,
                  },
                }}
              />
            </Box>
          </Box>
        )}
        {selectedExposureNonEconomic && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center", // Center children horizontally
              backgroundColor: "accent.light",
              borderRadius: (theme) => theme.spacing(1),
              marginBottom: 2,
            }}
          >
            {/* Population Box */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center", // Center children horizontally
                backgroundColor: "accent.light",
                borderRadius: (theme) => theme.spacing(1),
                py: 2.5,
                px: 0,
                width: "80%", // Take up half of the parent container
                paddingRight: 2,
                marginRight: 2,
              }}
            >
              <Typography
                id="population-slider"
                gutterBottom
                variant="body1"
                component="div"
                textAlign="center"
                color="text.primary"
              >
                {t("card_annualgrowth_population_subtitle")}
              </Typography>
              <Slider
                aria-label={t("input_population_selector_aria")}
                defaultValue={0}
                getAriaValueText={valueText}
                onChange={handleGrowthCardSelect} // Updated to the handleSelect function
                step={0.1}
                marks={populationMarks}
                min={populationMarks[0].value}
                max={populationMarks[1].value}
                valueLabelDisplay="on" // Changed to "on" to always show the value label
                value={selectedAnnualGrowth ? parseFloat(selectedAnnualGrowth) : 0}
                sx={{
                  color: "accent.main", // Slider track and thumb color
                  marginTop: 6,
                  width: "90%", // Adjust width to be less than container to center properly
                  "& .MuiSlider-thumb": {
                    height: 24,
                    width: 24,
                    backgroundColor: "common.white",
                    border: 2,
                    borderColor: "currentColor",
                    "&:focus, &:hover, &.Mui-active": {
                      boxShadow: "inherit",
                    },
                  },
                  "& .MuiSlider-valueLabel": {
                    color: "black",
                    variant: "body2",
                    fontWeight: "bold",
                    borderRadius: (theme) => theme.spacing(2),
                    borderColor: "black",
                    backgroundColor: "accent.main",
                  },
                  "& .MuiSlider-track": {
                    height: 16,
                    borderRadius: 4,
                  },
                  "& .MuiSlider-rail": {
                    color: "slider.disabledRail",
                    opacity: 1,
                    height: 8,
                    borderRadius: 4,
                  },
                }}
              />
            </Box>
          </Box>
        )}
        <Box
          sx={{
            padding: 2,
            backgroundColor: "surface.muted",
            borderRadius: (theme) => theme.spacing(1),
          }}
        >
          <Typography variant="body2" color="text.primary">
            {t("card_annualgrowth_remarks")}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default AnnualGrowthCard;
