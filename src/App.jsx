import React, { useEffect, useMemo } from "react";
import { Box, CssBaseline } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

import AlertMessage from "./components/alerts/AlertMessage";
import ErrorBoundary from "./components/errors/ErrorBoundary";
import AppShell from "./components/layout/AppShell";
import ProgressOverlay from "./components/layout/ProgressOverlay";
import ToastProvider from "./components/layout/ToastProvider";
import NavigateAlert from "./components/alerts/NavigateAlert";
import ScenarioPrintView from "./components/workspace/ScenarioPrintView";
import HelpMenu from "./components/help/HelpMenu";
import GlossaryDrawer from "./components/help/GlossaryDrawer";
import baseTheme from "./theme/theme";
import { isRtl } from "./i18nConfig";
import useStore from "./store";

const printParams = new URLSearchParams(window.location.search);
const isPrintView = printParams.get("view") === "print";
const printScenarioId = printParams.get("scenarioId") ?? "";

// MUI's CssVarsProvider (the implementation behind <ThemeProvider> when the
// theme has `colorSchemes`) owns mode persistence and the
// `data-mui-color-scheme` attribute on <html>. Pointing it at our storage key
// keeps existing user preferences working and stops it from fighting any
// custom logic over the same attribute.
const THEME_MODE_STORAGE_KEY = "riskwise.themeMode";
// Print view forces light regardless of user choice (paper-white background).
// Using a separate storage key isolates print from the main app preference.
const PRINT_THEME_MODE_STORAGE_KEY = "riskwise.themeMode.print";

const App = () => {
  const { selectedAppOption } = useStore();
  const setHelpMenuOpen = useStore((s) => s.setHelpMenuOpen);
  const toggleHelpMenu = useStore((s) => s.toggleHelpMenu);
  const { i18n } = useTranslation();

  // Re-create the theme when the active language flips between LTR and RTL so
  // MUI components (LinearProgress, Menu anchors, TextField alignment) mirror
  // correctly. This is the idiomatic MUI handshake for bidirectional support.
  // Color-scheme switching is independent: MUI's ThemeProvider flips the
  // `data-mui-color-scheme` attribute on `<html>` and swaps the underlying
  // CSS variables — no theme re-creation needed.
  const theme = useMemo(
    () => createTheme(baseTheme, { direction: isRtl(i18n.language) ? "rtl" : "ltr" }),
    [i18n.language]
  );

  // Global help shortcuts (issue #88). F1 toggles; Shift+? opens. Esc is left
  // to the Drawer's built-in close handling, so we don't handle it here.
  useEffect(() => {
    if (isPrintView) return undefined;
    const handler = (event) => {
      const target = event.target;
      const tag = target?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (target && target.isContentEditable);
      if (event.key === "F1") {
        event.preventDefault();
        toggleHelpMenu();
        return;
      }
      if (!typing && event.shiftKey && event.key === "?") {
        event.preventDefault();
        setHelpMenuOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setHelpMenuOpen, toggleHelpMenu]);

  if (isPrintView) {
    return (
      <ThemeProvider
        theme={theme}
        defaultMode="light"
        modeStorageKey={PRINT_THEME_MODE_STORAGE_KEY}
      >
        <CssBaseline />
        <ScenarioPrintView scenarioId={printScenarioId} />
      </ThemeProvider>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme} defaultMode="system" modeStorageKey={THEME_MODE_STORAGE_KEY}>
        <CssBaseline />
        <ToastProvider>
          {selectedAppOption === "" ? (
            <NavigateAlert />
          ) : (
            <Box display="flex" flexDirection="column" height="100vh" overflow="hidden">
              <AppShell />
              <ProgressOverlay />
              <AlertMessage />
              <HelpMenu />
              <GlossaryDrawer />
            </Box>
          )}
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
