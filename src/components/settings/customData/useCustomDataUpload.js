import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import RiskWiseClient from "../../../lib/RiskWiseClient";
import { enqueueToast } from "../../../hooks/useToast";

const isZipPath = (filePath) => typeof filePath === "string" && /\.zip$/i.test(filePath);

/**
 * Encapsulates the drag/drop, browse, validate, and import-confirm flow for
 * custom country data packs. Returns the state needed by `DataUploadForm`
 * plus the handlers wired to it.
 */
export const useCustomDataUpload = ({ refresh, setBusy }) => {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [validation, setValidation] = useState(null);
  const [pendingPath, setPendingPath] = useState(null);

  const dismiss = useCallback(() => {
    setValidation(null);
    setPendingPath(null);
  }, []);

  const validate = useCallback(
    async (filePath) => {
      if (!isZipPath(filePath)) {
        enqueueToast({ severity: "error", message: t("settings_custom_data_not_zip") });
        return;
      }
      setBusy("validating");
      setValidation(null);
      try {
        const res = await RiskWiseClient.validateCustomDataPack({ zip_path: filePath });
        if (res?.success && res.result?.data) {
          setValidation(res.result.data);
          setPendingPath(filePath);
        } else {
          const detail = res?.error?.message || t("settings_custom_data_validate_failed");
          enqueueToast({ severity: "error", message: detail });
        }
      } finally {
        setBusy(null);
      }
    },
    [setBusy, t]
  );

  const browse = useCallback(async () => {
    if (!window.electron?.selectCustomDataPack) return;
    const result = await window.electron.selectCustomDataPack();
    if (result?.success && result.filePath) {
      validate(result.filePath);
    } else if (result?.reason && result.reason !== "cancelled") {
      enqueueToast({ severity: "error", message: result.reason });
    }
  }, [validate]);

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
        enqueueToast({ severity: "error", message: t("settings_custom_data_drop_unsupported") });
        return;
      }
      validate(filePath);
    },
    [validate, t]
  );

  const confirm = useCallback(async () => {
    if (!pendingPath || !validation?.valid) return;
    setBusy("importing");
    try {
      const res = await RiskWiseClient.importCustomDataPack({ zip_path: pendingPath });
      if (res?.success && res.result?.data) {
        enqueueToast({
          severity: "success",
          message: t("settings_custom_data_imported", {
            country: res.result.data.country_name,
            iso3: res.result.data.iso3,
          }),
        });
        await refresh();
      } else {
        const detail = res?.error?.message || t("settings_custom_data_import_failed");
        enqueueToast({ severity: "error", message: detail });
      }
    } finally {
      setBusy(null);
      dismiss();
    }
  }, [pendingPath, validation, refresh, setBusy, dismiss, t]);

  return {
    isDragging,
    validation,
    pendingPath,
    dragOver,
    dragLeave,
    drop,
    browse,
    confirm,
    dismiss,
  };
};
