import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Button, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";

// Warns the user when the cached engine version is outside the signed
// manifest's [min_app_version, max_app_version] range (issue #115,
// Area 13). The banner is the user-facing block: the download button
// invokes the manifest-verified engine update path in the main process
// and the check re-runs on success. Signed-manifest failures surface here
// too, so a tampered manifest never silently pushes a bad engine.
//
// Rendered as a thin inline strip (issue #267) so it sits in the chrome
// between TopBar and the main horizontal split, outside the per-section
// scroll region. role="alert" + aria-live="assertive" preserve the
// announcement semantics that the previous MUI Alert provided.

const STRIP_SX = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  gap: 1,
  bgcolor: "error.main",
  color: "error.contrastText",
  px: 2,
  py: 0.5,
  minHeight: 32,
  fontSize: "0.875rem",
};

const MESSAGE_SX = { flexGrow: 1, lineHeight: 1.4 };

const BUTTON_SX = {
  color: "inherit",
  borderColor: "currentColor",
  py: 0,
  minHeight: 24,
  "&:hover": { borderColor: "currentColor", bgcolor: "action.hover" },
};

const EngineStatusBanner = () => {
  const { t } = useTranslation();
  const [blocked, setBlocked] = useState(false);
  const [reason, setReason] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const bridge = window.electron?.engine;
    if (!bridge?.checkBlocked) return;
    const result = await bridge.checkBlocked();
    if (result?.error) {
      setBlocked(true);
      setReason(result.error);
    } else {
      setBlocked(Boolean(result?.blocked));
      setReason(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDownload = async () => {
    setBusy(true);
    try {
      const result = await window.electron?.engine?.downloadUpdate();
      if (result?.error) setReason(result.error);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!blocked) return null;

  const message = reason
    ? t("engine_blocked_reason", {
        reason,
        defaultValue: `Engine update required: ${reason}`,
      })
    : t("engine_blocked", { defaultValue: "Engine update required" });

  return (
    <Box role="alert" aria-live="assertive" data-testid="engine-status-banner" sx={STRIP_SX}>
      <ErrorOutlineIcon fontSize="small" aria-hidden="true" />
      <Typography variant="body2" component="span" sx={MESSAGE_SX}>
        {message}
      </Typography>
      <Button
        variant="outlined"
        size="small"
        onClick={handleDownload}
        disabled={busy}
        sx={BUTTON_SX}
      >
        {t("engine_download_update", { defaultValue: "Download update" })}
      </Button>
    </Box>
  );
};

export default EngineStatusBanner;
