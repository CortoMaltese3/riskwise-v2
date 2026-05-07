import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  IconButton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

import RiskWiseClient from "../../lib/RiskWiseClient";
import logger from "../../lib/logger.ts";
import useStore from "../../store";
import { layoutTransition } from "../../theme/theme";

const exposureEconomicDict = {
  thailand: {
    flood: ["tree_crops", "grass_crops", "wet_markets"],
    drought: ["tree_crops", "grass_crops", "wet_markets"],
    heatwaves: [],
  },
  egypt: {
    flood: ["crops", "livestock", "power_plants", "hotels"],
    heatwaves: ["crops", "livestock", "hotels"],
  },
};

const ExposureEconomicCard = () => {
  const {
    selectedAppOption,
    selectedCountry,
    selectedExposureEconomic,
    selectedExposureFile,
    selectedHazard,
    setAlertMessage,
    setAlertSeverity,
    setAlertShowMessage,
    setIsValidExposureEconomic,
    setSelectedExposureEconomic,
    setSelectedExposureFile,
  } = useStore();
  const { t } = useTranslation();

  const [fetchExposureMessage, setFetchExposureMessage] = useState("");

  const exposuresEconomic =
    selectedCountry && selectedHazard
      ? exposureEconomicDict[selectedCountry]?.[selectedHazard] || []
      : [];

  const handleCardSelect = (exposure) => {
    if (selectedExposureEconomic === exposure) {
      setSelectedExposureEconomic(""); // Deselect if already selected
    } else {
      setSelectedExposureEconomic(exposure);
    }
    setSelectedExposureFile("");
    setIsValidExposureEconomic(false);
    setFetchExposureMessage("");
  };

  const isButtonSelected = (exposure) => selectedExposureEconomic === exposure;

  const handleLoadButtonClick = () => {
    if (!selectedExposureEconomic) {
      setAlertMessage(t("alert_message_exposure_economic_card_select_asset"));
      setAlertSeverity("warning");
      setAlertShowMessage(true);
    } else {
      document.getElementById("exposure-economic-contained-button-file").click();
    }
  };

  const handleFileChange = (event) => {
    // Reset the value of the fetched Exposure data if existing
    setFetchExposureMessage("");
    setSelectedExposureFile("");
    setIsValidExposureEconomic(false);

    const file = event.target.files[0];
    if (file) {
      setSelectedExposureFile(file.name);
      setIsValidExposureEconomic(true);
    }
  };

  const clearUploadedFile = () => {
    setSelectedExposureFile("");
    setIsValidExposureEconomic(false);
    // Reset the value of the file input to avoid issues when trying to upload the same file
    document.getElementById("exposure-economic-contained-button-file").value = "";
  };

  const clearFetchedData = () => {
    setFetchExposureMessage("");
    setIsValidExposureEconomic(false);
  };

  const handleFetchButtonClick = () => {
    // Reset the value of the file input if already selected
    setSelectedExposureFile("");
    setFetchExposureMessage("");
    setIsValidExposureEconomic(false);
    RiskWiseClient.validateData({
      country: selectedCountry,
      dataType: selectedExposureEconomic,
    })
      .then((response) => {
        setAlertMessage(response.result.status.message);
        response.result.status.code === 2000
          ? setAlertSeverity("success")
          : setAlertSeverity("error");
        setAlertShowMessage(true);
        setFetchExposureMessage(response.result.status.message);
        setIsValidExposureEconomic(response.result.status.code === 2000);
      })
      .catch((error) => {
        logger.error("ExposureEconomicCard: fetchExposureData failed", {
          error: error?.message ?? String(error),
        });
      });
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
            marginBottom: 3,
          }}
        >
          {t("card_exposure_economic_title")}
        </Typography>

        {/* Economic Exposure selection section */}
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {exposuresEconomic.map((exposure) => (
            <CardActionArea
              key={exposure}
              onClick={() => handleCardSelect(exposure)}
              sx={{
                backgroundColor: isButtonSelected(exposure) ? "secondary.main" : "secondary.light",
                borderRadius: (theme) => theme.spacing(1),
                my: 1,
                mx: 0,
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
                {t(`card_exposure_economic_${exposure}`)}
              </Typography>
            </CardActionArea>
          ))}
        </Box>

        {/* Load button section */}
        {selectedCountry && selectedHazard && selectedAppOption === "explore" && (
          <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "center" }}>
            <Button
              component="span"
              onClick={handleLoadButtonClick}
              sx={{
                bgcolor: "secondary.bg",
                color: "common.black",
                fontWeight: "bold",
                margin: 2,
                "&:hover": { bgcolor: "secondary.light" },
                transition: layoutTransition(["transform"]),
                "&:active": {
                  transform: "scale(0.96)", // Slightly scale down when clicked
                },
              }}
              variant="contained"
            >
              {t("card_exposure_economic_load_button")}
            </Button>
            <input
              accept=".xlsx"
              hidden
              id="exposure-economic-contained-button-file"
              multiple={false}
              onChange={handleFileChange}
              type="file"
            />
          </Box>
        )}

        {/* Fetch button section */}
        {/* Remove until further notice */}
        {false && (
          <Box>
            <Button
              component="span"
              sx={{
                bgcolor: "secondary.bg",
                color: "common.black",
                fontWeight: "bold",
                margin: 2,
                "&:hover": { bgcolor: "secondary.light" },
                transition: layoutTransition(["transform"]),
                "&:active": {
                  transform: "scale(0.96)", // Slightly scale down when clicked
                },
              }}
              variant="contained"
              onClick={handleFetchButtonClick}
              disabled={true}
            >
              {t("card_exposure_economic_fetch_button")}
            </Button>
          </Box>
        )}

        {/* Display uploaded file name section */}
        {selectedExposureFile && selectedAppOption === "explore" && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              marginTop: 2,
            }}
          >
            <Typography variant="body2" color="text.primary" sx={{ textAlign: "center" }}>
              {t("card_exposure_economic_upload_file")}: {selectedExposureFile}
            </Typography>
            <IconButton
              onClick={clearUploadedFile}
              size="small"
              sx={{ color: "secondary.dark" }}
              aria-label={t("clear_uploaded_file_aria")}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        )}

        {/* Display fetch Exposure data message section */}
        {fetchExposureMessage && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              marginTop: 2,
            }}
          >
            <Typography variant="body2" color="text.primary" sx={{ textAlign: "center" }}>
              {t("card_exposure_economic_fetch_exposure")}: {fetchExposureMessage}
            </Typography>
            <IconButton
              onClick={clearFetchedData}
              size="small"
              sx={{ color: "secondary.dark" }}
              aria-label={t("clear_fetched_data_aria")}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        )}

        {/* Remarks section */}
        <Box
          sx={{
            padding: 2,
            backgroundColor: "surface.muted",
            borderRadius: (theme) => theme.spacing(1),
          }}
        >
          <Typography variant="body2" color="text.primary">
            {t("card_exposure_economic_remarks")}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ExposureEconomicCard;
