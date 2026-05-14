import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import RiskWiseClient from "../../../lib/RiskWiseClient";
import { enqueueToast } from "../../../hooks/useToast";

const isXlsxPath = (filePath) => typeof filePath === "string" && /\.xlsx$/i.test(filePath);

const splitErrors = (message) => {
  if (!message) return [];
  // Backend joins validation errors with "; " — unpack so we can render them
  // as a bulleted list rather than a single cramped toast message.
  return String(message)
    .split(/;\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
};

/**
 * Encapsulates the drag/drop, browse, and upload-confirm flow for CRED datasets.
 * Returns the state needed by `DataUploadForm` plus the handlers wired to it.
 */
export const useCREDUpload = ({ refresh, setActiveCredDatasetId, setBusy }) => {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [pendingPath, setPendingPath] = useState(null);
  const [pendingName, setPendingName] = useState("");
  const [errors, setErrors] = useState([]);

  const dismiss = useCallback(() => {
    setPendingPath(null);
    setPendingName("");
    setErrors([]);
  }, []);

  const handleFilePicked = useCallback(
    (filePath) => {
      if (!isXlsxPath(filePath)) {
        enqueueToast({ severity: "error", message: t("settings_cred_data_not_xlsx") });
        return;
      }
      const suggestedName = (filePath.split(/[\\/]/).pop() || "").replace(/\.xlsx$/i, "").trim();
      setPendingPath(filePath);
      setPendingName(suggestedName || "CRED dataset");
      setErrors([]);
    },
    [t]
  );

  const browse = useCallback(async () => {
    if (!window.electron?.selectCredDataset) return;
    const result = await window.electron.selectCredDataset();
    if (result?.success && result.filePath) {
      handleFilePicked(result.filePath);
    } else if (result?.reason && result.reason !== "cancelled") {
      enqueueToast({ severity: "error", message: result.reason });
    }
  }, [handleFilePicked]);

  const dragOver = useCallback((event) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const dragLeave = useCallback(() => setIsDragging(false), []);

  const drop = useCallback(
    (event) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      const filePath =
        (window.electron?.getPathForFile && window.electron.getPathForFile(file)) || file.path;
      if (!filePath) {
        enqueueToast({ severity: "error", message: t("settings_cred_data_drop_unsupported") });
        return;
      }
      handleFilePicked(filePath);
    },
    [handleFilePicked, t]
  );

  const confirm = useCallback(async () => {
    if (!pendingPath || !pendingName.trim()) return;
    setBusy("uploading");
    setErrors([]);
    try {
      const res = await RiskWiseClient.uploadCREDDataset({
        name: pendingName.trim(),
        xlsx_path: pendingPath,
      });
      if (res?.success && res.result?.data) {
        enqueueToast({
          severity: "success",
          message: t("settings_cred_data_uploaded", { name: pendingName.trim() }),
        });
        await refresh();
        setActiveCredDatasetId(res.result.data.id);
        dismiss();
      } else {
        const detail = res?.error?.message || t("settings_cred_data_upload_failed");
        const parts = splitErrors(detail);
        setErrors(parts.length > 0 ? parts : [detail]);
        enqueueToast({ severity: "error", message: t("settings_cred_data_upload_failed") });
      }
    } finally {
      setBusy(null);
    }
  }, [pendingPath, pendingName, refresh, setActiveCredDatasetId, dismiss, setBusy, t]);

  return {
    isDragging,
    pendingPath,
    pendingName,
    errors,
    setPendingName,
    dragOver,
    dragLeave,
    drop,
    browse,
    confirm,
    dismiss,
  };
};
