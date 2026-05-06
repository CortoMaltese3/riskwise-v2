import { useCallback, useEffect, useState } from "react";

// Single source of truth for the engine-version gate. The Electron main
// process owns the manifest check; both ``EngineStatusBanner`` and the
// Home System status card consume this hook so the two surfaces never
// disagree (issue spec § State coverage).
export const useEngineStatus = () => {
  const [blocked, setBlocked] = useState(false);
  const [reason, setReason] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const bridge = window?.electron?.engine;
    if (!bridge?.checkBlocked) {
      setReady(true);
      return;
    }
    const result = await bridge.checkBlocked();
    if (result?.error) {
      setBlocked(true);
      setReason(result.error);
    } else {
      setBlocked(Boolean(result?.blocked));
      setReason(null);
    }
    setReady(true);
  }, []);

  const downloadUpdate = useCallback(async () => {
    const bridge = window?.electron?.engine;
    if (!bridge?.downloadUpdate) return;
    setBusy(true);
    try {
      const result = await bridge.downloadUpdate();
      if (result?.error) setReason(result.error);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { blocked, reason, ready, busy, refresh, downloadUpdate };
};

export default useEngineStatus;
