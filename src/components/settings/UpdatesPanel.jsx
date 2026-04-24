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
  Typography,
} from "@mui/material";
import ReactMarkdown from "react-markdown";

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

  const handleChannelChange = async (event) => {
    const channel = event.target.value;
    setBusy(true);
    try {
      await window.electron?.updates?.setChannel(channel);
      await loadStatus();
      await loadNotes();
    } finally {
      setBusy(false);
    }
  };

  const handleCheckNow = async () => {
    setBusy(true);
    try {
      await window.electron?.updates?.check();
      await loadStatus();
    } finally {
      setBusy(false);
    }
  };

  const handleDowngrade = async () => {
    setBusy(true);
    try {
      const result = await window.electron?.updates?.downgrade();
      if (result?.error) setError(result.error);
    } finally {
      setBusy(false);
    }
  };

  const channel = status?.channel || "stable";
  const currentVersion = status?.currentVersion || "—";
  const lastChecked = useMemo(() => formatTimestamp(status?.lastChecked), [status]);

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
        <Typography variant="body2">v{currentVersion}</Typography>

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
        <Button variant="outlined" color="warning" onClick={handleDowngrade} disabled={busy}>
          {t("settings_updates_downgrade", { defaultValue: "Downgrade to previous version" })}
        </Button>
      </Stack>

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
