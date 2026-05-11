import React, { useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import SettingsBackupRestoreIcon from "@mui/icons-material/SettingsBackupRestore";
import EditIcon from "@mui/icons-material/Edit";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import DeleteIcon from "@mui/icons-material/Delete";

import { formatDateTime } from "../../lib/formatDate";
import { isRtl } from "../../i18nConfig";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import SnapshotDrawer from "./SnapshotDrawer";

const formatCreatedAt = (value, locale) => {
  if (!value) return "";
  try {
    return formatDateTime(value, locale);
  } catch {
    return String(value);
  }
};

const COLUMNS = [
  { key: "name", label: "Name", sortable: true },
  { key: "country", label: "Country", sortable: true },
  { key: "hazard_type", label: "Hazard", sortable: false },
  { key: "created_at", label: "Created At", sortable: true },
  { key: "tags", label: "Tags", sortable: false },
];

// Sticky-right styling keeps the Actions column visible during horizontal
// scroll on narrow viewports. The body cell uses `inherit` so the row's
// hover background still shows through.
const STICKY_ACTIONS_HEADER_SX = {
  position: "sticky",
  right: 0,
  backgroundColor: "background.paper",
  zIndex: 2,
};
const STICKY_ACTIONS_CELL_SX = {
  position: "sticky",
  right: 0,
  backgroundColor: "inherit",
  zIndex: 1,
};

const ScenarioRow = ({
  row,
  selected,
  pinned,
  isActive,
  onToggleSelected,
  onTogglePinned,
  onRename,
  onAction,
}) => {
  const { i18n, t } = useTranslation();
  const locale = i18n.language;
  const rtl = isRtl(locale);
  const theme = useTheme();
  // < 600px collapses the inline icon row back to a kebab menu so the table
  // still fits on phone-sized viewports without horizontal squashing.
  const isCompact = useMediaQuery(theme.breakpoints.down("sm"));
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(row.name || "");
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [expanded, setExpanded] = useState(false);
  // Dialog open state lives on the row so two rows can't share a single open
  // confirm dialog.
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

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
    // Defer so the Menu finishes restoring focus to the trigger IconButton
    // before a downstream Dialog applies aria-hidden to <div id="root">;
    // otherwise Chromium logs an a11y warning about a focused descendant
    // under an aria-hidden ancestor.
    setTimeout(() => onAction(action, row), 0);
  };

  const handleRestoreClick = () => onAction("restore", row);
  const handleExportClick = () => onAction("export-pdf", row);
  const handleRenameClick = () => setEditing(true);
  const handleDeleteClick = () => setConfirmDeleteOpen(true);
  const handleDeleteCancel = () => setConfirmDeleteOpen(false);
  const handleDeleteConfirm = () => {
    setConfirmDeleteOpen(false);
    onAction("delete", row);
  };

  const restoreLabel = isActive
    ? t("workspace_action_restore_disabled")
    : t("workspace_action_restore");

  const renderInlineActions = () => (
    <Stack direction="row" spacing={1} justifyContent="flex-end">
      <Tooltip title={restoreLabel}>
        <span>
          <IconButton
            size="small"
            aria-label={`restore-${row.id}`}
            onClick={handleRestoreClick}
            disabled={isActive}
          >
            <SettingsBackupRestoreIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t("workspace_action_rename")}>
        <IconButton size="small" aria-label={`rename-${row.id}`} onClick={handleRenameClick}>
          <EditIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("workspace_action_export_pdf")}>
        <IconButton size="small" aria-label={`export-pdf-${row.id}`} onClick={handleExportClick}>
          <PictureAsPdfIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("workspace_action_delete")}>
        <IconButton size="small" aria-label={`delete-${row.id}`} onClick={handleDeleteClick}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );

  const renderCompactMenu = () => (
    <>
      <IconButton size="small" aria-label={`actions-${row.id}`} onClick={openMenu}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem disabled={isActive} onClick={() => handleAction("restore")}>
          {isActive ? t("workspace_action_restore_disabled") : t("workspace_action_restore")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeMenu();
            setEditing(true);
          }}
        >
          {t("workspace_action_rename")}
        </MenuItem>
        <MenuItem onClick={() => handleAction("export-pdf")}>
          {t("workspace_action_export_pdf")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeMenu();
            // Defer the dialog open for the same a11y reason as handleAction.
            setTimeout(() => setConfirmDeleteOpen(true), 0);
          }}
        >
          {t("workspace_action_delete")}
        </MenuItem>
      </Menu>
    </>
  );

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
            aria-label={
              pinned
                ? t("workspace_unpin_aria", { id: row.id })
                : t("workspace_pin_aria", { id: row.id })
            }
            aria-pressed={pinned}
            data-testid={`pin-${row.id}`}
            onClick={() => onTogglePinned(row.id)}
          >
            {pinned ? (
              <StarIcon fontSize="small" color="primary" />
            ) : (
              <StarBorderIcon fontSize="small" />
            )}
          </IconButton>
        </TableCell>
        <TableCell padding="none">
          <IconButton
            size="small"
            aria-label={`expand-${row.id}`}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? (
              <ExpandMoreIcon fontSize="small" />
            ) : (
              // ChevronRight points inward on LTR expand rows; in RTL the arrow
              // must flip so it still points toward the content column.
              <ChevronRightIcon
                fontSize="small"
                sx={rtl ? { transform: "scaleX(-1)" } : undefined}
              />
            )}
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
              slotProps={{ htmlInput: { "aria-label": `rename-input-${row.id}` } }}
            />
          ) : (
            row.name || row.id
          )}
        </TableCell>
        <TableCell>{row.country || ""}</TableCell>
        <TableCell>{row.hazard_type || ""}</TableCell>
        <TableCell>{formatCreatedAt(row.created_at, locale)}</TableCell>
        <TableCell>{row.tags || ""}</TableCell>
        <TableCell align="right" padding="none" sx={STICKY_ACTIONS_CELL_SX}>
          {isCompact ? renderCompactMenu() : renderInlineActions()}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={COLUMNS.length + 4} sx={{ p: 0, borderBottom: 0 }}>
            <Box sx={{ p: 2, backgroundColor: "action.hover" }}>
              <SnapshotDrawer scenarioId={row.id} />
            </Box>
          </TableCell>
        </TableRow>
      )}
      <Dialog
        open={confirmDeleteOpen}
        onClose={handleDeleteCancel}
        aria-labelledby={`delete-confirm-title-${row.id}`}
      >
        <DialogTitle id={`delete-confirm-title-${row.id}`}>
          {t("workspace_delete_confirm_title")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("workspace_delete_confirm_body", { name: row.name || row.id })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>{t("cancel")}</Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            aria-label={`delete-confirm-${row.id}`}
          >
            {t("workspace_delete_confirm_action")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

ScenarioRow.propTypes = {
  row: PropTypes.object.isRequired,
  selected: PropTypes.bool.isRequired,
  pinned: PropTypes.bool.isRequired,
  isActive: PropTypes.bool.isRequired,
  onToggleSelected: PropTypes.func.isRequired,
  onTogglePinned: PropTypes.func.isRequired,
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
  const { t } = useTranslation();
  const pinnedIds = useWorkspaceStore((state) => state.pinnedIds);
  const togglePinned = useWorkspaceStore((state) => state.togglePinned);
  // The store's `scenarioRunCode` matches the row's `id` once a scenario has
  // been restored (see `restoreScenario` in `utils/reportTools.js`), so we
  // compare against `row.id` to flag the active scenario.
  const scenarioRunCode = useWorkspaceStore((state) => state.scenarioRunCode);
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
            <TableCell align="right" sx={STICKY_ACTIONS_HEADER_SX}>
              {t("workspace_actions_header")}
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <ScenarioRow
              key={row.id}
              row={row}
              selected={selectedIds.includes(row.id)}
              pinned={pinnedIds.includes(row.id)}
              isActive={Boolean(scenarioRunCode) && scenarioRunCode === row.id}
              onToggleSelected={onToggleSelected}
              onTogglePinned={togglePinned}
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
