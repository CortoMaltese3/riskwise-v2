import React from "react";
import { Box, CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";

import AlertMessage from "./components/alerts/AlertMessage";
import ErrorBoundary from "./components/errors/ErrorBoundary";
import ErrorToast from "./components/alerts/ErrorToast";
import AppShell from "./components/layout/AppShell";
import LoadModal from "./components/loaders/LoadModal";
import NavigateAlert from "./components/alerts/NavigateAlert";
import theme from "./theme/theme";
import useStore from "./store";

import "./App.css";

const App = () => {
  const { selectedAppOption } = useStore();

  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {selectedAppOption === "" ? (
          <NavigateAlert />
        ) : (
          <Box display="flex" flexDirection="column" minHeight="100vh">
            <AppShell />
            <LoadModal />
            <AlertMessage />
          </Box>
        )}
        {/* Error toast is mounted unconditionally so the backend-error IPC
            listener can fire even before the user picks an app option. */}
        <ErrorToast />
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
