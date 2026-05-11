import React, { useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";

const NAME_LIST_THRESHOLD = 5;

const BulkDeleteBar = ({ selectedIds, scenarios, onConfirmDelete, onClear }) => {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (selectedIds.length === 0) return null;

  const count = selectedIds.length;
  const selectedRows = selectedIds
    .map((id) => scenarios.find((row) => row.id === id))
    .filter(Boolean);
  const showNames = count <= NAME_LIST_THRESHOLD;

  const openDialog = () => setDialogOpen(true);
  const closeDialog = () => {
    if (!busy) setDialogOpen(false);
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirmDelete();
    } finally {
      setBusy(false);
      setDialogOpen(false);
    }
  };

  return (
    <>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        aria-label="bulk-action-bar"
        sx={{ minHeight: 40 }}
      >
        <Typography variant="body2">{t("workspace_scenarios_selected", { count })}</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          size="small"
          color="error"
          variant="outlined"
          startIcon={<DeleteIcon />}
          onClick={openDialog}
          aria-label="bulk-delete-open"
        >
          {t("workspace_bulk_delete_button")}
        </Button>
        <Button size="small" variant="text" onClick={onClear} aria-label="bulk-clear-selection">
          {t("workspace_bulk_clear_selection")}
        </Button>
      </Stack>
      <Dialog open={dialogOpen} onClose={closeDialog} aria-labelledby="bulk-delete-confirm-title">
        <DialogTitle id="bulk-delete-confirm-title">
          {t("workspace_bulk_delete_confirm_title", { count })}
        </DialogTitle>
        <DialogContent>
          {showNames ? (
            <Box>
              <Typography variant="body2" color="text.secondary">
                {t("workspace_bulk_delete_confirm_lead")}
              </Typography>
              <Box component="ul" sx={{ mt: 1, mb: 0, pl: 3 }}>
                {selectedRows.map((row) => (
                  <li key={row.id}>{row.name || row.id}</li>
                ))}
              </Box>
            </Box>
          ) : (
            <DialogContentText>
              {t("workspace_bulk_delete_confirm_summary", { count })}
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={busy} aria-label="bulk-delete-cancel">
            {t("cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            color="error"
            variant="contained"
            disabled={busy}
            aria-label="bulk-delete-confirm"
          >
            {t("workspace_bulk_delete_button")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

BulkDeleteBar.propTypes = {
  selectedIds: PropTypes.arrayOf(PropTypes.string).isRequired,
  scenarios: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string,
    })
  ).isRequired,
  onConfirmDelete: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
};

export default BulkDeleteBar;
