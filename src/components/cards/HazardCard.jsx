import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

import RiskWiseClient from "../../lib/RiskWiseClient";
import logger from "../../lib/logger.ts";
import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { selectHazard } from "../../store/orchestrators";
import { layoutTransition } from "../../theme/theme";

const hazardDict = {
  thailand: ["flood", "drought", "heatwaves"],
  egypt: ["flood", "heatwaves"],
};

const HazardCard = () => {
  const { t } = useTranslation();
  const selectedAppOption = useWorkspaceStore((s) => s.selectedAppOption);
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
  const selectedHazardFile = useWorkspaceStore((s) => s.selectedHazardFile);
  const setIsValidHazard = useWorkspaceStore((s) => s.setIsValidHazard);
  const setSelectedHazardFile = useWorkspaceStore((s) => s.setSelectedHazardFile);
  const setAlertMessage = useUIStore((s) => s.setAlertMessage);
  const setAlertSeverity = useUIStore((s) => s.setAlertSeverity);
  const setAlertShowMessage = useUIStore((s) => s.setAlertShowMessage);
  const isScenarioRunning = useResultsStore((s) => s.isScenarioRunning);

  const [fetchHazardMessage, setFetchHazardMessage] = useState("");

  const hazards = hazardDict[selectedCountry] || [];

  const handleCardSelect = async (hazard) => {
    if (selectedHazard === hazard) {
      selectHazard("");
    } else {
      selectHazard(hazard);
    }
    // Clear the temp directory to reset maps
    await window.electron.clearTempDir();
    setSelectedHazardFile("");
    setIsValidHazard(false);
    setFetchHazardMessage("");
  };

  const isButtonSelected = (hazard) => selectedHazard === hazard;

  // Handle click on Load button, checking if hazard is selected
  const handleLoadButtonClick = () => {
    if (!selectedHazard) {
      setAlertMessage(t("alert_message_hazard_card_select_hazard"));
      setAlertSeverity("warning");
      setAlertShowMessage(true);
    } else {
      document.getElementById("hazard-contained-button-file").click();
    }
  };

  // Handle change on file input
  const handleFileChange = (event) => {
    // Reset the value of the fetched Hazard data if existing
    setFetchHazardMessage("");
    setSelectedHazardFile("");
    setIsValidHazard(false);

    const file = event.target.files[0];
    if (file) {
      setSelectedHazardFile(file.name);
      setIsValidHazard(true);
    }
  };

  const clearUploadedFile = () => {
    setSelectedHazardFile("");
    setIsValidHazard(false);
    // Reset the value of the file input to avoid issues when trying to upload the same file
    document.getElementById("hazard-contained-button-file").value = "";
  };

  const clearFetchedData = () => {
    setFetchHazardMessage("");
    setIsValidHazard(false);
  };

  const handleFetchButtonClick = () => {
    // Reset the value of the file input if already selected
    setSelectedHazardFile("");
    setFetchHazardMessage("");
    setIsValidHazard(false);
    RiskWiseClient.validateData({
      country: selectedCountry,
      dataType: selectedHazard,
    })
      .then((response) => {
        setAlertMessage(response.result.status.message);
        response.result.status.code === 2000
          ? setAlertSeverity("success")
          : setAlertSeverity("error");
        setAlertShowMessage(true);
        setFetchHazardMessage(response.result.status.message);
        setIsValidHazard(response.result.status.code === 2000);
      })
      .catch((error) => {
        logger.error("HazardCard: fetchHazardData failed", {
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
          {t("card_hazard_title")}
        </Typography>

        {/* Hazard selection section */}
        <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "center", gap: 2 }}>
          {hazards.map((hazard) => (
            <Tooltip
              key={hazard}
              title={isScenarioRunning ? t("scenario_running_disabled_tooltip") : ""}
              placement="top"
            >
              <span style={{ width: "100%" }}>
                <CardActionArea
                  onClick={() => handleCardSelect(hazard)}
                  disabled={isScenarioRunning}
                  sx={{
                    backgroundColor: isButtonSelected(hazard)
                      ? "secondary.main"
                      : "secondary.light",
                    borderRadius: (theme) => theme.spacing(1),
                    textAlign: "center",
                    py: 1,
                    px: 0,
                    transition: layoutTransition(["transform"]),
                    "&:active": {
                      transform: "scale(0.96)", // Slightly scale down when clicked
                    },
                  }}
                >
                  <Typography variant="body1" color="text.primary">
                    {t(`card_hazard_${hazard}`)}
                  </Typography>
                </CardActionArea>
              </span>
            </Tooltip>
          ))}
        </Box>

        {/* Load button section */}
        {selectedCountry && selectedAppOption === "explore" && (
          <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "center" }}>
            <Tooltip
              title={isScenarioRunning ? t("scenario_running_disabled_tooltip") : ""}
              placement="top"
            >
              <span>
                <Button
                  component="span"
                  onClick={handleLoadButtonClick}
                  disabled={isScenarioRunning}
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
                  {t("card_hazard_load_button")}
                </Button>
              </span>
            </Tooltip>
            <input
              accept=".hdf5,.h5,.mat,.tif"
              hidden
              id="hazard-contained-button-file"
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
              {t("card_hazard_fetch_button")}
            </Button>
          </Box>
        )}

        {/* Display uploaded file name section */}
        {selectedHazardFile && selectedAppOption === "explore" && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              marginTop: 2,
            }}
          >
            <Typography variant="body2" color="text.primary" sx={{ textAlign: "center" }}>
              {t("card_hazard_upload_file")}: {selectedHazardFile}
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
        {fetchHazardMessage && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              marginTop: 2,
            }}
          >
            <Typography variant="body2" color="text.primary" sx={{ textAlign: "center" }}>
              {t("card_hazard_fetch_exposure")}: {fetchHazardMessage}
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
            {t("card_hazard_remarks")}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default HazardCard;
