import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@mui/material";

import ProgressChip from "./layout/ProgressChip";
import useUpdateStore, { UPDATE_PHASES, requestUpdateDownload } from "../store/useUpdateStore";

// Bottom-right sibling of the scenario run chip, reusing ProgressChip. Shows
// the auto-update download lifecycle so the user sees real progress and a
// clear "keep the app open" hint instead of a frozen-looking modal (the gap
// that made users close the app mid-download). Consolidates the old
// post-download toast: the `ready` phase carries the "Restart now" action.
const MB = 1024 * 1024;
const formatMb = (bytes) => Math.round((Number(bytes) || 0) / MB);

const UpdateProgressChip = () => {
  const { t } = useTranslation();
  const phase = useUpdateStore((s) => s.phase);
  const version = useUpdateStore((s) => s.version);
  const percent = useUpdateStore((s) => s.percent);
  const transferred = useUpdateStore((s) => s.transferred);
  const total = useUpdateStore((s) => s.total);
  const setProgress = useUpdateStore((s) => s.setProgress);
  const setReady = useUpdateStore((s) => s.setReady);
  const reset = useUpdateStore((s) => s.reset);
  // Guards the terminal-phase actions so a double-click can't fire
  // quitAndInstall (or a second download) twice.
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const bridge = window.electron?.updates;
    if (!bridge) return undefined;
    const unsubscribers = [];
    if (bridge.onDownloadProgress) {
      unsubscribers.push(bridge.onDownloadProgress((p) => setProgress(p || {})));
    }
    if (bridge.onDownloaded) {
      unsubscribers.push(bridge.onDownloaded((p) => setReady(p?.version)));
    }
    return () => unsubscribers.forEach((u) => typeof u === "function" && u());
  }, [setProgress, setReady]);

  const versionLabel = version || "?";

  const handleRestart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await window.electron?.updates?.quitAndInstallNow();
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = () => {
    if (busy) return;
    requestUpdateDownload(version);
  };

  // One presentation block per phase, mirroring ScenarioProgressChip's
  // PHASE_CONFIG approach.
  if (phase === UPDATE_PHASES.DOWNLOADING) {
    const sizeLine =
      total > 0
        ? t("update_progress_downloading_size", {
            done: formatMb(transferred),
            total: formatMb(total),
            defaultValue: `${formatMb(transferred)} / ${formatMb(total)} MB · keep RISK WISE open`,
          })
        : t("update_progress_downloading_hint", {
            defaultValue: "Keep RISK WISE open until this finishes.",
          });
    return (
      <ProgressChip
        open
        anchor="right"
        ariaLabel={t("update_progress_downloading_title", {
          version: versionLabel,
          defaultValue: `Downloading update v${versionLabel}`,
        })}
        title={t("update_progress_downloading_title", {
          version: versionLabel,
          defaultValue: `Downloading update v${versionLabel}`,
        })}
        message={sizeLine}
        messageTestId="update-progress-message"
        showProgressBar
        // Animate indeterminately until the first byte lands, so the bar never
        // sits static at 0% looking frozen (matches ScenarioProgressChip).
        determinate={percent > 0}
        value={percent}
      />
    );
  }

  if (phase === UPDATE_PHASES.READY) {
    return (
      <ProgressChip
        open
        anchor="right"
        ariaLabel={t("update_progress_ready_title", {
          version: versionLabel,
          defaultValue: `Update v${versionLabel} ready`,
        })}
        title={t("update_progress_ready_title", {
          version: versionLabel,
          defaultValue: `Update v${versionLabel} ready`,
        })}
        message={t("update_progress_ready_body", {
          defaultValue: "It installs when you close RISK WISE.",
        })}
        messageTestId="update-progress-message"
        onClose={reset}
        closeAriaLabel={t("update_progress_close_aria", { defaultValue: "Dismiss update" })}
      >
        <Button
          size="small"
          variant="text"
          onClick={handleRestart}
          disabled={busy}
          data-testid="update-progress-restart"
        >
          {t("update_progress_restart", { defaultValue: "Restart now" })}
        </Button>
      </ProgressChip>
    );
  }

  if (phase === UPDATE_PHASES.FAILED) {
    return (
      <ProgressChip
        open
        anchor="right"
        ariaLabel={t("update_progress_failed_title", { defaultValue: "Update download failed" })}
        title={t("update_progress_failed_title", { defaultValue: "Update download failed" })}
        message={t("update_progress_failed_body", {
          defaultValue: "Check your connection and try again.",
        })}
        messageTestId="update-progress-message"
        onClose={reset}
        closeAriaLabel={t("update_progress_close_aria", { defaultValue: "Dismiss update" })}
      >
        <Button
          size="small"
          variant="outlined"
          onClick={handleRetry}
          disabled={busy}
          data-testid="update-progress-retry"
        >
          {t("update_progress_retry", { defaultValue: "Retry" })}
        </Button>
      </ProgressChip>
    );
  }

  // Idle: render the chip closed so the Fade-out animation still plays when a
  // terminal phase is reset.
  return <ProgressChip open={false} anchor="right" title="" message={null} />;
};

export default UpdateProgressChip;
