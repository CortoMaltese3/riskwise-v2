import React, { useState } from "react";
import PropTypes from "prop-types";
import {
  Box,
  Checkbox,
  IconButton,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import SnapshotDrawer from "./SnapshotDrawer";

const formatCreatedAt = (value) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

const COLUMNS = [
  { key: "name", label: "Name", sortable: true },
  { key: "country", label: "Country", sortable: true },
  { key: "hazard_type", label: "Hazard", sortable: false },
  { key: "created_at", label: "Created At", sortable: true },
  { key: "status", label: "Status", sortable: false },
  { key: "tags", label: "Tags", sortable: false },
];

const ScenarioRow = ({ row, selected, onToggleSelected, onRename, onAction }) => {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(row.name || "");
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const commit = async () => {
    setEditing(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== row.name) {
      await onRename(row.id, trimmed);
    } else {
      setDraftName(row.name || "");
    }
  };

  const cancel = () => {
    setDraftName(row.name || "");
    setEditing(false);
  };

  const openMenu = (event) => setMenuAnchor(event.currentTarget);
  const closeMenu = () => setMenuAnchor(null);
  const handleAction = (action) => {
    closeMenu();
    onAction(action, row);
  };

  return (
    <>
      <TableRow hover>
        <TableCell padding="checkbox">
          <Checkbox
            checked={selected}
            onChange={() => onToggleSelected(row.id)}
            inputProps={{ "aria-label": `select-${row.id}` }}
          />
        </TableCell>
        <TableCell padding="none">
          <IconButton
            size="small"
            aria-label={`expand-${row.id}`}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell onDoubleClick={() => setEditing(true)} data-testid={`name-cell-${row.id}`}>
          {editing ? (
            <TextField
              autoFocus
              size="small"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") cancel();
              }}
              slotProps={{ htmlInput: { "aria-label": `rename-${row.id}` } }}
            />
          ) : (
            row.name || row.id
          )}
        </TableCell>
        <TableCell>{row.country || ""}</TableCell>
        <TableCell>{row.hazard_type || ""}</TableCell>
        <TableCell>{formatCreatedAt(row.created_at)}</TableCell>
        <TableCell>{row.status || ""}</TableCell>
        <TableCell>{row.tags || ""}</TableCell>
        <TableCell align="right" padding="none">
          <IconButton size="small" aria-label={`actions-${row.id}`} onClick={openMenu}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
          <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
            <MenuItem onClick={() => handleAction("restore")}>Restore</MenuItem>
            <MenuItem
              onClick={() => {
                closeMenu();
                setEditing(true);
              }}
            >
              Rename
            </MenuItem>
            <MenuItem onClick={() => handleAction("export-pdf")}>Export PDF</MenuItem>
            <MenuItem onClick={() => handleAction("export-excel")}>Export Excel</MenuItem>
            <MenuItem onClick={() => handleAction("delete")}>Delete</MenuItem>
          </Menu>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={COLUMNS.length + 3} sx={{ p: 0, borderBottom: 0 }}>
            <Box sx={{ p: 2, backgroundColor: "action.hover" }}>
              <SnapshotDrawer scenarioId={row.id} />
            </Box>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

ScenarioRow.propTypes = {
  row: PropTypes.object.isRequired,
  selected: PropTypes.bool.isRequired,
  onToggleSelected: PropTypes.func.isRequired,
  onRename: PropTypes.func.isRequired,
  onAction: PropTypes.func.isRequired,
};

const ScenarioTable = ({
  rows,
  selectedIds,
  sortKey,
  sortDir,
  onSort,
  onToggleSelected,
  onToggleAll,
  onRename,
  onAction,
}) => {
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));
  const indeterminate = selectedIds.length > 0 && !allSelected;

  return (
    <TableContainer>
      <Table size="small" aria-label="scenario-table">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Checkbox
                checked={allSelected}
                indeterminate={indeterminate}
                onChange={() => onToggleAll(!allSelected)}
                inputProps={{ "aria-label": "select-all" }}
              />
            </TableCell>
            <TableCell padding="none" />
            {COLUMNS.map((col) => (
              <TableCell key={col.key} sortDirection={sortKey === col.key ? sortDir : false}>
                {col.sortable ? (
                  <TableSortLabel
                    active={sortKey === col.key}
                    direction={sortKey === col.key ? sortDir : "asc"}
                    onClick={() => onSort(col.key)}
                  >
                    {col.label}
                  </TableSortLabel>
                ) : (
                  col.label
                )}
              </TableCell>
            ))}
            <TableCell padding="none" />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <ScenarioRow
              key={row.id}
              row={row}
              selected={selectedIds.includes(row.id)}
              onToggleSelected={onToggleSelected}
              onRename={onRename}
              onAction={onAction}
            />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

ScenarioTable.propTypes = {
  rows: PropTypes.array.isRequired,
  selectedIds: PropTypes.array.isRequired,
  sortKey: PropTypes.string.isRequired,
  sortDir: PropTypes.oneOf(["asc", "desc"]).isRequired,
  onSort: PropTypes.func.isRequired,
  onToggleSelected: PropTypes.func.isRequired,
  onToggleAll: PropTypes.func.isRequired,
  onRename: PropTypes.func.isRequired,
  onAction: PropTypes.func.isRequired,
};

export default ScenarioTable;
