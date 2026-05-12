import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Typography } from "@mui/material";

import RiskWiseClient from "../../lib/RiskWiseClient";
import useResultsStore from "../../store/useResultsStore";
import { useListManager } from "../../hooks/useListManager";
import DataList from "./measures/DataList";
import DataUploadForm from "./measures/DataUploadForm";
import DataDeleteConfirmation from "./measures/DataDeleteConfirmation";
import { useMeasuresUpload } from "./measures/useMeasuresUpload";

const MeasuresSection = () => {
  const { t } = useTranslation();
  const isScenarioRunning = useResultsStore((s) => s.isScenarioRunning);

  const fetchMeasureSets = useCallback(async () => {
    const res = await RiskWiseClient.listMeasureDatasets();
    return res?.success && res.result?.data ? res.result.data : null;
  }, []);

  const {
    items: measureSets,
    busy,
    setBusy,
    confirmDelete,
    setConfirmDelete,
    refresh,
    remove,
  } = useListManager({
    fetchFn: fetchMeasureSets,
    deleteFn: (dataset) => RiskWiseClient.deleteMeasureDataset(dataset.id),
    deleteSuccessMessage: (dataset) => t("settings_measures_deleted", { name: dataset.name }),
    deleteFallbackErrorMessage: t("settings_measures_delete_failed"),
  });

  const upload = useMeasuresUpload({ refresh, setBusy });

  // OR-merge ``isScenarioRunning`` into the existing ``busy`` value (see
  // CustomDataSection for the same pattern).
  const effectiveBusy = isScenarioRunning ? (busy ?? "scenario_running") : busy;

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h6">{t("settings_measures_title")}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t("settings_measures_description")}
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
        datasets={measureSets}
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

export default MeasuresSection;
