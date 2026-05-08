import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  Stack,
  Switch,
  Typography,
} from "@mui/material";

import useUIStore from "../../store/useUIStore";

// Settings panel that drives offline mode and surfaces the per-pack
// signature-verification results from the startup scan. The toggle is
// a thin wrapper over the `electron.offline` IPC bridge — the source
// of truth lives in `electron-store` on the main side so the setting
// survives a missing DB.

const OfflineSection = () => {
  const { t } = useTranslation();
  const offlineMode = useUIStore((s) => s.offlineMode);
  const offlineTilesPath = useUIStore((s) => s.offlineTilesPath);
  const offlineImportedPacks = useUIStore((s) => s.offlineImportedPacks);
  const applyOfflineStatus = useUIStore((s) => s.applyOfflineStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const bridge = window.electron?.offline;
    if (!bridge?.getStatus) return;
    try {
      const status = await bridge.getStatus();
      applyOfflineStatus(status);
    } catch (err) {
      setError(err?.message || String(err));
    }
  }, [applyOfflineStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleToggle = async (event) => {
    const enabled = event.target.checked;
    setBusy(true);
    setError(null);
    try {
      const status = await window.electron?.offline?.setEnabled(enabled);
      if (status?.error) {
        setError(status.error);
      } else {
        applyOfflineStatus(status);
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  // The main side broadcasts a fresh status after the rescan completes,
  // which the OfflineIndicator's subscription pipes through
  // `applyOfflineStatus` — no manual payload reassembly needed here.
  const handleRescan = async () => {
    setBusy(true);
    try {
      await window.electron?.dataPacks?.rescan();
    } finally {
      setBusy(false);
    }
  };

  const tileWarning = offlineMode && !offlineTilesPath;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6">
          {t("settings_offline_title", { defaultValue: "Offline mode" })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("settings_offline_subtitle", {
            defaultValue:
              "Run RISK WISE without internet access. App update checks, the CLIMADA Client API, and the remote map tiles are disabled while this is on.",
          })}
        </Typography>
      </Box>

      <FormControlLabel
        control={
          <Switch
            checked={Boolean(offlineMode)}
            onChange={handleToggle}
            disabled={busy}
            data-testid="offline-toggle"
            slotProps={{
              input: {
                "aria-label": t("settings_offline_toggle_aria", {
                  defaultValue: "Enable offline mode",
                }),
              },
            }}
          />
        }
        label={
          busy ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={16} />
              <span>{t("settings_offline_toggle_label", { defaultValue: "Offline mode" })}</span>
            </Stack>
          ) : (
            t("settings_offline_toggle_label", { defaultValue: "Offline mode" })
          )
        }
      />

      {error ? <Alert severity="error">{error}</Alert> : null}

      {tileWarning ? (
        <Alert severity="warning">
          <AlertTitle>
            {t("settings_offline_tiles_missing_title", {
              defaultValue: "No offline map tiles bundled",
            })}
          </AlertTitle>
          {t("settings_offline_tiles_missing_body", {
            defaultValue:
              "This is the lean (online) installer. Maps will fall back to the remote CDN until you install the offline tile pack — see docs/reference/offline.md for the download URL and expected SHA-256.",
          })}
        </Alert>
      ) : null}

      <Box>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="subtitle1">
            {t("settings_offline_packs_title", { defaultValue: "Imported data packs" })}
          </Typography>
          <Button variant="outlined" size="small" onClick={handleRescan} disabled={busy}>
            {t("settings_offline_packs_rescan", { defaultValue: "Rescan" })}
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t("settings_offline_packs_help", {
            defaultValue:
              "Drop signed .riskwise-pack files (with their .minisig sidecars) into %APPDATA%/RISK WISE/packs/ and click Rescan.",
          })}
        </Typography>

        {offlineImportedPacks.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t("settings_offline_packs_empty", { defaultValue: "No packs imported yet." })}
          </Typography>
        ) : (
          <List dense>
            {offlineImportedPacks.map((entry) => (
              <ListItem key={entry.pack || entry.name}>
                <ListItemText
                  primary={entry.pack || entry.name}
                  secondary={
                    entry.ok
                      ? t("settings_offline_packs_ok", {
                          defaultValue: "Verified · extracted to {{dest}}",
                          dest: entry.destDir || "user-data",
                        })
                      : t("settings_offline_packs_rejected", {
                          defaultValue: "Rejected: {{error}}",
                          error: entry.error,
                        })
                  }
                  slotProps={{
                    secondary: {
                      color: entry.ok ? "text.secondary" : "error.main",
                    },
                  }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Stack>
  );
};

export default OfflineSection;
