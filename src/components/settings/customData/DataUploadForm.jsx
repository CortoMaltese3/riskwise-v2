import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Typography,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";

import { layoutTransition } from "../../../theme/theme";

const DataUploadForm = ({
  busy,
  isDragging,
  validation,
  pendingPath,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
  onConfirmImport,
  onDismiss,
}) => {
  const { t } = useTranslation();

  const dropZoneSx = useMemo(
    () => ({
      border: 2,
      borderStyle: "dashed",
      borderColor: isDragging ? "primary.main" : "divider",
      borderRadius: 2,
      p: 4,
      textAlign: "center",
      cursor: "pointer",
      bgcolor: isDragging ? "action.hover" : "transparent",
      transition: layoutTransition(["background-color", "border-color"]),
    }),
    [isDragging]
  );

  const showErrors = validation && !validation.valid && validation.errors?.length > 0;
  const importOpen = Boolean(validation?.valid && pendingPath);

  return (
    <>
      <Box
        // The drop zone container is decorative: the inner <Button> handles
        // both keyboard activation and screen-reader access to the browse
        // action. Giving the container its own `role="button"` produced a
        // nested-interactive WCAG violation (issue #121). Drag/drop is a
        // pointer-only enhancement; keyboard users use the inner button.
        aria-label={t("settings_custom_data_dropzone_aria")}
        sx={dropZoneSx}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <CloudUploadIcon sx={{ fontSize: 40, color: "text.secondary" }} />
        <Typography variant="body1" sx={{ mt: 1 }}>
          {t("settings_custom_data_dropzone_headline")}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {t("settings_custom_data_dropzone_hint")}
        </Typography>
        <Button
          variant="contained"
          sx={{ mt: 2 }}
          disabled={busy !== null}
          onClick={(e) => {
            e.stopPropagation();
            onBrowse();
          }}
        >
          {busy === "validating" ? (
            <CircularProgress size={18} sx={{ color: "inherit" }} />
          ) : (
            t("settings_custom_data_browse")
          )}
        </Button>
      </Box>

      {showErrors && (
        <Alert severity="error" variant="outlined">
          <AlertTitle>{t("settings_custom_data_invalid_title")}</AlertTitle>
          <List dense disablePadding>
            {validation.errors.map((err, idx) => (
              <ListItem key={idx} sx={{ py: 0 }}>
                <ListItemText primary={err} primaryTypographyProps={{ variant: "body2" }} />
              </ListItem>
            ))}
          </List>
        </Alert>
      )}

      <Dialog
        open={importOpen}
        onClose={() => {
          if (busy !== "importing") onDismiss();
        }}
        aria-labelledby="confirm-import-title"
      >
        <DialogTitle id="confirm-import-title">
          {t("settings_custom_data_confirm_title")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("settings_custom_data_confirm_body", {
              country: validation?.country_name ?? "",
              iso3: validation?.iso3 ?? "",
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={onDismiss} disabled={busy === "importing"}>
            {t("cancel")}
          </Button>
          <Button
            onClick={onConfirmImport}
            variant="contained"
            disabled={busy === "importing"}
            autoFocus
          >
            {busy === "importing" ? (
              <CircularProgress size={18} sx={{ color: "inherit" }} />
            ) : (
              t("settings_custom_data_confirm_action")
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DataUploadForm;
