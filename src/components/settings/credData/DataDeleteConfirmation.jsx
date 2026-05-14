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

const DataDeleteConfirmation = ({ dataset, onCancel, onConfirm, busy }) => {
  const { t } = useTranslation();

  return (
    <Dialog open={Boolean(dataset)} onClose={onCancel} aria-labelledby="cred-delete-title">
      <DialogTitle id="cred-delete-title">{t("settings_cred_data_delete_title")}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t("settings_cred_data_delete_body", {
            name: dataset?.name ?? "",
          })}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t("cancel")}</Button>
        <Button
          color="error"
          variant="contained"
          onClick={() => dataset && onConfirm(dataset)}
          disabled={busy !== null}
        >
          {t("settings_cred_data_delete_action")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DataDeleteConfirmation;
