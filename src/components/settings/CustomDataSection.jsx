import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Typography } from "@mui/material";

import RiskWiseClient from "../../lib/RiskWiseClient";
import { useListManager } from "../../hooks/useListManager";
import DataList from "./customData/DataList";
import DataUploadForm from "./customData/DataUploadForm";
import DataDeleteConfirmation from "./customData/DataDeleteConfirmation";
import { useCustomDataUpload } from "./customData/useCustomDataUpload";

const CustomDataSection = () => {
  const { t } = useTranslation();

  const fetchInstalled = useCallback(async () => {
    const res = await RiskWiseClient.listCustomDataPacks();
    if (res?.success) {
      return res.result?.data?.countries ?? [];
    }
    return [];
  }, []);

  const {
    items: installed,
    busy,
    setBusy,
    confirmDelete,
    setConfirmDelete,
    refresh,
    remove,
  } = useListManager({
    fetchFn: fetchInstalled,
    deleteFn: (entry) => RiskWiseClient.deleteCustomDataPack(entry.iso3),
    getDeleteKey: (entry) => entry.iso3,
    deleteSuccessMessage: (entry) => t("settings_custom_data_deleted", { iso3: entry.iso3 }),
    deleteFallbackErrorMessage: t("settings_custom_data_delete_failed"),
  });

  const upload = useCustomDataUpload({ refresh, setBusy });

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h6">{t("settings_custom_data_title")}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t("settings_custom_data_description")}
        </Typography>
      </Stack>

      <DataUploadForm
        busy={busy}
        isDragging={upload.isDragging}
        validation={upload.validation}
        pendingPath={upload.pendingPath}
        onDragOver={upload.dragOver}
        onDragLeave={upload.dragLeave}
        onDrop={upload.drop}
        onBrowse={upload.browse}
        onConfirmImport={upload.confirm}
        onDismiss={upload.dismiss}
      />

      <DataList
        installed={installed}
        onRequestDelete={setConfirmDelete}
        deleteDisabled={busy !== null}
      />

      <DataDeleteConfirmation
        entry={confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={remove}
        busy={busy}
      />
    </Stack>
  );
};

export default CustomDataSection;
