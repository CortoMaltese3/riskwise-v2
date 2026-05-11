// Locale-bound number/currency formatters keyed by the user's persisted
// report-formatting settings (#351). On mount the hook fetches
// `/api/v1/settings` and stays on the defaults while in flight or on error —
// the defaults are valid BCP-47/ISO 4217 tags so the renderer keeps producing
// sensible output if the API hiccups.

import { useEffect, useMemo, useState } from "react";

import {
  formatCurrency as formatCurrencyRaw,
  formatNumber as formatNumberRaw,
  type FormatNumberOptions,
} from "../lib/formatNumber";
import { DEFAULT_USER_SETTINGS, isSettingsEnvelope, type UserSettings } from "../lib/userSettings";

export interface UseReportLocaleApi {
  locale: string;
  currency: string;
  formatNumber: (value: number, options?: FormatNumberOptions) => string;
  formatCurrency: (value: number, options?: FormatNumberOptions) => string;
}

export function useReportLocale(): UseReportLocaleApi {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await window.api.http.request<unknown>("GET", "/api/v1/settings", null);
      if (cancelled) return;
      if (res.success && isSettingsEnvelope(res.result)) {
        setSettings(res.result.data);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo<UseReportLocaleApi>(
    () => ({
      locale: settings.report_locale,
      currency: settings.report_currency,
      formatNumber: (value, options) => formatNumberRaw(value, settings.report_locale, options),
      formatCurrency: (value, options) =>
        formatCurrencyRaw(value, settings.report_locale, settings.report_currency, options),
    }),
    [settings]
  );
}

export default useReportLocale;
