// Frontend-side logger. Thin wrapper that (a) mints correlation UUIDs the
// renderer can attach to an API call and (b) forwards log records to the
// Electron main process over IPC so they land in the same `app.log` that
// `electron-log` owns. When running outside Electron (Vitest, Storybook,
// SSR), the IPC bridge is absent — we fall back to the native console so
// tests don't have to mock a bridge just to exercise a component that
// happens to log.

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

export interface LoggerBridge {
  log: (record: { level: LogLevel; message: string; context?: LogContext }) => void;
}

declare global {
  interface Window {
    logger?: LoggerBridge;
  }
}

export const newRequestId = (): string => globalThis.crypto.randomUUID();

const dispatch = (level: LogLevel, message: string, context?: LogContext): void => {
  const bridge = typeof window !== "undefined" ? window.logger : undefined;
  if (bridge && typeof bridge.log === "function") {
    try {
      bridge.log({ level, message, context });
      return;
    } catch {
      // fall through to console so a broken IPC doesn't swallow the record
    }
  }
  const consoleMethod: Record<LogLevel, (...args: unknown[]) => void> = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  if (context && Object.keys(context).length > 0) {
    consoleMethod[level](message, context);
  } else {
    consoleMethod[level](message);
  }
};

export const logger = {
  debug: (message: string, context?: LogContext) => dispatch("debug", message, context),
  info: (message: string, context?: LogContext) => dispatch("info", message, context),
  warn: (message: string, context?: LogContext) => dispatch("warn", message, context),
  error: (message: string, context?: LogContext) => dispatch("error", message, context),
  newRequestId,
};

export default logger;
