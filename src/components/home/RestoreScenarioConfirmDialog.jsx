import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

const RestoreScenarioConfirmDialog = ({ row, onCancel, onConfirm, busy }) => {
  const { t } = useTranslation();

  return (
    <Dialog
      open={Boolean(row)}
      onClose={busy ? undefined : onCancel}
      aria-labelledby="home-restore-confirm-title"
      data-testid="home-restore-confirm-dialog"
    >
      <DialogTitle id="home-restore-confirm-title">{t("home_restore_confirm_title")}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t("home_restore_confirm_body", { name: row?.name || row?.id || "" })}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy} data-testid="home-restore-confirm-cancel">
          {t("cancel")}
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={() => row && onConfirm(row)}
          disabled={busy}
          data-testid="home-restore-confirm-action"
        >
          {t("home_restore_confirm_action")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

RestoreScenarioConfirmDialog.propTypes = {
  row: PropTypes.object,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  busy: PropTypes.bool,
};

export default RestoreScenarioConfirmDialog;
