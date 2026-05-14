import React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

const DataDeleteConfirmation = ({ entry, onCancel, onConfirm, busy }) => {
  const { t } = useTranslation();

  return (
    <Dialog open={Boolean(entry)} onClose={onCancel} aria-labelledby="confirm-delete-title">
      <DialogTitle id="confirm-delete-title">{t("settings_custom_data_delete_title")}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t("settings_custom_data_delete_body", {
            country: entry?.country_name ?? "",
            iso3: entry?.iso3 ?? "",
          })}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t("cancel")}</Button>
        <Button
          color="error"
          variant="contained"
          onClick={() => entry && onConfirm(entry)}
          disabled={busy !== null}
        >
          {t("settings_custom_data_delete_action")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DataDeleteConfirmation;
