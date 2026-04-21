// Locale-aware date formatting with explicit calendar selection.
//   - Thai: Buddhist Era (CE + 543) via `th-TH-u-ca-buddhist`.
//   - All other locales: Gregorian.
//
// Callers must go through this module instead of `Date.prototype.toLocaleDateString`
// so the calendar choice is always explicit. An ESLint rule enforces this.
//
// Example: formatDate(new Date("2025-01-01"), "th") → contains "2568".

type DateInput = Date | string | number;

const THAI_BUDDHIST_LOCALE = "th-TH-u-ca-buddhist";

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

const DEFAULT_DATETIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function toDate(value: DateInput | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function resolveLocale(locale: string | undefined): string {
  if (!locale) return "en";
  if (locale.toLowerCase().startsWith("th")) return THAI_BUDDHIST_LOCALE;
  return locale;
}

export function formatDate(
  value: DateInput | null | undefined,
  locale: string | undefined = "en",
  options: Intl.DateTimeFormatOptions = DEFAULT_OPTIONS
): string {
  const date = toDate(value);
  if (!date) return "";

  // Force an explicit calendar so the rendered year is unambiguous. Thai gets
  // the Buddhist calendar via the locale tag; everyone else pins Gregorian.
  const resolvedLocale = resolveLocale(locale);
  const calendar =
    options.calendar ?? (resolvedLocale === THAI_BUDDHIST_LOCALE ? "buddhist" : "gregory");

  return new Intl.DateTimeFormat(resolvedLocale, { ...options, calendar }).format(date);
}

export function formatDateTime(
  value: DateInput | null | undefined,
  locale: string | undefined = "en",
  options: Intl.DateTimeFormatOptions = DEFAULT_DATETIME_OPTIONS
): string {
  return formatDate(value, locale, options);
}

export default formatDate;
