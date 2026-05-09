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
  TextField,
  Typography,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";

import { layoutTransition } from "../../../theme/theme";

const DataUploadForm = ({
  busy,
  errors,
  pendingPath,
  pendingName,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
  onNameChange,
  onConfirm,
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

  return (
    <>
      <Box
        // Drop zone is a pointer-only enhancement; the inner Browse button
        // owns keyboard activation. Removing role="button"/tabIndex avoids
        // a nested-interactive WCAG violation (issue #121).
        aria-label={t("settings_cred_data_dropzone_aria")}
        sx={dropZoneSx}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <CloudUploadIcon sx={{ fontSize: 40, color: "text.secondary" }} />
        <Typography variant="body1" sx={{ mt: 1 }}>
          {t("settings_cred_data_dropzone_headline")}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {t("settings_cred_data_dropzone_hint")}
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
          {t("settings_cred_data_browse")}
        </Button>
      </Box>

      {errors.length > 0 && (
        <Alert severity="error" variant="outlined" sx={{ mt: 3 }}>
          <AlertTitle>{t("settings_cred_data_invalid_title")}</AlertTitle>
          <List dense disablePadding>
            {errors.map((err, idx) => (
              <ListItem key={idx} sx={{ py: 0 }}>
                <ListItemText primary={err} primaryTypographyProps={{ variant: "body2" }} />
              </ListItem>
            ))}
          </List>
        </Alert>
      )}

      <Dialog
        open={Boolean(pendingPath)}
        onClose={() => {
          if (busy !== "uploading") onDismiss();
        }}
        aria-labelledby="cred-upload-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="cred-upload-title">{t("settings_cred_data_title")}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {t("settings_cred_data_description")}
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            label={t("settings_cred_data_name_label")}
            placeholder={t("settings_cred_data_name_placeholder")}
            value={pendingName}
            onChange={(e) => onNameChange(e.target.value)}
            disabled={busy === "uploading"}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onDismiss} disabled={busy === "uploading"}>
            {t("settings_cred_data_upload_cancel")}
          </Button>
          <Button
            onClick={onConfirm}
            variant="contained"
            disabled={busy === "uploading" || !pendingName.trim()}
            autoFocus
          >
            {busy === "uploading" ? (
              <CircularProgress size={18} sx={{ color: "inherit" }} />
            ) : (
              t("settings_cred_data_upload_action")
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DataUploadForm;
