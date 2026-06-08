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

// Confirmation gate for "Downgrade to previous version" (issue #564). Mirrors
// the existing confirm-dialog pattern (RestoreScenarioConfirmDialog). The
// target version is shown in the title so the user knows exactly which version
// they're rolling back to before the app quits and the installer runs.
const DowngradeConfirmDialog = ({ version, onCancel, onConfirm, busy }) => {
  const { t } = useTranslation();

  return (
    <Dialog
      open={Boolean(version)}
      onClose={busy ? undefined : onCancel}
      aria-labelledby="settings-downgrade-confirm-title"
      data-testid="settings-downgrade-confirm-dialog"
    >
      <DialogTitle id="settings-downgrade-confirm-title">
        {t("settings_updates_downgrade_confirm_title", {
          version,
          defaultValue: "Downgrade to v{{version}}?",
        })}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t("settings_updates_downgrade_confirm_body", {
            version,
            defaultValue:
              "The app will close and reinstall v{{version}}. Your database is backed up first as a safety net.",
          })}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy} data-testid="settings-downgrade-confirm-cancel">
          {t("cancel", { defaultValue: "Cancel" })}
        </Button>
        <Button
          variant="contained"
          color="warning"
          onClick={onConfirm}
          disabled={busy}
          data-testid="settings-downgrade-confirm-action"
        >
          {t("settings_updates_downgrade_confirm_action", { defaultValue: "Downgrade" })}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

DowngradeConfirmDialog.propTypes = {
  version: PropTypes.string,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  busy: PropTypes.bool,
};

export default DowngradeConfirmDialog;
