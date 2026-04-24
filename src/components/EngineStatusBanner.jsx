import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Stack } from "@mui/material";

// Warns the user when the cached engine version is outside the signed
// manifest's [min_app_version, max_app_version] range (issue #115,
// Area 13). The banner is the user-facing block: the download button
// invokes the manifest-verified engine update path in the main process
// and the check re-runs on success. Signed-manifest failures surface here
// too, so a tampered manifest never silently pushes a bad engine.
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

  return (
    <Alert severity="error" sx={{ borderRadius: 0 }}>
      <Stack direction="row" spacing={2} alignItems="center">
        <span>
          {reason
            ? t("engine_blocked_reason", {
                reason,
                defaultValue: `Engine update required: ${reason}`,
              })
            : t("engine_blocked", { defaultValue: "Engine update required" })}
        </span>
        <Button
          variant="contained"
          color="error"
          size="small"
          onClick={handleDownload}
          disabled={busy}
        >
          {t("engine_download_update", { defaultValue: "Download update" })}
        </Button>
      </Stack>
    </Alert>
  );
};

export default EngineStatusBanner;
