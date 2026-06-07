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
  Typography,
} from "@mui/material";
import ReactMarkdown from "react-markdown";

import { requestUpdateDownload } from "../store/useUpdateStore";

// First N newline-delimited lines of `body`. Per ADR §4.2 the dialog
// preview is six lines; the full notes still live in the Updates panel.
const RELEASE_NOTES_PREVIEW_LINES = 6;
const previewNotes = (body) => {
  if (typeof body !== "string" || !body) return "";
  return body.split("\n").slice(0, RELEASE_NOTES_PREVIEW_LINES).join("\n");
};

// Consent dialog for auto-updates (issue #115, Area 13). Mounted globally so
// it can appear regardless of which view is active. The main process
// dispatches `update:available`; we show the dialog, never auto-restart, and
// either start the download, snooze the reminder for 24h, or persist a
// per-version skip (issue #424).
//
// On consent the dialog hands off to UpdateProgressChip (a non-modal status
// chip) and closes immediately, so the user can keep working while the
// download runs — instead of staring at a blocked modal. Download progress,
// the "Restart now" prompt, and the error/retry path all live in the chip.
//
// Dismissal (backdrop / Escape) only closes the dialog; the 24h snooze is
// reserved for the explicit "Remind me later" button.
const UpdateDialog = () => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);

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

  const handleInstall = () => {
    // Kick off the download (tracked by the progress chip) and step out of the
    // way. requestUpdateDownload self-manages progress/error state.
    requestUpdateDownload(version);
    setOpen(false);
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

  // Backdrop click / Escape: close only — never persist the 24h snooze (that
  // is the explicit "Remind me later" button's job).
  const handleClose = () => setOpen(false);

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
              "The update downloads in the background. Keep RISK WISE open until it finishes; it installs when you next close the app.",
          })}
        </DialogContentText>
        {notesLoading ? (
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
          {t("update_dialog_install", { defaultValue: "Download & install on restart" })}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UpdateDialog;
