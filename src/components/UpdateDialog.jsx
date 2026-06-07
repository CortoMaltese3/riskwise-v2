import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  Typography,
} from "@mui/material";
import ReactMarkdown from "react-markdown";

// First N newline-delimited lines of `body`. Per ADR §4.2 the dialog
// preview is six lines; the full notes still live in the Updates panel.
const RELEASE_NOTES_PREVIEW_LINES = 6;
const previewNotes = (body) => {
  if (typeof body !== "string" || !body) return "";
  return body.split("\n").slice(0, RELEASE_NOTES_PREVIEW_LINES).join("\n");
};

const clampPercent = (value) => {
  const pct = Number(value);
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
};

// Consent dialog for auto-updates (issue #115, Area 13). Mounted globally
// so it can appear regardless of which view is active. The main process
// dispatches `update:available` through the preload bridge; we show the
// dialog, never auto-restart, and either arm install-on-quit, snooze the
// reminder for 24h, or persist a per-version skip (issue #424).
//
// Dismissal semantics (field-testing fix): an incidental dismissal —
// backdrop click or Escape — only closes the dialog for now; it does NOT
// persist the 24h snooze. The snooze is reserved for the explicit
// "Remind me later" button. Previously `onClose` was wired to the snooze,
// so a stray click (even one fired while a download triggered by "Install"
// was still running) hid updates for a full day.
const UpdateDialog = () => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  // Download state for the "Install on next restart" flow. `installOnNextRestart`
  // resolves only when the full download completes, so we surface progress and
  // a "keep the app open" hint to stop users closing the app mid-download.
  const [downloading, setDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    const bridge = window.electron?.updates;
    if (!bridge?.onAvailable) return undefined;
    const unsubscribe = bridge.onAvailable((payload) => {
      setVersion(payload?.version ?? null);
      setDownloading(false);
      setDownloadPercent(0);
      setDownloadError(false);
      setOpen(true);
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    const bridge = window.electron?.updates;
    if (!bridge?.onDownloadProgress) return undefined;
    const unsubscribe = bridge.onDownloadProgress((payload) => {
      setDownloadPercent(clampPercent(payload?.percent));
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const bridge = window.electron?.updates;
    if (!bridge?.getReleaseNotes) return undefined;
    let cancelled = false;
    setNotesLoading(true);
    setNotes("");
    bridge
      .getReleaseNotes({ language: i18n?.language || "en" })
      .then((result) => {
        if (cancelled) return;
        if (result && !result.error && typeof result.body === "string") {
          setNotes(previewNotes(result.body));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setNotesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, i18n?.language]);

  const handleInstall = async () => {
    setBusy(true);
    setDownloading(true);
    setDownloadPercent(0);
    setDownloadError(false);
    try {
      const result = await window.electron?.updates?.installOnNextRestart();
      if (result && result.error) {
        // Keep the dialog open so the user sees the failure and can retry,
        // rather than silently leaving them on the old version.
        setDownloadError(true);
        return;
      }
      // Download complete; the UpdateDownloadedToast ("Restart now") takes over.
      setOpen(false);
    } catch {
      setDownloadError(true);
    } finally {
      setBusy(false);
      setDownloading(false);
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

  const handleSkip = async () => {
    if (!version) return;
    setBusy(true);
    try {
      await window.electron?.updates?.skipVersion(version);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  // Backdrop click / Escape. Never abort an in-progress download and never
  // persist the 24h snooze — just close. The reminder is only snoozed by the
  // explicit "Remind me later" button.
  const handleClose = () => {
    if (downloading) return;
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
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
        {downloading ? (
          <Box sx={{ mt: 2 }} data-testid="update-dialog-downloading">
            <Typography variant="body2" sx={{ mb: 1 }}>
              {t("update_dialog_downloading", {
                percent: Math.round(downloadPercent),
                defaultValue: `Downloading update… ${Math.round(downloadPercent)}%`,
              })}
            </Typography>
            <LinearProgress variant="determinate" value={downloadPercent} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
              {t("update_dialog_downloading_hint", {
                defaultValue:
                  "Please keep RISK WISE open. The update installs when you close the app.",
              })}
            </Typography>
          </Box>
        ) : downloadError ? (
          <Typography
            variant="body2"
            color="error"
            sx={{ mt: 2 }}
            data-testid="update-dialog-download-error"
          >
            {t("update_dialog_download_error", {
              defaultValue: "The download failed. Please check your connection and try again.",
            })}
          </Typography>
        ) : notesLoading ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 2 }}
            data-testid="update-dialog-notes-loading"
          >
            {t("update_dialog_notes_loading", { defaultValue: "Loading release notes…" })}
          </Typography>
        ) : notes ? (
          <Box data-testid="update-dialog-notes" sx={{ mt: 2, "& p": { mt: 0.5, mb: 0.5 } }}>
            <ReactMarkdown>{notes}</ReactMarkdown>
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={handleSkip}
          disabled={busy || !version}
          variant="text"
          color="inherit"
          sx={{ mr: "auto", textTransform: "none", textDecoration: "underline" }}
        >
          {t("update_dialog_skip", { defaultValue: "Skip this version" })}
        </Button>
        <Button onClick={handleRemind} disabled={busy} color="inherit">
          {t("update_dialog_remind", { defaultValue: "Remind me later" })}
        </Button>
        <Button onClick={handleInstall} disabled={busy} variant="contained" autoFocus>
          {downloading
            ? t("update_dialog_installing", { defaultValue: "Downloading…" })
            : t("update_dialog_install", { defaultValue: "Install on next restart" })}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UpdateDialog;
