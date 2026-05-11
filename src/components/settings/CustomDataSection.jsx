import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Typography } from "@mui/material";

import RiskWiseClient from "../../lib/RiskWiseClient";
import useResultsStore from "../../store/useResultsStore";
import { useListManager } from "../../hooks/useListManager";
import DataList from "./customData/DataList";
import DataUploadForm from "./customData/DataUploadForm";
import DataDeleteConfirmation from "./customData/DataDeleteConfirmation";
import { useCustomDataUpload } from "./customData/useCustomDataUpload";

const CustomDataSection = () => {
  const { t } = useTranslation();
  const isScenarioRunning = useResultsStore((s) => s.isScenarioRunning);

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

  // OR-merge ``isScenarioRunning`` into the existing ``busy`` value so the
  // form/list/delete affordances disable in lock-step with the chip
  // gating contract. The synthetic ``"scenario_running"`` token is a
  // distinct sentinel that won't accidentally match the children's
  // ``busy === "validating"|"importing"`` branches.
  const effectiveBusy = isScenarioRunning ? (busy ?? "scenario_running") : busy;

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h6">{t("settings_custom_data_title")}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t("settings_custom_data_description")}
        </Typography>
      </Stack>

      <DataUploadForm
        busy={effectiveBusy}
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
        deleteDisabled={effectiveBusy !== null}
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
