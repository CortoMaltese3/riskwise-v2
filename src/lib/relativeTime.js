// Locale-aware relative timestamp via Intl.RelativeTimeFormat. Picks the
// largest unit that is at least one whole step (e.g. 2 hours ago, 1 day ago)
// so the UI stays readable on tight rows.

const UNITS = [
  { unit: "year", seconds: 31536000 },
  { unit: "month", seconds: 2592000 },
  { unit: "week", seconds: 604800 },
  { unit: "day", seconds: 86400 },
  { unit: "hour", seconds: 3600 },
  { unit: "minute", seconds: 60 },
  { unit: "second", seconds: 1 },
];

const formatterCache = new Map();

const getFormatter = (locale) => {
  const key = locale || "en";
  if (formatterCache.has(key)) return formatterCache.get(key);
  let fmt;
  try {
    fmt = new Intl.RelativeTimeFormat(key, { numeric: "auto" });
  } catch {
    fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  }
  formatterCache.set(key, fmt);
  return fmt;
};

const toDate = (value) => {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatRelativeTime = (value, locale = "en", { now = Date.now() } = {}) => {
  const date = toDate(value);
  if (!date) return "";
  const diffSeconds = Math.round((date.getTime() - now) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const sign = diffSeconds < 0 ? -1 : 1;
  for (const { unit, seconds } of UNITS) {
    if (absSeconds >= seconds || unit === "second") {
      const amount = sign * Math.max(1, Math.floor(absSeconds / seconds));
      return getFormatter(locale).format(amount, unit);
    }
  }
  return "";
};

export default formatRelativeTime;
