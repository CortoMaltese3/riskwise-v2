import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ReactMarkdown from "react-markdown";

import DowngradeConfirmDialog from "./DowngradeConfirmDialog";

// In-app updates panel (issue #115, Area 13). Reads everything from the
// main process via the preload bridge — no GitHub call goes through the
// renderer. Release notes are fetched on mount, then refreshed when the
// channel changes.
const formatTimestamp = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

const UpdatesPanel = () => {
  const { t, i18n } = useTranslation();
  const language = i18n?.language || "en";

  const [status, setStatus] = useState(null);
  const [notes, setNotes] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  // Outcome of an explicit "Check for updates" click, so the user gets clear
  // feedback (error / up to date / update available) instead of a button that
  // silently spins. Falls back to the last check the main process recorded
  // (e.g. a failed startup check) when the user hasn't clicked yet.
  const [checkResult, setCheckResult] = useState(null);
  // Holds the target version while the downgrade confirmation dialog is open;
  // null when closed. Opening it does not call downgrade — only confirming does.
  const [downgradeTarget, setDowngradeTarget] = useState(null);

  const loadStatus = useCallback(async () => {
    const bridge = window.electron?.updates;
    if (!bridge?.getStatus) return;
    const result = await bridge.getStatus();
    setStatus(result || null);
  }, []);

  const loadNotes = useCallback(
    async (lang) => {
      const bridge = window.electron?.updates;
      if (!bridge?.getReleaseNotes) return;
      setNotesLoading(true);
      try {
        const result = await bridge.getReleaseNotes({ language: lang || language });
        if (result?.error) {
          setError(result.error);
          setNotes(null);
        } else {
          setError(null);
          setNotes(result || null);
        }
      } finally {
        setNotesLoading(false);
      }
    },
    [language]
  );

  useEffect(() => {
    loadStatus();
    loadNotes();
  }, [loadStatus, loadNotes]);

  // Channel switching is intentionally inert for now (#570). The Stable/Beta
  // radios are kept for presentation, but clicking must NOT change the update
  // channel: no beta release train exists yet, so actually switching to Beta
  // would point electron-updater at a non-existent `beta.yml` and silently
  // strand the user with no updates. A documented no-op (rather than removing
  // `onChange`) also avoids React's controlled-without-handler warning. Proper,
  // guarded wiring is tracked in #570.
  const handleChannelChange = () => {};

  const handleCheckNow = async () => {
    setBusy(true);
    setCheckResult(null);
    try {
      const result = await window.electron?.updates?.check();
      setCheckResult(result || null);
      await loadStatus();
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDowngrade = async () => {
    setBusy(true);
    try {
      const result = await window.electron?.updates?.downgrade();
      // On success the app quits and the installer takes over, so there's
      // nothing more to render. We only surface an error if it comes back.
      if (result?.error) setError(result.error);
    } finally {
      setBusy(false);
      setDowngradeTarget(null);
    }
  };

  const channel = status?.channel || "stable";
  const currentVersion = status?.currentVersion || "—";
  const previousVersion = status?.previousVersion || null;
  const downgradeDisabled = busy || !previousVersion;
  const lastChecked = useMemo(() => formatTimestamp(status?.lastChecked), [status]);

  // Prefer the result of an explicit click; otherwise show whatever the main
  // process last recorded (covers a failed/clean startup check on mount).
  const displayedCheck = checkResult ?? status?.lastCheck ?? null;

  const renderCheckAlert = () => {
    if (!displayedCheck) return null;
    if (displayedCheck.skipped === "offline") {
      return (
        <Alert severity="info">
          {t("settings_updates_check_offline", {
            defaultValue: "Offline mode is on — update checks are paused.",
          })}
        </Alert>
      );
    }
    if (displayedCheck.error) {
      return (
        <Alert severity="warning">
          {t("settings_updates_check_error", {
            error: displayedCheck.error,
            defaultValue: "Couldn't check for updates: {{error}}",
          })}
        </Alert>
      );
    }
    if (displayedCheck.status === "available") {
      return (
        <Alert severity="info">
          {t("settings_updates_check_available", {
            version: displayedCheck.version,
            defaultValue: "Update available: v{{version}} — see the prompt to install.",
          })}
        </Alert>
      );
    }
    if (displayedCheck.status === "not-available") {
      return (
        <Alert severity="success">
          {t("settings_updates_check_up_to_date", {
            version: displayedCheck.version || currentVersion,
            defaultValue: "You're on the latest version (v{{version}}).",
          })}
        </Alert>
      );
    }
    return null;
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6">
          {t("settings_updates_title", { defaultValue: "Updates" })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("settings_updates_subtitle", {
            defaultValue:
              "Manage update channel, check for new releases, and review release notes.",
          })}
        </Typography>
      </Box>

      <Stack spacing={1}>
        <Typography variant="subtitle2">
          {t("settings_updates_current_version", { defaultValue: "Current version" })}
        </Typography>
        <Typography variant="body2">
          {t("settings_updates_version_value", {
            version: currentVersion,
            defaultValue: "v{{version}}",
          })}
        </Typography>

        <Typography variant="subtitle2" sx={{ mt: 1 }}>
          {t("settings_updates_last_checked", { defaultValue: "Last checked" })}
        </Typography>
        <Typography variant="body2">{lastChecked}</Typography>
      </Stack>

      <FormControl>
        <FormLabel id="release-channel-label">
          {t("settings_updates_channel", { defaultValue: "Update channel" })}
        </FormLabel>
        <RadioGroup
          aria-labelledby="release-channel-label"
          row
          value={channel}
          onChange={handleChannelChange}
        >
          <FormControlLabel
            value="stable"
            control={<Radio disabled={busy} />}
            label={t("settings_updates_channel_stable", { defaultValue: "Stable" })}
          />
          <FormControlLabel
            value="beta"
            control={<Radio disabled={busy} />}
            label={t("settings_updates_channel_beta", { defaultValue: "Beta" })}
          />
        </RadioGroup>
      </FormControl>

      <Stack direction="row" spacing={2}>
        <Button variant="outlined" onClick={handleCheckNow} disabled={busy}>
          {busy ? (
            <CircularProgress size={18} />
          ) : (
            t("settings_updates_check_now", { defaultValue: "Check for updates" })
          )}
        </Button>
        <Tooltip
          title={
            previousVersion
              ? ""
              : t("settings_updates_downgrade_unavailable", {
                  defaultValue: "No previous version available on this machine.",
                })
          }
        >
          {/* span keeps the tooltip reachable while the button is disabled */}
          <span>
            <Button
              variant="outlined"
              color="warning"
              onClick={() => setDowngradeTarget(previousVersion)}
              disabled={downgradeDisabled}
            >
              {t("settings_updates_downgrade", {
                defaultValue: "Downgrade to previous version",
              })}
            </Button>
          </span>
        </Tooltip>
      </Stack>

      <DowngradeConfirmDialog
        version={downgradeTarget}
        busy={busy}
        onCancel={() => setDowngradeTarget(null)}
        onConfirm={handleConfirmDowngrade}
      />

      {renderCheckAlert()}

      <Box>
        <Typography variant="subtitle1" gutterBottom>
          {t("settings_updates_whats_new", { defaultValue: "What's New" })}
        </Typography>
        {notesLoading ? (
          <CircularProgress size={20} />
        ) : error ? (
          <Alert severity="warning">{error}</Alert>
        ) : notes?.body ? (
          <Box sx={{ "& p": { mt: 0.5, mb: 0.5 } }}>
            <Typography variant="caption" color="text.secondary">
              {notes.tag || notes.name}
            </Typography>
            <ReactMarkdown>{notes.body}</ReactMarkdown>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t("settings_updates_no_notes", { defaultValue: "No release notes available yet." })}
          </Typography>
        )}
      </Box>
    </Stack>
  );
};

export default UpdatesPanel;
