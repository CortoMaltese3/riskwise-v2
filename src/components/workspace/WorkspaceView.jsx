import React, { useEffect, useMemo } from "react";
import PropTypes from "prop-types";
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

import useStore from "../../store";
import useWorkspaceStore from "../../store/workspaceSlice";
import { enqueueToast } from "../../hooks/useToast";
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

const EmptyState = ({ onStart }) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      py: 10,
      color: "text.secondary",
    }}
  >
    <InboxIcon sx={{ fontSize: 64, mb: 2 }} />
    <Typography variant="h6" gutterBottom>
      No saved scenarios yet
    </Typography>
    <Typography variant="body2" sx={{ mb: 3 }}>
      Run your first scenario to see it appear here, or import an existing workspace.
    </Typography>
    <Button variant="contained" onClick={onStart}>
      Run your first scenario
    </Button>
  </Box>
);

EmptyState.propTypes = { onStart: PropTypes.func.isRequired };

const WorkspaceView = ({ initialScenarios }) => {
  const setActiveSection = useStore((state) => state.setActiveSection);

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
    setScenarios,
    loadScenarios,
    renameScenario,
    deleteScenario,
    deleteSelected,
  } = useWorkspaceStore();

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

  const handleAction = async (action, row) => {
    if (action === "delete") {
      await deleteScenario(row.id);
    } else if (action === "export-pdf") {
      const result = await window.electron.exportPdf(row.id);
      if (result.success) {
        enqueueToast({ severity: "success", message: "PDF saved successfully." });
      } else if (result.reason !== "cancelled") {
        enqueueToast({ severity: "error", message: `PDF export failed: ${result.reason}` });
      }
    }
    // Restore action wired via Issue #79; no-op here.
  };

  const toggleAll = (checked) => {
    setAllSelected(checked ? visibleRows.map((r) => r.id) : []);
  };

  if (!scenarios.length) {
    return (
      <Stack spacing={2} sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h5">Workspace</Typography>
          <WorkspaceImportExport onImported={loadScenarios} />
        </Stack>
        <EmptyState onStart={() => setActiveSection("risk")} />
      </Stack>
    );
  }

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">Workspace</Typography>
        <WorkspaceImportExport onImported={loadScenarios} />
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Search"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ htmlInput: { "aria-label": "search-scenarios" } }}
          sx={{ minWidth: 220 }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="country-filter-label">Country</InputLabel>
          <Select
            labelId="country-filter-label"
            label="Country"
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            inputProps={{ "aria-label": "country-filter" }}
          >
            <MenuItem value="">All</MenuItem>
            {countries.map((country) => (
              <MenuItem key={country} value={country}>
                {country}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="hazard-filter-label">Hazard</InputLabel>
          <Select
            labelId="hazard-filter-label"
            label="Hazard"
            value={hazardFilter}
            onChange={(e) => setHazardFilter(e.target.value)}
            inputProps={{ "aria-label": "hazard-filter" }}
          >
            <MenuItem value="">All</MenuItem>
            {hazards.map((hazard) => (
              <MenuItem key={hazard} value={hazard}>
                {hazard}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {selectedIds.length > 0 && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2">{selectedIds.length} selected</Typography>
          <Button size="small" color="error" onClick={deleteSelected}>
            Delete selected
          </Button>
        </Stack>
      )}

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
    </Stack>
  );
};

WorkspaceView.propTypes = {
  initialScenarios: PropTypes.array,
};

export default WorkspaceView;
