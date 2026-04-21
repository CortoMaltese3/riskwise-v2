import React, { useMemo } from "react";
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
import baseTheme from "./theme/theme";
import { isRtl } from "./i18nConfig";
import useStore from "./store";

import "./App.css";

const printParams = new URLSearchParams(window.location.search);
const isPrintView = printParams.get("view") === "print";
const printScenarioId = printParams.get("scenarioId") ?? "";

const App = () => {
  const { selectedAppOption } = useStore();
  const { i18n } = useTranslation();

  // Re-create the theme when the active language flips between LTR and RTL so
  // MUI components (LinearProgress, Menu anchors, TextField alignment) mirror
  // correctly. This is the idiomatic MUI handshake for bidirectional support.
  const theme = useMemo(
    () => createTheme(baseTheme, { direction: isRtl(i18n.language) ? "rtl" : "ltr" }),
    [i18n.language]
  );

  if (isPrintView) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ScenarioPrintView scenarioId={printScenarioId} />
      </ThemeProvider>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ToastProvider>
          {selectedAppOption === "" ? (
            <NavigateAlert />
          ) : (
            <Box display="flex" flexDirection="column" minHeight="100vh">
              <AppShell />
              <ProgressOverlay />
              <AlertMessage />
            </Box>
          )}
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
