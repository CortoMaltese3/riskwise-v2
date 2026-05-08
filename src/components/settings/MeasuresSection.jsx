import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteIcon from "@mui/icons-material/DeleteOutlineOutlined";

import RiskWiseClient from "../../lib/RiskWiseClient";
import { enqueueToast } from "../../hooks/useToast";
import { useListManager } from "../../hooks/useListManager";
import { layoutTransition } from "../../theme/theme";

const isXlsxPath = (filePath) => typeof filePath === "string" && /\.xlsx$/i.test(filePath);

const formatUploadedAt = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const splitErrors = (message) => {
  if (!message) return [];
  return String(message)
    .split(/;\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
};

const MeasuresSection = () => {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [pendingPath, setPendingPath] = useState(null);
  const [pendingName, setPendingName] = useState("");
  const [errors, setErrors] = useState([]);

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

  const handleDismissUpload = useCallback(() => {
    setPendingPath(null);
    setPendingName("");
    setErrors([]);
  }, []);

  const handleFilePicked = useCallback(
    (filePath) => {
      if (!isXlsxPath(filePath)) {
        enqueueToast({ severity: "error", message: t("settings_measures_not_xlsx") });
        return;
      }
      const suggestedName = (filePath.split(/[\\/]/).pop() || "").replace(/\.xlsx$/i, "").trim();
      setPendingPath(filePath);
      setPendingName(suggestedName || "Adaptation measures");
      setErrors([]);
    },
    [t]
  );

  const handleBrowse = useCallback(async () => {
    if (!window.electron?.selectMeasuresDataset) return;
    const result = await window.electron.selectMeasuresDataset();
    if (result?.success && result.filePath) {
      handleFilePicked(result.filePath);
    } else if (result?.reason && result.reason !== "cancelled") {
      enqueueToast({ severity: "error", message: result.reason });
    }
  }, [handleFilePicked]);

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      const filePath =
        (window.electron?.getPathForFile && window.electron.getPathForFile(file)) || file.path;
      if (!filePath) {
        enqueueToast({ severity: "error", message: t("settings_measures_drop_unsupported") });
        return;
      }
      handleFilePicked(filePath);
    },
    [handleFilePicked, t]
  );

  const handleConfirmUpload = useCallback(async () => {
    if (!pendingPath || !pendingName.trim()) return;
    setBusy("uploading");
    setErrors([]);
    try {
      const res = await RiskWiseClient.uploadMeasureDataset({
        name: pendingName.trim(),
        xlsx_path: pendingPath,
      });
      if (res?.success && res.result?.data) {
        enqueueToast({
          severity: "success",
          message: t("settings_measures_uploaded", { name: pendingName.trim() }),
        });
        await refresh();
        handleDismissUpload();
      } else {
        const detail = res?.error?.message || t("settings_measures_upload_failed");
        const parts = splitErrors(detail);
        setErrors(parts.length > 0 ? parts : [detail]);
        enqueueToast({ severity: "error", message: t("settings_measures_upload_failed") });
      }
    } finally {
      setBusy(null);
    }
  }, [pendingPath, pendingName, refresh, handleDismissUpload, setBusy, t]);

  const dropZoneSx = useMemo(
    () => ({
      border: 2,
      borderStyle: "dashed",
      borderColor: isDragging ? "primary.main" : "divider",
      borderRadius: 2,
      p: 4,
      textAlign: "center",
      cursor: "pointer",
      bgcolor: isDragging ? "action.hover" : "transparent",
      transition: layoutTransition(["background-color", "border-color"]),
    }),
    [isDragging]
  );

  const scopeLabel = (value) => {
    if (!value) return t("settings_measures_scope_all");
    return value;
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h6">{t("settings_measures_title")}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t("settings_measures_description")}
        </Typography>
      </Stack>

      <Box
        // Drop zone is a pointer-only enhancement; the inner Browse button
        // owns keyboard activation. Removing role="button"/tabIndex avoids
        // a nested-interactive WCAG violation (issue #121).
        aria-label={t("settings_measures_dropzone_aria")}
        sx={dropZoneSx}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <CloudUploadIcon sx={{ fontSize: 40, color: "text.secondary" }} />
        <Typography variant="body1" sx={{ mt: 1 }}>
          {t("settings_measures_dropzone_headline")}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {t("settings_measures_dropzone_hint")}
        </Typography>
        <Button
          variant="contained"
          sx={{ mt: 2 }}
          disabled={busy !== null}
          onClick={(e) => {
            e.stopPropagation();
            handleBrowse();
          }}
        >
          {t("settings_measures_browse")}
        </Button>
      </Box>

      {errors.length > 0 && (
        <Alert severity="error" variant="outlined">
          <AlertTitle>{t("settings_measures_invalid_title")}</AlertTitle>
          <List dense disablePadding>
            {errors.map((err, idx) => (
              <ListItem key={idx} sx={{ py: 0 }}>
                <ListItemText primary={err} primaryTypographyProps={{ variant: "body2" }} />
              </ListItem>
            ))}
          </List>
        </Alert>
      )}

      <Stack spacing={1}>
        <Typography variant="subtitle2">{t("settings_measures_list_title")}</Typography>
        {measureSets.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {t("settings_measures_list_empty")}
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label={t("settings_measures_list_table_aria")}>
              <TableHead>
                <TableRow>
                  <TableCell>{t("settings_measures_col_name")}</TableCell>
                  <TableCell>{t("settings_measures_col_country")}</TableCell>
                  <TableCell>{t("settings_measures_col_hazard")}</TableCell>
                  <TableCell align="right">{t("settings_measures_col_count")}</TableCell>
                  <TableCell>{t("settings_measures_col_type")}</TableCell>
                  <TableCell>{t("settings_measures_col_uploaded_at")}</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {measureSets.map((dataset) => (
                  <TableRow key={dataset.id} hover>
                    <TableCell>{dataset.name}</TableCell>
                    <TableCell>{scopeLabel(dataset.countries)}</TableCell>
                    <TableCell>{scopeLabel(dataset.hazards)}</TableCell>
                    <TableCell align="right">{dataset.measure_count ?? 0}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={
                          dataset.is_builtin
                            ? t("settings_measures_type_builtin")
                            : t("settings_measures_type_custom")
                        }
                        color={dataset.is_builtin ? "default" : "secondary"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{formatUploadedAt(dataset.uploaded_at)}</TableCell>
                    <TableCell align="right">
                      {!dataset.is_builtin && (
                        <Tooltip title={t("settings_measures_delete_tooltip")}>
                          <span>
                            <IconButton
                              size="small"
                              aria-label={t("settings_measures_delete_aria", {
                                name: dataset.name,
                              })}
                              onClick={() => setConfirmDelete(dataset)}
                              disabled={busy !== null}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>

      <Dialog
        open={Boolean(pendingPath)}
        onClose={() => {
          if (busy !== "uploading") handleDismissUpload();
        }}
        aria-labelledby="measures-upload-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="measures-upload-title">{t("settings_measures_title")}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{t("settings_measures_description")}</DialogContentText>
          <TextField
            autoFocus
            fullWidth
            label={t("settings_measures_name_label")}
            placeholder={t("settings_measures_name_placeholder")}
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            disabled={busy === "uploading"}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDismissUpload} disabled={busy === "uploading"}>
            {t("settings_measures_upload_cancel")}
          </Button>
          <Button
            onClick={handleConfirmUpload}
            variant="contained"
            disabled={busy === "uploading" || !pendingName.trim()}
            autoFocus
          >
            {busy === "uploading" ? (
              <CircularProgress size={18} sx={{ color: "inherit" }} />
            ) : (
              t("settings_measures_upload_action")
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        aria-labelledby="measures-delete-title"
      >
        <DialogTitle id="measures-delete-title">{t("settings_measures_delete_title")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("settings_measures_delete_body", { name: confirmDelete?.name ?? "" })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>{t("cancel")}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => confirmDelete && remove(confirmDelete)}
            disabled={busy !== null}
          >
            {t("settings_measures_delete_action")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default MeasuresSection;
