import React from "react";
import { Box, CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";

import AlertMessage from "./components/alerts/AlertMessage";
import ErrorBoundary from "./components/errors/ErrorBoundary";
import AppShell from "./components/layout/AppShell";
import ProgressOverlay from "./components/layout/ProgressOverlay";
import ToastProvider from "./components/layout/ToastProvider";
import NavigateAlert from "./components/alerts/NavigateAlert";
import ScenarioPrintView from "./components/workspace/ScenarioPrintView";
import theme from "./theme/theme";
import useStore from "./store";

import "./App.css";

const printParams = new URLSearchParams(window.location.search);
const isPrintView = printParams.get("view") === "print";
const printScenarioId = printParams.get("scenarioId") ?? "";

const App = () => {
  const { selectedAppOption } = useStore();

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
