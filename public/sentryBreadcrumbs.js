// Sentry breadcrumb transport for electron-log (issue #308).
//
// Every log line above the configured level is forwarded to
// ``Sentry.addBreadcrumb`` so the last ~100 entries ride along with each
// Sentry event the main process emits (via #119's continuous reporting or
// #300's "Send to Support" upload). The Settings panel surfaces only the
// crash itself today; breadcrumbs make the pre-crash log trail visible in
// Sentry without downloading the diagnostics ZIP.
//
// This module is dependency-injected (``isSentryInitialized``, ``getSentry``)
// so the transport is unit-testable in isolation from electron-log and the
// real Sentry SDK. ``createBreadcrumbTransport`` returns a function with the
// shape electron-log v5 expects on ``log.transports.<name>``.

const LEVEL_MAP = {
  silly: "debug",
  debug: "debug",
  verbose: "debug",
  info: "info",
  warn: "warning",
  error: "error",
};

const LEVEL_ORDER = {
  debug: 10,
  verbose: 10,
  silly: 10,
  info: 20,
  warn: 30,
  warning: 30,
  error: 40,
};

const DEFAULT_LEVEL = "info";

function normalizeLevel(level) {
  if (typeof level !== "string") return DEFAULT_LEVEL;
  const lower = level.toLowerCase();
  if (lower === "warning") return "warn";
  return lower in LEVEL_ORDER ? lower : DEFAULT_LEVEL;
}

function resolveMinLevel(rawLevel) {
  return normalizeLevel(rawLevel || DEFAULT_LEVEL);
}

function formatMessage(data) {
  const parts = Array.isArray(data) ? data : [data];
  return parts
    .map((part) => {
      if (part instanceof Error) return part.stack || part.message || String(part);
      if (part === null || part === undefined) return String(part);
      if (typeof part === "object") {
        try {
          return JSON.stringify(part);
        } catch {
          return String(part);
        }
      }
      return String(part);
    })
    .join(" ");
}

function createBreadcrumbTransport({ isSentryInitialized, getSentry, minLevel }) {
  const min = resolveMinLevel(minLevel);
  const threshold = LEVEL_ORDER[min];

  const transport = (message) => {
    try {
      if (!isSentryInitialized()) return;
      const level = normalizeLevel(message && message.level);
      if (LEVEL_ORDER[level] < threshold) return;
      const Sentry = getSentry();
      if (!Sentry || typeof Sentry.addBreadcrumb !== "function") return;
      const date = message && message.date instanceof Date ? message.date : new Date();
      Sentry.addBreadcrumb({
        category: "log",
        level: LEVEL_MAP[level] || "info",
        message: formatMessage(message && message.data),
        timestamp: date.getTime() / 1000,
      });
    } catch {
      // A misbehaving Sentry SDK or a serialization failure must never
      // break the electron-log pipeline — every other transport (file,
      // console) must keep receiving the line.
    }
  };
  // electron-log v5 honours ``transport.level`` as an extra filter; setting
  // it here means levels below the floor never reach our function in the
  // first place, on top of our own ordering check.
  transport.level = min;
  return transport;
}

module.exports = {
  createBreadcrumbTransport,
  resolveMinLevel,
  formatMessage,
  LEVEL_MAP,
  LEVEL_ORDER,
};
