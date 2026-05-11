import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import InboxIcon from "@mui/icons-material/Inbox";

import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { useReportTools } from "../../utils/reportTools";
import { enqueueToast } from "../../hooks/useToast";
import ScrollableRegion from "../layout/primitives/ScrollableRegion";
import BulkDeleteBar from "./BulkDeleteBar";
import ExportPdfDialog from "./ExportPdfDialog";
import ScenarioTable from "./ScenarioTable";
import WorkspaceImportExport from "./WorkspaceImportExport";

const uniqueNonEmpty = (values) => [...new Set(values.filter(Boolean))].sort();

const matchesSearch = (row, query) => {
  if (!query) return true;
  const haystack = [row.name, row.tags, row.notes].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
};

const compareBy = (key, dir) => (a, b) => {
  const av = a[key];
  const bv = b[key];
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
  return dir === "asc" ? cmp : -cmp;
};

const EmptyState = ({ onStart }) => {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        pt: 6,
        color: "text.secondary",
      }}
    >
      <InboxIcon sx={{ fontSize: 48, mb: 1.5, alignSelf: "center" }} />
      <Typography variant="subtitle1" gutterBottom sx={{ alignSelf: "center" }}>
        {t("workspace_empty_title")}
      </Typography>
      <Typography variant="body2" sx={{ mb: 2, alignSelf: "center" }}>
        {t("workspace_empty_body")}
      </Typography>
      <Button variant="contained" onClick={onStart}>
        {t("workspace_empty_cta")}
      </Button>
    </Box>
  );
};

EmptyState.propTypes = { onStart: PropTypes.func.isRequired };

const WorkspaceView = ({ initialScenarios }) => {
  const { t } = useTranslation();
  const setActiveSection = useUIStore((state) => state.setActiveSection);
  const { restoreScenario } = useReportTools();

  const {
    scenarios,
    error,
    search,
    countryFilter,
    hazardFilter,
    sortKey,
    sortDir,
    selectedIds,
    setSearch,
    setCountryFilter,
    setHazardFilter,
    setSort,
    toggleSelected,
    setAllSelected,
    clearSelected,
    setScenarios,
    loadScenarios,
    renameScenario,
    deleteScenario,
    deleteSelected,
  } = useWorkspaceStore();

  const [exportTarget, setExportTarget] = useState(null);

  useEffect(() => {
    if (initialScenarios !== undefined) {
      setScenarios(initialScenarios);
    } else {
      loadScenarios();
    }
  }, [initialScenarios, loadScenarios, setScenarios]);

  const countries = useMemo(() => uniqueNonEmpty(scenarios.map((r) => r.country)), [scenarios]);
  const hazards = useMemo(() => uniqueNonEmpty(scenarios.map((r) => r.hazard_type)), [scenarios]);

  const visibleRows = useMemo(() => {
    const filtered = scenarios.filter(
      (row) =>
        matchesSearch(row, search) &&
        (!countryFilter || row.country === countryFilter) &&
        (!hazardFilter || row.hazard_type === hazardFilter)
    );
    return [...filtered].sort(compareBy(sortKey, sortDir));
  }, [scenarios, search, countryFilter, hazardFilter, sortKey, sortDir]);

  const handleExportDialogClose = async (payload) => {
    const target = exportTarget;
    setExportTarget(null);
    if (!target || payload === null) return;
    const { snapshotIds, includeWaterfall, includeCostBenefit } = payload;
    const result = await window.electron.exportPdf(target.id, {
      snapshotIds,
      includeWaterfall,
      includeCostBenefit,
    });
    if (result.success) {
      enqueueToast({ severity: "success", message: "PDF saved successfully." });
    } else if (result.reason !== "cancelled") {
      enqueueToast({ severity: "error", message: `PDF export failed: ${result.reason}` });
    }
  };

  const handleAction = async (action, row) => {
    if (action === "delete") {
      await deleteScenario(row.id);
    } else if (action === "export-pdf") {
      setExportTarget({ id: row.id, name: row.name });
    } else if (action === "restore") {
      const ok = await restoreScenario(row.id);
      if (ok) {
        setActiveSection("risk");
        enqueueToast({
          severity: "success",
          message: t("alert_message_report_card_successful_restore"),
        });
      }
    }
  };

  const toggleAll = (checked) => {
    setAllSelected(checked ? visibleRows.map((r) => r.id) : []);
  };

  const handleBulkDelete = async () => {
    const result = await deleteSelected();
    if (result.total === 0) return;
    if (result.failed === 0) {
      enqueueToast({
        severity: "success",
        message: t("workspace_bulk_delete_success", { count: result.ok }),
      });
    } else {
      enqueueToast({
        severity: "error",
        message: t("workspace_bulk_delete_partial", {
          ok: result.ok,
          failed: result.failed,
          total: result.total,
        }),
      });
    }
  };

  return (
    <ScrollableRegion>
      <Stack
        spacing={2}
        sx={{ p: 2, minHeight: "100%", flex: 1, display: "flex", flexDirection: "column" }}
      >
        <Stack direction="row" alignItems="center" spacing={2} sx={{ width: "100%" }}>
          <Typography variant="h5">{t("sidebar_workspace")}</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <WorkspaceImportExport onImported={() => loadScenarios({ force: true })} />
        </Stack>

        {!scenarios.length ? (
          <EmptyState onStart={() => setActiveSection("risk")} />
        ) : (
          <>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label={t("workspace_search_label")}
                size="small"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                slotProps={{ htmlInput: { "aria-label": "search-scenarios" } }}
                sx={{ minWidth: 220 }}
              />
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="country-filter-label">{t("country")}</InputLabel>
                <Select
                  labelId="country-filter-label"
                  label={t("country")}
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                  inputProps={{ "aria-label": "country-filter" }}
                >
                  <MenuItem value="">{t("workspace_filter_all")}</MenuItem>
                  {countries.map((country) => (
                    <MenuItem key={country} value={country}>
                      {country}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="hazard-filter-label">{t("hazard_title")}</InputLabel>
                <Select
                  labelId="hazard-filter-label"
                  label={t("hazard_title")}
                  value={hazardFilter}
                  onChange={(e) => setHazardFilter(e.target.value)}
                  inputProps={{ "aria-label": "hazard-filter" }}
                >
                  <MenuItem value="">{t("workspace_filter_all")}</MenuItem>
                  {hazards.map((hazard) => (
                    <MenuItem key={hazard} value={hazard}>
                      {hazard}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <BulkDeleteBar
              selectedIds={selectedIds}
              scenarios={scenarios}
              onConfirmDelete={handleBulkDelete}
              onClear={clearSelected}
            />

            {error && (
              <Typography role="alert" color="error">
                {error}
              </Typography>
            )}

            <ScenarioTable
              rows={visibleRows}
              selectedIds={selectedIds}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={setSort}
              onToggleSelected={toggleSelected}
              onToggleAll={toggleAll}
              onRename={renameScenario}
              onAction={handleAction}
            />
          </>
        )}
      </Stack>
      <ExportPdfDialog
        open={Boolean(exportTarget)}
        onClose={handleExportDialogClose}
        scenarioId={exportTarget?.id}
        scenarioName={exportTarget?.name}
      />
    </ScrollableRegion>
  );
};

WorkspaceView.propTypes = {
  initialScenarios: PropTypes.array,
};

export default WorkspaceView;
