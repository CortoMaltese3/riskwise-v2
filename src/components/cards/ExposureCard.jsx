import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { layoutTransition } from "../../theme/theme";
import { exposureCategoryMap, getExposuresForSelection } from "../../data/exposureCatalog";

const ExposureCard = () => {
  const selectedAppOption = useWorkspaceStore((s) => s.selectedAppOption);
  const isScenarioRunning = useResultsStore((s) => s.isScenarioRunning);
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedExposure = useWorkspaceStore((s) => s.selectedExposure);
  const selectedExposureFile = useWorkspaceStore((s) => s.selectedExposureFile);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
  const setIsValidExposure = useWorkspaceStore((s) => s.setIsValidExposure);
  const setSelectedExposure = useWorkspaceStore((s) => s.setSelectedExposure);
  const setSelectedExposureCategory = useWorkspaceStore((s) => s.setSelectedExposureCategory);
  const setSelectedExposureFile = useWorkspaceStore((s) => s.setSelectedExposureFile);
  const setAlertMessage = useUIStore((s) => s.setAlertMessage);
  const setAlertSeverity = useUIStore((s) => s.setAlertSeverity);
  const setAlertShowMessage = useUIStore((s) => s.setAlertShowMessage);
  const { t } = useTranslation();

  // Pending custom upload — opens the category-pick dialog before we accept
  // the file. `null` means "no upload in progress".
  const [pendingUpload, setPendingUpload] = useState(null);

  const exposures = getExposuresForSelection(selectedCountry, selectedHazard);

  const handleCardSelect = (asset) => {
    if (selectedExposure === asset) {
      setSelectedExposure("");
      setSelectedExposureCategory(null);
    } else {
      setSelectedExposure(asset);
      setSelectedExposureCategory(exposureCategoryMap[asset] ?? null);
    }
    setSelectedExposureFile("");
    setIsValidExposure(false);
  };

  const isAssetSelected = (asset) => selectedExposure === asset;

  const handleLoadButtonClick = () => {
    if (!selectedExposure) {
      setAlertMessage(t("alert_message_exposure_card_select_asset"));
      setAlertSeverity("warning");
      setAlertShowMessage(true);
    } else {
      document.getElementById("exposure-contained-button-file").click();
    }
  };

  const resetFileInput = () => {
    const input = document.getElementById("exposure-contained-button-file");
    if (input) input.value = "";
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    // For catalog assets we already know the category; bypass the dialog and
    // accept immediately. For Custom uploads (the user typed a key not in the
    // catalog, or selectedExposure is empty) prompt for the category.
    const knownCategory = exposureCategoryMap[selectedExposure];
    if (knownCategory) {
      setSelectedExposureFile(file.name);
      setIsValidExposure(true);
      return;
    }
    setPendingUpload(file);
  };

  const confirmCustomCategory = (category) => {
    if (!pendingUpload) return;
    setSelectedExposureFile(pendingUpload.name);
    setSelectedExposureCategory(category);
    setIsValidExposure(true);
    setPendingUpload(null);
  };

  const cancelCustomCategory = () => {
    setPendingUpload(null);
    resetFileInput();
  };

  const clearUploadedFile = () => {
    setSelectedExposureFile("");
    setIsValidExposure(false);
    resetFileInput();
  };

  const renderAssetButton = (asset) => (
    <Tooltip
      key={asset}
      title={isScenarioRunning ? t("scenario_running_disabled_tooltip") : ""}
      placement="top"
    >
      <span style={{ display: "block", width: "100%" }}>
        <CardActionArea
          onClick={() => handleCardSelect(asset)}
          disabled={isScenarioRunning}
          sx={{
            backgroundColor: isAssetSelected(asset) ? "secondary.main" : "secondary.light",
            borderRadius: (theme) => theme.spacing(1),
            my: 1,
            mx: 0,
            textAlign: "center",
            py: 1,
            px: 0,
            transition: layoutTransition(["transform"]),
            "&:active": { transform: "scale(0.96)" },
          }}
        >
          <Typography variant="body1" color="text.primary" sx={{ textAlign: "center" }}>
            {t(`input_exposure_${exposureCategoryMap[asset]}_${asset}`)}
          </Typography>
        </CardActionArea>
      </span>
    </Tooltip>
  );

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
          {t("card_exposure_title")}
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {exposures.map(renderAssetButton)}
        </Box>

        {selectedCountry && selectedHazard && selectedAppOption === "explore" && (
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
                    "&:active": { transform: "scale(0.96)" },
                  }}
                  variant="contained"
                >
                  {t("card_exposure_load_button")}
                </Button>
              </span>
            </Tooltip>
            <input
              accept=".xlsx"
              hidden
              id="exposure-contained-button-file"
              multiple={false}
              onChange={handleFileChange}
              type="file"
            />
          </Box>
        )}

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
              {t("card_exposure_upload_file")}: {selectedExposureFile}
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

        <Box
          sx={{
            padding: 2,
            backgroundColor: "surface.muted",
            borderRadius: (theme) => theme.spacing(1),
          }}
        >
          <Typography variant="body2" color="text.primary">
            {t("card_exposure_remarks")}
          </Typography>
        </Box>
      </CardContent>

      <Dialog
        open={Boolean(pendingUpload)}
        onClose={cancelCustomCategory}
        aria-labelledby="custom-exposure-category-dialog-title"
      >
        <DialogTitle id="custom-exposure-category-dialog-title">
          {t("dialog_custom_exposure_category_title")}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Button
              variant="outlined"
              onClick={() => confirmCustomCategory("economic")}
              sx={{ justifyContent: "flex-start" }}
            >
              {t("dialog_custom_exposure_category_economic")}
            </Button>
            <Button
              variant="outlined"
              onClick={() => confirmCustomCategory("non_economic")}
              sx={{ justifyContent: "flex-start" }}
            >
              {t("dialog_custom_exposure_category_non_economic")}
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelCustomCategory}>{t("cancel")}</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default ExposureCard;
