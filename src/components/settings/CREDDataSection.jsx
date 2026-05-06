import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Radio,
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
import useStore from "../../store";
import { enqueueToast } from "../../hooks/useToast";
import { layoutTransition } from "../../theme/theme";

const isXlsxPath = (filePath) => typeof filePath === "string" && /\.xlsx$/i.test(filePath);

const formatUploadedAt = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const splitErrors = (message) => {
  if (!message) return [];
  // Backend joins validation errors with "; " — unpack so we can render them
  // as a bulleted list rather than a single cramped toast message.
  return String(message)
    .split(/;\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
};

const CREDDataSection = () => {
  const { t } = useTranslation();
  const credDatasets = useStore((s) => s.credDatasets);
  const setCredDatasets = useStore((s) => s.setCredDatasets);
  const activeCredDatasetId = useStore((s) => s.activeCredDatasetId);
  const setActiveCredDatasetId = useStore((s) => s.setActiveCredDatasetId);

  const [busy, setBusy] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingPath, setPendingPath] = useState(null);
  const [pendingName, setPendingName] = useState("");
  const [errors, setErrors] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const builtinId = useMemo(
    () => credDatasets.find((d) => d.is_builtin)?.id ?? null,
    [credDatasets]
  );
  const selectedId = activeCredDatasetId ?? builtinId;

  const refreshList = useCallback(async () => {
    try {
      const res = await RiskWiseClient.listCREDDatasets();
      if (res?.success && res.result?.data) {
        setCredDatasets(res.result.data);
      }
    } catch {
      // Keep the current list on transient failures — wiping it would hide
      // the built-in row and make the panel look broken on one bad request.
    }
  }, [setCredDatasets]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const handleDismissUpload = useCallback(() => {
    setPendingPath(null);
    setPendingName("");
    setErrors([]);
  }, []);

  const handleFilePicked = useCallback(
    (filePath) => {
      if (!isXlsxPath(filePath)) {
        enqueueToast({ severity: "error", message: t("settings_cred_data_not_xlsx") });
        return;
      }
      const suggestedName = (filePath.split(/[\\/]/).pop() || "").replace(/\.xlsx$/i, "").trim();
      setPendingPath(filePath);
      setPendingName(suggestedName || "CRED dataset");
      setErrors([]);
    },
    [t]
  );

  const handleBrowse = useCallback(async () => {
    if (!window.electron?.selectCredDataset) return;
    const result = await window.electron.selectCredDataset();
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
        enqueueToast({ severity: "error", message: t("settings_cred_data_drop_unsupported") });
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
      const res = await RiskWiseClient.uploadCREDDataset({
        name: pendingName.trim(),
        xlsx_path: pendingPath,
      });
      if (res?.success && res.result?.data) {
        enqueueToast({
          severity: "success",
          message: t("settings_cred_data_uploaded", { name: pendingName.trim() }),
        });
        await refreshList();
        setActiveCredDatasetId(res.result.data.id);
        handleDismissUpload();
      } else {
        const detail = res?.error?.message || t("settings_cred_data_upload_failed");
        const parts = splitErrors(detail);
        setErrors(parts.length > 0 ? parts : [detail]);
        enqueueToast({ severity: "error", message: t("settings_cred_data_upload_failed") });
      }
    } finally {
      setBusy(null);
    }
  }, [pendingPath, pendingName, refreshList, setActiveCredDatasetId, handleDismissUpload, t]);

  const handleDelete = useCallback(
    async (dataset) => {
      setBusy(`deleting-${dataset.id}`);
      try {
        const res = await RiskWiseClient.deleteCREDDataset(dataset.id);
        if (res?.success) {
          enqueueToast({
            severity: "success",
            message: t("settings_cred_data_deleted", { name: dataset.name }),
          });
          if (activeCredDatasetId === dataset.id) {
            setActiveCredDatasetId(null);
          }
          await refreshList();
        } else {
          const detail = res?.error?.message || t("settings_cred_data_delete_failed");
          enqueueToast({ severity: "error", message: detail });
        }
      } finally {
        setBusy(null);
        setConfirmDelete(null);
      }
    },
    [activeCredDatasetId, setActiveCredDatasetId, refreshList, t]
  );

  const handleSelect = useCallback(
    (dataset) => {
      setActiveCredDatasetId(dataset.is_builtin ? null : dataset.id);
    },
    [setActiveCredDatasetId]
  );

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

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h6">{t("settings_cred_data_title")}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t("settings_cred_data_description")}
        </Typography>
      </Stack>

      <Box
        // Drop zone is a pointer-only enhancement; the inner Browse button
        // owns keyboard activation. Removing role="button"/tabIndex avoids
        // a nested-interactive WCAG violation (issue #121).
        aria-label={t("settings_cred_data_dropzone_aria")}
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
          {t("settings_cred_data_dropzone_headline")}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {t("settings_cred_data_dropzone_hint")}
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
          {t("settings_cred_data_browse")}
        </Button>
      </Box>

      {errors.length > 0 && (
        <Alert severity="error" variant="outlined">
          <AlertTitle>{t("settings_cred_data_invalid_title")}</AlertTitle>
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
        <Typography variant="subtitle2">{t("settings_cred_data_list_title")}</Typography>
        {credDatasets.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {t("settings_cred_data_list_empty")}
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label={t("settings_cred_data_list_table_aria")}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>{t("settings_cred_data_col_name")}</TableCell>
                  <TableCell>{t("settings_cred_data_col_source")}</TableCell>
                  <TableCell>{t("settings_cred_data_col_uploaded_at")}</TableCell>
                  <TableCell>{t("settings_cred_data_col_type")}</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {credDatasets.map((dataset) => (
                  <TableRow
                    key={dataset.id}
                    selected={dataset.id === selectedId}
                    hover
                    onClick={() => handleSelect(dataset)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell padding="checkbox">
                      <Radio
                        checked={dataset.id === selectedId}
                        onChange={() => handleSelect(dataset)}
                        inputProps={{
                          "aria-label": t("settings_cred_data_active_aria", {
                            name: dataset.name,
                          }),
                        }}
                      />
                    </TableCell>
                    <TableCell>{dataset.name}</TableCell>
                    <TableCell>
                      {dataset.is_builtin
                        ? t("settings_cred_data_source_builtin")
                        : t("settings_cred_data_source_custom")}
                    </TableCell>
                    <TableCell>{formatUploadedAt(dataset.uploaded_at)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={
                          dataset.is_builtin
                            ? t("settings_cred_data_type_builtin")
                            : t("settings_cred_data_type_custom")
                        }
                        color={dataset.is_builtin ? "default" : "secondary"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      {!dataset.is_builtin && (
                        <Tooltip title={t("settings_cred_data_delete_tooltip")}>
                          <span>
                            <IconButton
                              size="small"
                              aria-label={t("settings_cred_data_delete_aria", {
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
        aria-labelledby="cred-upload-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="cred-upload-title">{t("settings_cred_data_title")}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {t("settings_cred_data_description")}
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            label={t("settings_cred_data_name_label")}
            placeholder={t("settings_cred_data_name_placeholder")}
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            disabled={busy === "uploading"}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDismissUpload} disabled={busy === "uploading"}>
            {t("settings_cred_data_upload_cancel")}
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
              t("settings_cred_data_upload_action")
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        aria-labelledby="cred-delete-title"
      >
        <DialogTitle id="cred-delete-title">{t("settings_cred_data_delete_title")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("settings_cred_data_delete_body", {
              name: confirmDelete?.name ?? "",
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>{t("cancel")}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => confirmDelete && handleDelete(confirmDelete)}
            disabled={busy !== null}
          >
            {t("settings_cred_data_delete_action")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default CREDDataSection;
