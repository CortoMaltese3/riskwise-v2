import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Typography } from "@mui/material";

import RiskWiseClient from "../../lib/RiskWiseClient";
import useResultsStore from "../../store/useResultsStore";
import { useListManager } from "../../hooks/useListManager";
import DataList from "./credData/DataList";
import DataUploadForm from "./credData/DataUploadForm";
import DataDeleteConfirmation from "./credData/DataDeleteConfirmation";
import { useCREDUpload } from "./credData/useCREDUpload";

const CREDDataSection = () => {
  const { t } = useTranslation();
  const credDatasets = useResultsStore((s) => s.credDatasets);
  const setCredDatasets = useResultsStore((s) => s.setCredDatasets);
  const activeCredDatasetId = useResultsStore((s) => s.activeCredDatasetId);
  const setActiveCredDatasetId = useResultsStore((s) => s.setActiveCredDatasetId);
  const isScenarioRunning = useResultsStore((s) => s.isScenarioRunning);

  const fetchCred = useCallback(async () => {
    const res = await RiskWiseClient.listCREDDatasets();
    return res?.success && res.result?.data ? res.result.data : null;
  }, []);

  const handleDeleteDataset = useCallback(
    async (dataset) => {
      const res = await RiskWiseClient.deleteCREDDataset(dataset.id);
      if (res?.success && activeCredDatasetId === dataset.id) {
        setActiveCredDatasetId(null);
      }
      return res;
    },
    [activeCredDatasetId, setActiveCredDatasetId]
  );

  const credStorage = useMemo(
    () => ({ items: credDatasets, setItems: setCredDatasets }),
    [credDatasets, setCredDatasets]
  );

  const { busy, setBusy, confirmDelete, setConfirmDelete, refresh, remove } = useListManager({
    fetchFn: fetchCred,
    deleteFn: handleDeleteDataset,
    storage: credStorage,
    deleteSuccessMessage: (dataset) => t("settings_cred_data_deleted", { name: dataset.name }),
    deleteFallbackErrorMessage: t("settings_cred_data_delete_failed"),
  });

  const upload = useCREDUpload({ refresh, setActiveCredDatasetId, setBusy });

  const builtinId = useMemo(
    () => credDatasets.find((d) => d.is_builtin)?.id ?? null,
    [credDatasets]
  );
  const selectedId = activeCredDatasetId ?? builtinId;

  // While a scenario is running, swallow CRED dataset selection clicks so
  // the active dataset cannot change mid-run; the chip explains why.
  const handleSelect = useCallback(
    (dataset) => {
      if (isScenarioRunning) return;
      setActiveCredDatasetId(dataset.is_builtin ? null : dataset.id);
    },
    [isScenarioRunning, setActiveCredDatasetId]
  );

  // OR-merge ``isScenarioRunning`` into the existing ``busy`` value (see
  // CustomDataSection for the same pattern).
  const effectiveBusy = isScenarioRunning ? (busy ?? "scenario_running") : busy;

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h6">{t("settings_cred_data_title")}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t("settings_cred_data_description")}
        </Typography>
      </Stack>

      <DataUploadForm
        busy={effectiveBusy}
        errors={upload.errors}
        pendingPath={upload.pendingPath}
        pendingName={upload.pendingName}
        isDragging={upload.isDragging}
        onDragOver={upload.dragOver}
        onDragLeave={upload.dragLeave}
        onDrop={upload.drop}
        onBrowse={upload.browse}
        onNameChange={upload.setPendingName}
        onConfirm={upload.confirm}
        onDismiss={upload.dismiss}
      />

      <DataList
        datasets={credDatasets}
        selectedId={selectedId}
        onSelect={handleSelect}
        onRequestDelete={setConfirmDelete}
        deleteDisabled={effectiveBusy !== null}
      />

      <DataDeleteConfirmation
        dataset={confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={remove}
        busy={busy}
      />
    </Stack>
  );
};

export default CREDDataSection;
