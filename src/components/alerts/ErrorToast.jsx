import React, { forwardRef, useEffect } from "react";
import { Snackbar, Stack, Typography } from "@mui/material";
import MuiAlert from "@mui/material/Alert";

import useStore from "../../store";

// Toast for backend / supervisor failures (issue #12, scenario 6). Reads
// the structured envelope from Zustand and displays the user-facing
// ``message`` plus the ``error_id`` so users can quote it to support.
const Alert = forwardRef(function Alert(props, ref) {
  return <MuiAlert elevation={6} ref={ref} variant="filled" severity="error" {...props} />;
});

const ErrorToast = () => {
  const { error, clearError, setError } = useStore();

  // Subscribe to backend-error IPC once (supervisor restart exhaustion).
  useEffect(() => {
    const off = window.api?.onBackendError?.((envelope) => {
      setError(envelope);
    });
    return () => {
      if (typeof off === "function") off();
    };
  }, [setError]);

  if (!error) {
    return null;
  }

  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Snackbar
        open
        autoHideDuration={15000}
        onClose={clearError}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={clearError} sx={{ width: "100%" }}>
          <Typography variant="body2">{error.message}</Typography>
          <Typography variant="caption" sx={{ display: "block", fontFamily: "monospace" }}>
            Error ID: {error.error_id}
          </Typography>
        </Alert>
      </Snackbar>
    </Stack>
  );
};

export default ErrorToast;
