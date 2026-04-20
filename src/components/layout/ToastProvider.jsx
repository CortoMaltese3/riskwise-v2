import React, { useEffect, useRef } from "react";
import { Alert, Snackbar, Stack, Typography } from "@mui/material";

import { useToast, enqueueToast } from "../../hooks/useToast";
import useStore from "../../store";

const ANCHOR = { vertical: "bottom", horizontal: "right" };

const ToastProvider = ({ children }) => {
  const { toasts, dismiss } = useToast();
  const error = useStore((state) => state.error);
  const setError = useStore((state) => state.setError);
  const clearError = useStore((state) => state.clearError);
  const lastErrorIdRef = useRef(null);

  useEffect(() => {
    const off = window.api?.onBackendError?.((envelope) => {
      setError(envelope);
    });
    return () => {
      if (typeof off === "function") off();
    };
  }, [setError]);

  useEffect(() => {
    if (!error) return;
    if (lastErrorIdRef.current === error.error_id) return;
    lastErrorIdRef.current = error.error_id;
    enqueueToast({
      severity: "error",
      message: error.message || "An unexpected error occurred",
      code: error.code,
    });
    clearError();
  }, [error, clearError]);

  return (
    <>
      {children}
      <Stack
        spacing={1}
        sx={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: (theme) => theme.zIndex.snackbar,
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast, index) => (
          <Snackbar
            key={toast.id}
            open
            autoHideDuration={toast.duration}
            onClose={(_event, reason) => {
              if (reason === "clickaway") return;
              dismiss(toast.id);
            }}
            anchorOrigin={ANCHOR}
            sx={{
              position: "static",
              transform: "none",
              pointerEvents: "auto",
              mb: index === toasts.length - 1 ? 0 : 1,
            }}
          >
            <Alert
              severity={toast.severity}
              variant="filled"
              onClose={() => dismiss(toast.id)}
              sx={{ width: "100%", minWidth: 320 }}
            >
              <Typography variant="body2">{toast.message}</Typography>
              {toast.code && (
                <Typography
                  variant="caption"
                  sx={{ display: "block", fontFamily: "monospace", mt: 0.5 }}
                >
                  {toast.code}
                </Typography>
              )}
            </Alert>
          </Snackbar>
        ))}
      </Stack>
    </>
  );
};

export default ToastProvider;
