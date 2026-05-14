// Shared shape and defaults for the report-formatting user settings (#351).
// Imported by `useReportLocale` (read path) and `ReportFormattingSection`
// (write path); keep them aligned with `backend/models/settings.py`.

export interface UserSettings {
  report_locale: string;
  report_currency: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  report_locale: "en-US",
  report_currency: "EUR",
};

export interface SettingsEnvelope {
  data: UserSettings;
}

export function isSettingsEnvelope(value: unknown): value is SettingsEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const data = (value as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return false;
  const { report_locale, report_currency } = data as Record<string, unknown>;
  return typeof report_locale === "string" && typeof report_currency === "string";
}
