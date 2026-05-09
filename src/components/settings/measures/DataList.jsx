import React from "react";
import { useTranslation } from "react-i18next";
import {
  Chip,
  IconButton,
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
import DeleteIcon from "@mui/icons-material/DeleteOutlineOutlined";

const formatUploadedAt = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const scopeLabel = (value, t) => {
  if (!value) return t("settings_measures_scope_all");
  return value;
};

const DataList = ({ datasets, onRequestDelete, deleteDisabled }) => {
  const { t } = useTranslation();

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">{t("settings_measures_list_title")}</Typography>
      {datasets.length === 0 ? (
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
              {datasets.map((dataset) => (
                <TableRow key={dataset.id} hover>
                  <TableCell>{dataset.name}</TableCell>
                  <TableCell>{scopeLabel(dataset.countries, t)}</TableCell>
                  <TableCell>{scopeLabel(dataset.hazards, t)}</TableCell>
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
                            onClick={() => onRequestDelete(dataset)}
                            disabled={deleteDisabled}
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
  );
};

export default DataList;
