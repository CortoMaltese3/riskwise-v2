import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import FileUploadIcon from "@mui/icons-material/FileUpload";

import RiskWiseClient from "../../lib/RiskWiseClient";
import { enqueueToast } from "../../hooks/useToast";

// Mirrors the workspace import flow: Electron's main process opens a
// native open dialog and POSTs the chosen path to the backend; the
// renderer never reads the binary itself.
const ImportScenarioSection = () => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [lastImport, setLastImport] = useState(null);

  const handleImport = async () => {
    setBusy(true);
    try {
      const result = await RiskWiseClient.importScenarioBundle();
      if (result?.success) {
        setLastImport({ name: result.name, scenarioId: result.scenarioId });
        enqueueToast({
          severity: "success",
          message: t("settings_import_scenario_success", {
            defaultValue: "Imported scenario “{{name}}”",
            name: result.name ?? result.scenarioId ?? "scenario",
          }),
        });
      } else if (result?.reason && result.reason !== "cancelled") {
        enqueueToast({
          severity: "error",
          message: t("settings_import_scenario_failed", {
            defaultValue: "Import failed: {{reason}}",
            reason: result.reason,
          }),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h6">
          {t("settings_import_scenario_title", { defaultValue: "Import Scenario" })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("settings_import_scenario_description", {
            defaultValue:
              "Import a shareable .riskwise-scenario bundle. The scenario will appear in the workspace list as read-only — re-running requires the original input data, which is not bundled in the export.",
          })}
        </Typography>
      </Stack>

      <Box>
        <Button
          variant="contained"
          startIcon={<FileUploadIcon />}
          onClick={handleImport}
          disabled={busy}
          aria-label="import-scenario-bundle"
        >
          {busy ? (
            <CircularProgress size={18} sx={{ color: "inherit" }} />
          ) : (
            t("settings_import_scenario_action", { defaultValue: "Import .riskwise-scenario" })
          )}
        </Button>
      </Box>

      {lastImport && (
        <Typography variant="body2" color="text.secondary">
          {t("settings_import_scenario_last", {
            defaultValue: "Last imported: {{name}}",
            name: lastImport.name ?? lastImport.scenarioId,
          })}
        </Typography>
      )}
    </Stack>
  );
};

export default ImportScenarioSection;
