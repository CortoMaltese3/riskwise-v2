import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardContent, Slider, Typography } from "@mui/material";
import useStore from "../../store";

const TimeHorizonCard = () => {
  const { setSelectedTimeHorizon } = useStore();
  const { t } = useTranslation();

  // Initial range state
  const [value, setValue] = React.useState([2024, 2050]);

  const handleChange = (event, newValue) => {
    setValue(newValue);
    setSelectedTimeHorizon(newValue);
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
          {t("card_timehorizon_title")}
        </Typography>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center", // Center children horizontally
            backgroundColor: "secondary.light",
            borderRadius: (theme) => theme.spacing(1),
            py: 2.5,
            px: 0,
            marginBottom: 2,
          }}
        >
          <Typography
            id="timehorizon-slider"
            gutterBottom
            variant="body1"
            component="div"
            textAlign="center"
            color="text.primary"
          >
            {t("card_timehorizon_subtitle")}
          </Typography>
          <Slider
            aria-label={t("input_time_horizon_selector_aria")}
            defaultValue={[2024, 2050]}
            value={value}
            onChange={handleChange}
            valueLabelDisplay="on"
            min={2024}
            max={2075}
            marks={[
              { value: 2024, label: "2024" },
              { value: 2050, label: "2050" },
              { value: 2075, label: "2075" },
            ]}
            sx={{
              color: "secondary.main", // Slider track and thumb color
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
                backgroundColor: "secondary.main",
              },
              "& .MuiSlider-track": {
                height: 16,
                borderRadius: 4,
              },
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
            {t("card_timehorison_remarks")}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default TimeHorizonCard;
