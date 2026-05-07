import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Box,
  Button,
  Collapse,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

// Settings panel for the diagnostics flows (issues #119 and #300).
//
// Two paths share the same bundle:
//  - "Send to Support" (primary)   uploads the ZIP to Sentry as an
//                                  attachment via `diagnostics.sendToSupport`.
//                                  The click is scoped consent for THIS
//                                  payload — it does NOT flip persisted
//                                  auto-Sentry consent.
//  - "Export Diagnostics" (secondary) writes the ZIP to disk via
//                                     `diagnostics.exportZip`.
//
// The continuous opt-in toggle from #119 is retained but demoted to an
// "Advanced" collapsible — most users should reach for the manual flow
// first; the streaming toggle is for power users / beta testers.

const DiagnosticsSection = () => {
  const { t } = useTranslation();
  const [sentryStatus, setSentryStatus] = useState(null);
  const [busyExport, setBusyExport] = useState(false);
  const [busySend, setBusySend] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");

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

  const offlineDisabled = sentryStatus?.offline === true;
  const dsnConfigured = sentryStatus?.dsnConfigured === true;
  const optedIn = sentryStatus?.consent === "opted_in";
  const sendDisabled = !dsnConfigured || offlineDisabled;

  const sendDisabledHint = useMemo(() => {
    if (!dsnConfigured) {
      return t("settings_diagnostics_send_no_dsn", {
        defaultValue:
          "Sending is unavailable in this build (no SENTRY_DSN configured). Use Export Diagnostics to save a ZIP locally.",
      });
    }
    if (offlineDisabled) {
      return t("settings_diagnostics_send_offline", {
        defaultValue:
          "Sending is disabled while offline mode is active. Use Export Diagnostics to save a ZIP locally.",
      });
    }
    return null;
  }, [dsnConfigured, offlineDisabled, t]);

  const runExport = useCallback(async () => {
    setBusyExport(true);
    setFeedback(null);
    try {
      const result = await window.electron?.diagnostics?.exportZip();
      if (!result || result.canceled) return null;
      if (result.error) {
        setFeedback({ severity: "error", message: result.error });
        return null;
      }
      setFeedback({
        severity: "success",
        message: t("settings_diagnostics_export_success", {
          defaultValue: "Diagnostics saved to {{path}}",
          path: result.filePath,
        }),
      });
      return result;
    } catch (err) {
      setFeedback({ severity: "error", message: err?.message || String(err) });
      return null;
    } finally {
      setBusyExport(false);
    }
  }, [t]);

  const handleExport = () => {
    runExport();
  };

  const handleSend = async () => {
    setBusySend(true);
    setFeedback(null);
    try {
      const result = await window.electron?.diagnostics?.sendToSupport?.({
        message: message.trim(),
        email: email.trim(),
      });
      if (!result) {
        setFeedback({
          severity: "error",
          message: t("settings_diagnostics_send_unavailable", {
            defaultValue: "Send is unavailable in this build.",
          }),
          fallback: true,
        });
        return;
      }
      if (result.error) {
        setFeedback({ severity: "error", message: result.error, fallback: true });
        return;
      }
      setFeedback({
        severity: "success",
        message: t("settings_diagnostics_send_success", {
          defaultValue: "Diagnostics sent. Reference ID: {{eventId}}",
          eventId: result.eventId || "(unknown)",
        }),
      });
      setMessage("");
      setEmail("");
      setFormOpen(false);
    } catch (err) {
      setFeedback({
        severity: "error",
        message: err?.message || String(err),
        fallback: true,
      });
    } finally {
      setBusySend(false);
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

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6">
          {t("settings_diagnostics_title", { defaultValue: "Diagnostics" })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("settings_diagnostics_subtitle", {
            defaultValue:
              "Send a sanitized bundle of recent logs and system info to support, or save it locally to attach to a bug report. Scenario inputs and outputs are never included.",
          })}
        </Typography>
      </Box>

      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
          <Button
            variant="contained"
            color="primary"
            onClick={() => setFormOpen((v) => !v)}
            disabled={sendDisabled}
            data-testid="diagnostics-send"
            startIcon={busySend ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {t("settings_diagnostics_send", { defaultValue: "Send to Support" })}
          </Button>
          <Button
            variant="outlined"
            onClick={handleExport}
            disabled={busyExport}
            data-testid="diagnostics-export"
            startIcon={busyExport ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {t("settings_diagnostics_export", { defaultValue: "Export Diagnostics" })}
          </Button>
        </Stack>
        {sendDisabledHint ? (
          <Typography variant="caption" color="text.secondary">
            {sendDisabledHint}
          </Typography>
        ) : null}

        <Collapse in={formOpen && !sendDisabled} unmountOnExit>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              label={t("settings_diagnostics_send_message", {
                defaultValue: "What went wrong? (optional)",
              })}
              multiline
              minRows={3}
              fullWidth
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              slotProps={{ htmlInput: { "data-testid": "diagnostics-send-message" } }}
            />
            <TextField
              label={t("settings_diagnostics_send_email", {
                defaultValue: "Reply email (optional)",
              })}
              type="email"
              fullWidth
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              slotProps={{ htmlInput: { "data-testid": "diagnostics-send-email" } }}
            />
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSend}
                disabled={busySend}
                data-testid="diagnostics-send-confirm"
                startIcon={busySend ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {t("settings_diagnostics_send_confirm", { defaultValue: "Send now" })}
              </Button>
              <Button onClick={() => setFormOpen(false)} disabled={busySend}>
                {t("settings_diagnostics_send_cancel", { defaultValue: "Cancel" })}
              </Button>
            </Stack>
          </Stack>
        </Collapse>
      </Stack>

      {feedback ? (
        <Alert
          severity={feedback.severity}
          onClose={() => setFeedback(null)}
          action={
            feedback.fallback ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  setFeedback(null);
                  runExport();
                }}
                data-testid="diagnostics-send-fallback"
              >
                {t("settings_diagnostics_send_fallback", {
                  defaultValue: "Save locally instead",
                })}
              </Button>
            ) : null
          }
        >
          {feedback.message}
        </Alert>
      ) : null}

      <Box>
        <Button
          size="small"
          variant="text"
          onClick={() => setAdvancedOpen((v) => !v)}
          data-testid="diagnostics-advanced-toggle"
        >
          {advancedOpen
            ? t("settings_diagnostics_advanced_hide", { defaultValue: "Hide advanced" })
            : t("settings_diagnostics_advanced_show", {
                defaultValue: "Advanced: continuous crash reporting",
              })}
        </Button>
        <Collapse in={advancedOpen} unmountOnExit>
          <Box sx={{ mt: 1 }}>
            <Typography variant="subtitle2">
              {t("settings_diagnostics_crash_title", {
                defaultValue: "Continuous crash reporting",
              })}
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
                          "You are sending anonymous crash reports automatically. See docs/privacy.md for details.",
                      })
                    : t("settings_diagnostics_crash_optedout", {
                        defaultValue:
                          "Continuous crash reporting is off. The Send to Support button above still works for one-off reports.",
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
        </Collapse>
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
