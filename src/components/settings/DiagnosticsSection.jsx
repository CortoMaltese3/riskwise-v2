import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";

// Settings panel that drives the local diagnostics export and the
// opt-in Sentry crash-reporting toggle (issue #119, Area 17). The bridge
// is intentionally narrow: a single `exportZip` invoke for the ZIP, plus
// `getSentryStatus` / `setSentryConsent` for the consent flow. The DSN
// itself is never exposed to the renderer.

const DiagnosticsSection = () => {
  const { t } = useTranslation();
  const [sentryStatus, setSentryStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [consentOpen, setConsentOpen] = useState(false);

  const refreshStatus = useCallback(async () => {
    const bridge = window.electron?.diagnostics;
    if (!bridge?.getSentryStatus) return;
    try {
      const status = await bridge.getSentryStatus();
      setSentryStatus(status);
      if (status?.shouldPromptConsent) setConsentOpen(true);
    } catch (err) {
      setFeedback({ severity: "error", message: err?.message || String(err) });
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleExport = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await window.electron?.diagnostics?.exportZip();
      if (!result || result.canceled) {
        setBusy(false);
        return;
      }
      if (result.error) {
        setFeedback({ severity: "error", message: result.error });
      } else {
        setFeedback({
          severity: "success",
          message: t("settings_diagnostics_export_success", {
            defaultValue: "Diagnostics saved to {{path}}",
            path: result.filePath,
          }),
        });
      }
    } catch (err) {
      setFeedback({ severity: "error", message: err?.message || String(err) });
    } finally {
      setBusy(false);
    }
  };

  const recordConsent = async (optIn) => {
    setConsentOpen(false);
    try {
      const status = await window.electron?.diagnostics?.setSentryConsent(optIn);
      if (status && !status.error) setSentryStatus(status);
    } catch (err) {
      setFeedback({ severity: "error", message: err?.message || String(err) });
    }
  };

  const offlineDisabled = sentryStatus?.offline === true;
  const dsnConfigured = sentryStatus?.dsnConfigured === true;
  const optedIn = sentryStatus?.consent === "opted_in";

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6">
          {t("settings_diagnostics_title", { defaultValue: "Diagnostics" })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("settings_diagnostics_subtitle", {
            defaultValue:
              "Export a local ZIP with logs, system info, and recent scenario metadata to attach to a bug report. No data is uploaded automatically.",
          })}
        </Typography>
      </Box>

      <Box>
        <Button
          variant="contained"
          onClick={handleExport}
          disabled={busy}
          data-testid="diagnostics-export"
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {t("settings_diagnostics_export", { defaultValue: "Export Diagnostics" })}
        </Button>
      </Box>

      {feedback ? (
        <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      ) : null}

      <Box>
        <Typography variant="subtitle1">
          {t("settings_diagnostics_crash_title", { defaultValue: "Crash reporting" })}
        </Typography>
        {offlineDisabled ? (
          <Alert severity="info" sx={{ mt: 1 }}>
            {t("settings_diagnostics_crash_offline", {
              defaultValue: "Crash reporting disabled in offline mode.",
            })}
          </Alert>
        ) : !dsnConfigured ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t("settings_diagnostics_crash_no_dsn", {
              defaultValue:
                "Crash reporting is not available in this build (no SENTRY_DSN configured).",
            })}
          </Typography>
        ) : (
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {optedIn
                ? t("settings_diagnostics_crash_optedin", {
                    defaultValue:
                      "You are sending anonymous crash reports. See docs/privacy.md for details.",
                  })
                : t("settings_diagnostics_crash_optedout", {
                    defaultValue:
                      "Crash reporting is off. You can opt in to help improve RISK WISE.",
                  })}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                variant={optedIn ? "outlined" : "contained"}
                size="small"
                onClick={() => recordConsent(true)}
                disabled={optedIn}
              >
                {t("settings_diagnostics_crash_optin", { defaultValue: "Opt in" })}
              </Button>
              <Button
                variant={!optedIn ? "outlined" : "contained"}
                size="small"
                onClick={() => recordConsent(false)}
                disabled={!optedIn}
              >
                {t("settings_diagnostics_crash_optout", { defaultValue: "Opt out" })}
              </Button>
            </Stack>
          </Stack>
        )}
      </Box>

      <Dialog open={consentOpen} onClose={() => setConsentOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {t("settings_diagnostics_consent_title", { defaultValue: "Help improve RISK WISE" })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("settings_diagnostics_consent_body", {
              defaultValue:
                "Help improve RISK WISE by sending anonymous crash reports? Reports include the crash stack trace, OS version, and app version. Scenario data, user files, and any personally identifiable information are never sent.",
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => recordConsent(false)}>
            {t("settings_diagnostics_consent_no", { defaultValue: "No thanks" })}
          </Button>
          <Button variant="contained" onClick={() => recordConsent(true)}>
            {t("settings_diagnostics_consent_yes", { defaultValue: "Yes, opt in" })}
          </Button>
        </DialogActions>
      </Dialog>

      <Box>
        <Typography variant="caption" color="text.secondary">
          {t("settings_diagnostics_privacy_link", {
            defaultValue: "See docs/privacy.md for details on what is collected.",
          })}
        </Typography>
      </Box>
    </Stack>
  );
};

export default DiagnosticsSection;
