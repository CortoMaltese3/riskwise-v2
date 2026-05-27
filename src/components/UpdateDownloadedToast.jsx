import React, { forwardRef, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Snackbar, Stack, Typography } from "@mui/material";
import MuiAlert from "@mui/material/Alert";

// Post-download confirmation for the auto-update flow (issue #423, ADR §4.3).
// Without this, users who accepted "Install on next restart" got no feedback
// that the download actually succeeded — install-on-quit stays armed silently.
//
// The toast surfaces an opt-in "Restart now" shortcut alongside "Dismiss";
// neither path changes the install-on-quit contract that's already armed by
// the main process when `update-downloaded` fires.
const Alert = forwardRef(function Alert(props, ref) {
  return <MuiAlert elevation={6} ref={ref} variant="filled" severity="success" {...props} />;
});

const UpdateDownloadedToast = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const bridge = window.electron?.updates;
    if (!bridge?.onDownloaded) return undefined;
    const unsubscribe = bridge.onDownloaded((payload) => {
      setVersion(payload?.version ?? null);
      setOpen(true);
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setOpen(false);
  }, []);

  const handleRestart = useCallback(async () => {
    setBusy(true);
    try {
      await window.electron?.updates?.quitAndInstallNow();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }, []);

  if (!open) return null;

  const versionLabel = version || "?";

  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Snackbar
        open
        autoHideDuration={null}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={handleDismiss}
          sx={{ width: "100%" }}
          action={
            <>
              <Button color="inherit" size="small" onClick={handleRestart} disabled={busy}>
                {t("update_downloaded_restart", { defaultValue: "Restart now" })}
              </Button>
              <Button color="inherit" size="small" onClick={handleDismiss} disabled={busy}>
                {t("update_downloaded_dismiss", { defaultValue: "Dismiss" })}
              </Button>
            </>
          }
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t("update_downloaded_title", {
              version: versionLabel,
              defaultValue: `Update v${versionLabel} ready`,
            })}
          </Typography>
          <Typography variant="caption" sx={{ display: "block" }}>
            {t("update_downloaded_body", {
              defaultValue:
                "RISK WISE will install when you close it. You can restart now to install immediately.",
            })}
          </Typography>
        </Alert>
      </Snackbar>
    </Stack>
  );
};

export default UpdateDownloadedToast;
