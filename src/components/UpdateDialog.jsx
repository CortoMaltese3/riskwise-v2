import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

// Consent dialog for auto-updates (issue #115, Area 13). Mounted globally
// so it can appear regardless of which view is active. The main process
// dispatches `update:available` through the preload bridge; we show the
// dialog, never auto-restart, and either arm install-on-quit or snooze
// the reminder for 24h.
const UpdateDialog = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const bridge = window.electron?.updates;
    if (!bridge?.onAvailable) return undefined;
    const unsubscribe = bridge.onAvailable((payload) => {
      setVersion(payload?.version ?? null);
      setOpen(true);
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const handleInstall = async () => {
    setBusy(true);
    try {
      await window.electron?.updates?.installOnNextRestart();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const handleRemind = async () => {
    setBusy(true);
    try {
      await window.electron?.updates?.remindLater();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleRemind}
      aria-labelledby="update-dialog-title"
      aria-describedby="update-dialog-description"
    >
      <DialogTitle id="update-dialog-title">
        {t("update_dialog_title", {
          version: version || "",
          defaultValue: `A new version is available (v${version || "?"})`,
        })}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="update-dialog-description">
          {t("update_dialog_body", {
            defaultValue:
              "RISK WISE can install this update the next time you close the app. You will not be interrupted.",
          })}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleRemind} disabled={busy} color="inherit">
          {t("update_dialog_remind", { defaultValue: "Remind me later" })}
        </Button>
        <Button onClick={handleInstall} disabled={busy} variant="contained">
          {t("update_dialog_install", { defaultValue: "Install on next restart" })}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UpdateDialog;
