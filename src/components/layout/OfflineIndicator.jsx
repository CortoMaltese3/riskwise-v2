import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Box, Chip } from "@mui/material";
import CloudOffIcon from "@mui/icons-material/CloudOff";

import useStore from "../../store";

// Persistent footer chip + the renderer-side primer for the offline
// state subscription. Mounting in AppShell makes this the single place
// the renderer asks the main process for the current offline status;
// other components read from the store and never call `getStatus`
// directly.
const OfflineIndicator = () => {
  const { t } = useTranslation();
  const offlineMode = useStore((s) => s.offlineMode);
  const applyOfflineStatus = useStore((s) => s.applyOfflineStatus);

  useEffect(() => {
    const bridge = window.electron?.offline;
    if (!bridge) return undefined;
    let cancelled = false;
    bridge
      .getStatus?.()
      .then((status) => {
        if (!cancelled) applyOfflineStatus(status);
      })
      .catch(() => {});
    const unsubscribe = bridge.onStatusChanged?.((status) => applyOfflineStatus(status));
    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [applyOfflineStatus]);

  if (!offlineMode) return null;

  return (
    <Box
      data-testid="offline-indicator"
      role="status"
      aria-live="polite"
      sx={{
        position: "fixed",
        bottom: 8,
        right: 8,
        zIndex: (theme) => theme.zIndex.tooltip + 1,
      }}
    >
      <Chip
        icon={<CloudOffIcon />}
        color="warning"
        size="small"
        label={t("offline_indicator_label", { defaultValue: "Offline mode active" })}
      />
    </Box>
  );
};

export default OfflineIndicator;
