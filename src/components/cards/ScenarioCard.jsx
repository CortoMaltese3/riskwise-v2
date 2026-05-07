import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardActionArea, Typography, CardContent } from "@mui/material";
import useStore from "../../store";
import { layoutTransition } from "../../theme/theme";

const ScenarioCard = () => {
  const { selectedHazard, selectedScenario, setSelectedScenario } = useStore();
  const { t } = useTranslation();

  const scenarios =
    selectedHazard === "flood"
      ? ["historical", "rcp26", "rcp85"]
      : ["historical", "rcp45", "rcp85"];

  const handleCardSelect = (scenario) => {
    if (selectedScenario === scenario) {
      setSelectedScenario(""); // Deselect if already selected
    } else {
      setSelectedScenario(scenario);
    }
  };

  const isButtonSelected = (scenario) => selectedScenario === scenario;

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
            marginBottom: 3,
          }}
        >
          {t("card_scenario_title")}
        </Typography>
        {scenarios.map((scenario) => (
          <CardActionArea
            key={scenario}
            onClick={() => handleCardSelect(scenario)}
            sx={{
              backgroundColor: isButtonSelected(scenario) ? "secondary.main" : "secondary.light",
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
              {t(`card_scenario_scenarios_${scenario}`)}
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
            {t("card_scenario_remarks")}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ScenarioCard;
