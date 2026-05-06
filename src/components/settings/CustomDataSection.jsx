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
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteIcon from "@mui/icons-material/DeleteOutlineOutlined";

import RiskWiseClient from "../../lib/RiskWiseClient";
import { enqueueToast } from "../../hooks/useToast";
import { layoutTransition } from "../../theme/theme";

const isZipPath = (filePath) => typeof filePath === "string" && /\.zip$/i.test(filePath);

const formatInstalledAt = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const CustomDataSection = () => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validation, setValidation] = useState(null);
  const [pendingPath, setPendingPath] = useState(null);
  const [installed, setInstalled] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const refreshList = useCallback(async () => {
    try {
      const res = await RiskWiseClient.listCustomDataPacks();
      if (res?.success && res.result?.data?.countries) {
        setInstalled(res.result.data.countries);
      } else {
        setInstalled([]);
      }
    } catch {
      setInstalled([]);
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const handleValidate = useCallback(
    async (filePath) => {
      if (!isZipPath(filePath)) {
        enqueueToast({ severity: "error", message: t("settings_custom_data_not_zip") });
        return;
      }
      setBusy("validating");
      setValidation(null);
      try {
        const res = await RiskWiseClient.validateCustomDataPack({ zip_path: filePath });
        if (res?.success && res.result?.data) {
          setValidation(res.result.data);
          setPendingPath(filePath);
        } else {
          const detail = res?.error?.message || t("settings_custom_data_validate_failed");
          enqueueToast({ severity: "error", message: detail });
        }
      } finally {
        setBusy(null);
      }
    },
    [t]
  );

  const handleBrowse = useCallback(async () => {
    if (!window.electron?.selectCustomDataPack) return;
    const result = await window.electron.selectCustomDataPack();
    if (result?.success && result.filePath) {
      handleValidate(result.filePath);
    } else if (result?.reason && result.reason !== "cancelled") {
      enqueueToast({ severity: "error", message: result.reason });
    }
  }, [handleValidate]);

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      const filePath =
        (window.electron?.getPathForFile && window.electron.getPathForFile(file)) || file.path;
      if (!filePath) {
        enqueueToast({ severity: "error", message: t("settings_custom_data_drop_unsupported") });
        return;
      }
      handleValidate(filePath);
    },
    [handleValidate, t]
  );

  const handleConfirmImport = useCallback(async () => {
    if (!pendingPath || !validation?.valid) return;
    setBusy("importing");
    try {
      const res = await RiskWiseClient.importCustomDataPack({ zip_path: pendingPath });
      if (res?.success && res.result?.data) {
        enqueueToast({
          severity: "success",
          message: t("settings_custom_data_imported", {
            country: res.result.data.country_name,
            iso3: res.result.data.iso3,
          }),
        });
        await refreshList();
      } else {
        const detail = res?.error?.message || t("settings_custom_data_import_failed");
        enqueueToast({ severity: "error", message: detail });
      }
    } finally {
      setBusy(null);
      setValidation(null);
      setPendingPath(null);
    }
  }, [pendingPath, validation, refreshList, t]);

  const handleDelete = useCallback(
    async (iso3) => {
      setBusy(`deleting-${iso3}`);
      try {
        const res = await RiskWiseClient.deleteCustomDataPack(iso3);
        if (res?.success) {
          enqueueToast({
            severity: "success",
            message: t("settings_custom_data_deleted", { iso3 }),
          });
          await refreshList();
        } else {
          const detail = res?.error?.message || t("settings_custom_data_delete_failed");
          enqueueToast({ severity: "error", message: detail });
        }
      } finally {
        setBusy(null);
        setConfirmDelete(null);
      }
    },
    [refreshList, t]
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
        <Typography variant="h6">{t("settings_custom_data_title")}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t("settings_custom_data_description")}
        </Typography>
      </Stack>

      <Box
        // The drop zone container is decorative: the inner <Button> handles
        // both keyboard activation and screen-reader access to the browse
        // action. Giving the container its own `role="button"` produced a
        // nested-interactive WCAG violation (issue #121). Drag/drop is a
        // pointer-only enhancement; keyboard users use the inner button.
        aria-label={t("settings_custom_data_dropzone_aria")}
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
          {t("settings_custom_data_dropzone_headline")}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {t("settings_custom_data_dropzone_hint")}
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
          {busy === "validating" ? (
            <CircularProgress size={18} sx={{ color: "inherit" }} />
          ) : (
            t("settings_custom_data_browse")
          )}
        </Button>
      </Box>

      {validation && !validation.valid && validation.errors?.length > 0 && (
        <Alert severity="error" variant="outlined">
          <AlertTitle>{t("settings_custom_data_invalid_title")}</AlertTitle>
          <List dense disablePadding>
            {validation.errors.map((err, idx) => (
              <ListItem key={idx} sx={{ py: 0 }}>
                <ListItemText primary={err} primaryTypographyProps={{ variant: "body2" }} />
              </ListItem>
            ))}
          </List>
        </Alert>
      )}

      <Stack spacing={1}>
        <Typography variant="subtitle2">{t("settings_custom_data_installed_title")}</Typography>
        {installed.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {t("settings_custom_data_installed_empty")}
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label={t("settings_custom_data_installed_table_aria")}>
              <TableHead>
                <TableRow>
                  <TableCell>{t("settings_custom_data_col_name")}</TableCell>
                  <TableCell>{t("settings_custom_data_col_iso3")}</TableCell>
                  <TableCell>{t("settings_custom_data_col_installed_at")}</TableCell>
                  <TableCell>{t("settings_custom_data_col_source")}</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {installed.map((entry) => (
                  <TableRow key={entry.iso3}>
                    <TableCell>{entry.country_name}</TableCell>
                    <TableCell>
                      <Chip size="small" label={entry.iso3} />
                    </TableCell>
                    <TableCell>{formatInstalledAt(entry.installed_at)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={t("card_country_source_custom")}
                        color="secondary"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={t("settings_custom_data_delete_tooltip")}>
                        <span>
                          <IconButton
                            size="small"
                            aria-label={t("settings_custom_data_delete_aria", {
                              iso3: entry.iso3,
                            })}
                            onClick={() => setConfirmDelete(entry)}
                            disabled={busy !== null}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>

      <Dialog
        open={Boolean(validation?.valid && pendingPath)}
        onClose={() => {
          if (busy !== "importing") {
            setValidation(null);
            setPendingPath(null);
          }
        }}
        aria-labelledby="confirm-import-title"
      >
        <DialogTitle id="confirm-import-title">
          {t("settings_custom_data_confirm_title")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("settings_custom_data_confirm_body", {
              country: validation?.country_name ?? "",
              iso3: validation?.iso3 ?? "",
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setValidation(null);
              setPendingPath(null);
            }}
            disabled={busy === "importing"}
          >
            {t("cancel")}
          </Button>
          <Button
            onClick={handleConfirmImport}
            variant="contained"
            disabled={busy === "importing"}
            autoFocus
          >
            {busy === "importing" ? (
              <CircularProgress size={18} sx={{ color: "inherit" }} />
            ) : (
              t("settings_custom_data_confirm_action")
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        aria-labelledby="confirm-delete-title"
      >
        <DialogTitle id="confirm-delete-title">
          {t("settings_custom_data_delete_title")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("settings_custom_data_delete_body", {
              country: confirmDelete?.country_name ?? "",
              iso3: confirmDelete?.iso3 ?? "",
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>{t("cancel")}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => confirmDelete && handleDelete(confirmDelete.iso3)}
            disabled={busy !== null}
          >
            {t("settings_custom_data_delete_action")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default CustomDataSection;
