import { useEffect, useState } from "react";

import { COLOR_SCHEME_ATTRIBUTE } from "./theme";

const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

// Resolve the user's stored mode (`light` / `dark` / `system`) to the
// concrete scheme MUI should render. `system` consults
// `prefers-color-scheme`; the fallback is `light` for environments without
// `matchMedia` (e.g. SSR or older jsdom).
export const resolveScheme = (mode) => {
  if (mode === "light" || mode === "dark") return mode;
  const mql = globalThis.matchMedia?.(PREFERS_DARK_QUERY);
  return mql?.matches ? "dark" : "light";
};

// Drives the `data-mui-color-scheme` attribute on `<html>` from the user's
// stored mode. When `forceScheme` is provided (print view) it wins over the
// stored mode and OS preference. When the user picks `system`, OS-level
// changes are observed live so the UI follows the OS without a reload.
export default function useColorSchemeAttribute(themeMode, forceScheme = null) {
  const [resolvedScheme, setResolvedScheme] = useState(
    () => forceScheme ?? resolveScheme(themeMode)
  );

  useEffect(() => {
    if (forceScheme) {
      setResolvedScheme(forceScheme);
      return undefined;
    }
    setResolvedScheme(resolveScheme(themeMode));
    if (themeMode !== "system") return undefined;
    const mql = globalThis.matchMedia?.(PREFERS_DARK_QUERY);
    if (!mql?.addEventListener) return undefined;
    const handler = (e) => setResolvedScheme(e.matches ? "dark" : "light");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [themeMode, forceScheme]);

  useEffect(() => {
    document.documentElement.setAttribute(COLOR_SCHEME_ATTRIBUTE, resolvedScheme);
  }, [resolvedScheme]);
}
