import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Line } from "react-chartjs-2";
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";

import RiskWiseClient from "../../lib/RiskWiseClient";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend);

const CHART_HEIGHT = 320;

// Editing happens on the raw spec dict. The editor coerces inputs back to
// numbers on save; while typing we keep the raw string so a half-typed
// "0." doesn't snap to "0" on every keystroke.
const toEditableRows = (spec) =>
  spec.intensity.map((intensity, idx) => ({
    intensity: String(intensity),
    mdd: String(spec.mdd[idx]),
    paa: String(spec.paa[idx]),
  }));

const parseRows = (rows) => ({
  intensity: rows.map((r) => Number(r.intensity)),
  mdd: rows.map((r) => Number(r.mdd)),
  paa: rows.map((r) => Number(r.paa)),
});

const errorFieldSet = (errors) => new Set((errors || []).map((e) => e.field));

const ImpactFunctionDialog = ({
  open,
  onClose,
  impactFunction,
  // When ``mode === "custom"`` the dialog renders an "Edit" affordance.
  // ERA stays strictly read-only because its IFs are canonical (#453).
  mode = "era",
  // Existing pending override (resumes mid-edit) — the editor seeds from
  // this instead of the canonical curve when present so the user does not
  // lose work when reopening the dialog.
  pendingOverride = null,
  // Save callback — receives the validated override spec. The store/hook
  // wiring lives in the parent so this component stays presentational.
  onSaveOverride = null,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const editable = mode === "custom";

  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  // Seed editor state whenever the dialog opens or the underlying spec
  // changes. Pending overrides win over the canonical spec so a user
  // reopening the dialog mid-edit picks up exactly where they left off.
  useEffect(() => {
    if (!open) return;
    const seed = pendingOverride ?? impactFunction;
    if (!seed) return;
    setRows(toEditableRows(seed));
    setEditing(false);
    setErrors([]);
    setSubmitError("");
  }, [open, impactFunction, pendingOverride]);

  const liveSpec = useMemo(() => {
    const base = pendingOverride ?? impactFunction;
    if (!base) return null;
    if (!editing) return base;
    const parsed = parseRows(rows);
    return {
      ...base,
      intensity: parsed.intensity,
      mdd: parsed.mdd,
      paa: parsed.paa,
    };
  }, [pendingOverride, impactFunction, editing, rows]);

  const chartData = useMemo(() => {
    if (!liveSpec) return null;
    return {
      labels: liveSpec.intensity.map((v) => v),
      datasets: [
        {
          label: t("impact_function_dialog_mdd"),
          data: liveSpec.mdd,
          borderColor: theme.palette.primary.main,
          backgroundColor: theme.palette.primary.main,
          tension: 0.1,
          pointRadius: 3,
        },
        {
          label: t("impact_function_dialog_paa"),
          data: liveSpec.paa,
          borderColor: theme.palette.secondary.main,
          backgroundColor: theme.palette.secondary.main,
          tension: 0.1,
          pointRadius: 3,
        },
      ],
    };
  }, [liveSpec, theme, t]);

  if (!impactFunction && !pendingOverride) return null;

  const headerSpec = liveSpec;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: "linear",
        title: {
          display: true,
          text: t("impact_function_dialog_intensity_axis", {
            unit: headerSpec.intensity_unit,
          }),
        },
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: t("impact_function_dialog_yaxis") },
      },
    },
    plugins: {
      legend: { position: "top" },
      tooltip: { mode: "index", intersect: false },
    },
  };

  const errorFields = errorFieldSet(errors);
  const isModified = pendingOverride != null;

  const handleCellChange = (idx, key) => (event) => {
    const value = event.target.value;
    setRows((prev) => prev.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));
  };

  const handleEnterEdit = () => {
    setEditing(true);
    setErrors([]);
    setSubmitError("");
  };

  const handleCancelEdit = () => {
    const seed = pendingOverride ?? impactFunction;
    setRows(toEditableRows(seed));
    setEditing(false);
    setErrors([]);
    setSubmitError("");
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    setSubmitError("");
    const parsed = parseRows(rows);
    const candidate = {
      ...impactFunction,
      ...parsed,
    };
    try {
      const response = await RiskWiseClient.validateImpactFunction(candidate);
      if (!response.success) {
        setSubmitError(response.error?.message || t("impact_function_editor_save_error"));
        return;
      }
      const result = response.result?.data;
      if (!result?.valid) {
        setErrors(result?.errors || []);
        return;
      }
      setErrors([]);
      onSaveOverride?.(candidate);
      setEditing(false);
    } catch (err) {
      setSubmitError(err?.message || t("impact_function_editor_save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      aria-labelledby="impact-function-dialog-title"
    >
      <DialogTitle id="impact-function-dialog-title">
        <Stack>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography component="span" variant="h6">
              {t("impact_function_dialog_title", {
                id: headerSpec.id,
                name: headerSpec.name,
              })}
            </Typography>
            {isModified && (
              <Chip
                color="warning"
                size="small"
                label={t("impact_function_modified_badge")}
                data-testid="impact-function-modified-badge"
              />
            )}
          </Stack>
          <Typography component="span" variant="caption" color="text.secondary">
            {t("impact_function_dialog_intensity_unit", {
              unit: headerSpec.intensity_unit,
            })}
          </Typography>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ height: CHART_HEIGHT, mb: 2 }} data-testid="impact-function-chart">
          <Line data={chartData} options={chartOptions} />
        </Box>
        {submitError && (
          <Alert severity="error" sx={{ mb: 2 }} data-testid="impact-function-editor-submit-error">
            {submitError}
          </Alert>
        )}
        {errors.length > 0 && (
          <Alert severity="error" sx={{ mb: 2 }} data-testid="impact-function-editor-errors">
            <Stack spacing={0.5}>
              {errors.map((e) => (
                <Typography variant="body2" key={`${e.field}-${e.code}`}>
                  {e.field ? `${e.field}: ${e.message}` : e.message}
                </Typography>
              ))}
            </Stack>
          </Alert>
        )}
        <TableContainer>
          <Table size="small" data-testid="impact-function-table">
            <TableHead>
              <TableRow>
                <TableCell>
                  {t("impact_function_dialog_intensity_axis", {
                    unit: headerSpec.intensity_unit,
                  })}
                </TableCell>
                <TableCell align="right">{t("impact_function_dialog_mdd")}</TableCell>
                <TableCell align="right">{t("impact_function_dialog_paa")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {editing
                ? rows.map((row, idx) => (
                    <TableRow key={`edit-${idx}`}>
                      <TableCell>
                        <TextField
                          size="small"
                          type="number"
                          value={row.intensity}
                          onChange={handleCellChange(idx, "intensity")}
                          error={
                            errorFields.has(`intensity[${idx}]`) || errorFields.has("intensity")
                          }
                          slotProps={{
                            htmlInput: {
                              "data-testid": `impact-function-editor-intensity-${idx}`,
                              step: "any",
                            },
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          size="small"
                          type="number"
                          value={row.mdd}
                          onChange={handleCellChange(idx, "mdd")}
                          error={errorFields.has(`mdd[${idx}]`) || errorFields.has("mdd")}
                          slotProps={{
                            htmlInput: {
                              "data-testid": `impact-function-editor-mdd-${idx}`,
                              step: "any",
                            },
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          size="small"
                          type="number"
                          value={row.paa}
                          onChange={handleCellChange(idx, "paa")}
                          error={errorFields.has(`paa[${idx}]`) || errorFields.has("paa")}
                          slotProps={{
                            htmlInput: {
                              "data-testid": `impact-function-editor-paa-${idx}`,
                              step: "any",
                            },
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                : headerSpec.intensity.map((intensityValue, idx) => (
                    <TableRow key={`${intensityValue}-${idx}`}>
                      <TableCell>{intensityValue}</TableCell>
                      <TableCell align="right">{headerSpec.mdd[idx]}</TableCell>
                      <TableCell align="right">{headerSpec.paa[idx]}</TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        {editable && !editing && (
          <Button
            onClick={handleEnterEdit}
            data-testid="impact-function-editor-enter"
            disabled={!impactFunction}
          >
            {t("impact_function_editor_edit")}
          </Button>
        )}
        {editable && editing && (
          <>
            <Button
              onClick={handleCancelEdit}
              data-testid="impact-function-editor-cancel"
              disabled={saving}
            >
              {t("impact_function_editor_cancel")}
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveEdit}
              data-testid="impact-function-editor-save"
              disabled={saving}
            >
              {t("impact_function_editor_save")}
            </Button>
          </>
        )}
        {!editing && <Button onClick={onClose}>{t("close")}</Button>}
      </DialogActions>
    </Dialog>
  );
};

export default ImpactFunctionDialog;
