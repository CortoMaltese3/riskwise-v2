import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardContent, Slider, Typography } from "@mui/material";
import useWorkspaceStore from "../../store/useWorkspaceStore";

// Inclusive range covering both monetary (GDP-like) and population-like
// growth — the unified slider serves both, with the remarks copy clarifying
// the dual interpretation.
const growthMarks = [
  { value: -2, label: "-2%" },
  { value: 6, label: "6%" },
];

const valueText = (value) => `${value}`;

const AnnualGrowthCard = () => {
  const selectedAnnualGrowth = useWorkspaceStore((s) => s.selectedAnnualGrowth);
  const setSelectedAnnualGrowth = useWorkspaceStore((s) => s.setSelectedAnnualGrowth);
  const { t } = useTranslation();

  const handleGrowthCardSelect = (event, value) => {
    setSelectedAnnualGrowth(value);
  };

  return (
    <Card
      sx={{
        maxWidth: 800,
        margin: "auto",
        bgcolor: "primary.bgStrong",
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
            backgroundColor: "secondary.main",
            borderRadius: (theme) => theme.spacing(1),
            padding: 1,
            marginBottom: 2,
          }}
        >
          {t("card_annualgrowth_title")}
        </Typography>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "secondary.light",
            borderRadius: (theme) => theme.spacing(1),
            py: 2.5,
            px: 0,
            width: "80%",
            paddingRight: 2,
            marginX: "auto",
            marginBottom: 2,
          }}
        >
          <Typography
            id="annual-growth-slider"
            gutterBottom
            variant="body1"
            component="div"
            textAlign="center"
            color="text.primary"
          >
            {t("card_annualgrowth_subtitle")}
          </Typography>
          <Slider
            aria-label={t("input_annual_growth_selector_aria")}
            defaultValue={0}
            getAriaValueText={valueText}
            onChange={handleGrowthCardSelect}
            step={0.1}
            marks={growthMarks}
            min={growthMarks[0].value}
            max={growthMarks[1].value}
            valueLabelDisplay="on"
            value={selectedAnnualGrowth ? parseFloat(selectedAnnualGrowth) : 0}
            sx={{
              color: "secondary.main",
              marginTop: 6,
              width: "90%",
              "& .MuiSlider-thumb": {
                height: 24,
                width: 24,
                backgroundColor: "common.white",
                border: 2,
                borderColor: "currentColor",
                "&:focus, &:hover, &.Mui-active": { boxShadow: "inherit" },
              },
              "& .MuiSlider-valueLabel": {
                color: "black",
                variant: "body2",
                fontWeight: "bold",
                borderRadius: (theme) => theme.spacing(2),
                borderColor: "black",
                backgroundColor: "secondary.main",
              },
              "& .MuiSlider-track": { height: 16, borderRadius: 4 },
              "& .MuiSlider-rail": {
                color: "border.default",
                opacity: 1,
                height: 8,
                borderRadius: 4,
              },
            }}
          />
        </Box>
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
