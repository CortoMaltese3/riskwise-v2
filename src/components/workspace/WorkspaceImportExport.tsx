import React, { useState } from "react";
import { Button, Stack } from "@mui/material";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import FileUploadIcon from "@mui/icons-material/FileUpload";

import { enqueueToast } from "../../hooks/useToast";

interface WorkspaceImportExportProps {
  onImported?: () => void;
}

const WorkspaceImportExport: React.FC<WorkspaceImportExportProps> = ({ onImported }) => {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  const handleExport = async () => {
    setBusy("export");
    try {
      const result = await window.electron.exportWorkspace();
      if (result.success) {
        const n = result.scenarioCount ?? 0;
        enqueueToast({
          severity: "success",
          message: `Exported ${n} scenario${n === 1 ? "" : "s"}.`,
        });
      } else if (result.reason && result.reason !== "cancelled") {
        enqueueToast({ severity: "error", message: `Export failed: ${result.reason}` });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    setBusy("import");
    try {
      const result = await window.electron.importWorkspace();
      if (result.success) {
        const imported = result.imported ?? 0;
        const skipped = result.skipped ?? 0;
        const tail = skipped > 0 ? ` (${skipped} skipped as duplicates)` : "";
        enqueueToast({
          severity: "success",
          message: `Imported ${imported} scenario${imported === 1 ? "" : "s"}${tail}.`,
        });
        onImported?.();
      } else if (result.reason && result.reason !== "cancelled") {
        enqueueToast({ severity: "error", message: `Import failed: ${result.reason}` });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack direction="row" spacing={1}>
      <Button
        variant="outlined"
        size="small"
        startIcon={<FileDownloadIcon />}
        onClick={handleExport}
        disabled={busy !== null}
        aria-label="export-workspace"
      >
        Export Workspace
      </Button>
      <Button
        variant="outlined"
        size="small"
        startIcon={<FileUploadIcon />}
        onClick={handleImport}
        disabled={busy !== null}
        aria-label="import-workspace"
      >
        Import Workspace
      </Button>
    </Stack>
  );
};

export default WorkspaceImportExport;
