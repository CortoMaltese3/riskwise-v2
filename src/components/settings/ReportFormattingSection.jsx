import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";

import { DEFAULT_USER_SETTINGS, isSettingsEnvelope } from "../../lib/userSettings";

// Locale / currency lists must mirror `backend.models.settings`. The Pydantic
// model rejects anything outside this set with a 422 — picking up a new value
// here without adding it server-side surfaces as a save-failure toast.
const LOCALE_OPTIONS = ["en-US", "en-GB", "de-DE", "fr-FR", "es-ES", "th-TH", "ar-EG"];
const CURRENCY_OPTIONS = ["EUR", "USD", "GBP", "CHF", "THB", "EGP"];

const ReportFormattingSection = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(DEFAULT_USER_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await window.api.http.request("GET", "/api/v1/settings", null);
        if (cancelled) return;
        if (res.success && isSettingsEnvelope(res.result)) {
          setSettings(res.result.data);
        } else if (!res.success) {
          setError(res.error?.message ?? "Failed to load settings");
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = async (patch) => {
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    setError(null);
    const res = await window.api.http.request("PATCH", "/api/v1/settings", patch);
    if (!res.success) {
      setSettings(previous);
      setError(res.error?.message ?? "Failed to save settings");
      return;
    }
    if (isSettingsEnvelope(res.result)) {
      setSettings(res.result.data);
    }
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6">{t("settings_report_formatting_title")}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t("settings_report_formatting_helper")}
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction="row" spacing={2} sx={{ maxWidth: 480 }}>
        <FormControl fullWidth size="small">
          <InputLabel id="report-locale-label">
            {t("settings_report_formatting_locale_label")}
          </InputLabel>
          <Select
            labelId="report-locale-label"
            label={t("settings_report_formatting_locale_label")}
            value={settings.report_locale}
            disabled={!loaded}
            onChange={(e) => persist({ report_locale: e.target.value })}
            inputProps={{ "data-testid": "report-locale-select" }}
          >
            {LOCALE_OPTIONS.map((code) => (
              <MenuItem key={code} value={code}>
                {code}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth size="small">
          <InputLabel id="report-currency-label">
            {t("settings_report_formatting_currency_label")}
          </InputLabel>
          <Select
            labelId="report-currency-label"
            label={t("settings_report_formatting_currency_label")}
            value={settings.report_currency}
            disabled={!loaded}
            onChange={(e) => persist({ report_currency: e.target.value })}
            inputProps={{ "data-testid": "report-currency-select" }}
          >
            {CURRENCY_OPTIONS.map((code) => (
              <MenuItem key={code} value={code}>
                {code}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>
    </Stack>
  );
};

export default ReportFormattingSection;
