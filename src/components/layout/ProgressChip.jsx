import React from "react";
import { Box, Fade, IconButton, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

// Shared floating "status bar" chip used by both the scenario run progress
// (ScenarioProgressChip) and the auto-update download (UpdateProgressChip).
// Purely presentational: each container owns its own phase/state machine and
// feeds title/message/progress/actions in. Anchored bottom-left or
// bottom-right so a scenario run and an update download don't overlap.
const ANCHOR_X = {
  left: (theme) => ({ left: theme.spacing(2) }),
  right: (theme) => ({ right: theme.spacing(2) }),
};

const ProgressChip = ({
  open,
  anchor = "left",
  ariaLabel,
  title,
  summary,
  message,
  messageTestId,
  showProgressBar = false,
  determinate = false,
  value,
  onClose,
  closeAriaLabel,
  children,
}) => (
  <Fade in={open} timeout={300} unmountOnExit>
    <Paper
      role="status"
      aria-label={ariaLabel}
      elevation={6}
      sx={(theme) => ({
        position: "fixed",
        bottom: theme.spacing(2),
        ...ANCHOR_X[anchor](theme),
        width: 360,
        maxWidth: `calc(100vw - ${theme.spacing(4)})`,
        p: 2,
        borderRadius: 3,
        zIndex: theme.zIndex.snackbar,
      })}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {onClose && (
          <IconButton size="small" onClick={onClose} aria-label={closeAriaLabel}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>
      {summary && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          {summary}
        </Typography>
      )}
      {message != null && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ minHeight: 20, mb: showProgressBar ? 1 : 0 }}
          aria-live="polite"
          data-testid={messageTestId}
        >
          {message}
        </Typography>
      )}
      {showProgressBar && (
        <LinearProgress
          variant={determinate ? "determinate" : "indeterminate"}
          value={determinate ? value : undefined}
          sx={{ height: 6, borderRadius: 4 }}
        />
      )}
      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1.5, minHeight: 32 }}>
        {children}
      </Box>
    </Paper>
  </Fade>
);

export default ProgressChip;
