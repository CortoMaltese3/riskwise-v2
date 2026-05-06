// Theme-mode union (issue #288). Three modes drive the data attribute on
// `<html>` that MUI's `colorSchemes` API uses to swap CSS variables.
// `system` consults `prefers-color-scheme` at runtime; the store validates
// persisted values against this list and falls back to the default.
export const THEME_MODES = ["light", "dark", "system"];

export const DEFAULT_THEME_MODE = "system";
