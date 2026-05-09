import React from "react";
import { useTranslation } from "react-i18next";
import {
  Chip,
  IconButton,
  Paper,
  Radio,
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

const DataList = ({ datasets, selectedId, onSelect, onRequestDelete, deleteDisabled }) => {
  const { t } = useTranslation();

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">{t("settings_cred_data_list_title")}</Typography>
      {datasets.length === 0 ? (
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
              {datasets.map((dataset) => (
                <TableRow
                  key={dataset.id}
                  selected={dataset.id === selectedId}
                  hover
                  onClick={() => onSelect(dataset)}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell padding="checkbox">
                    <Radio
                      checked={dataset.id === selectedId}
                      onChange={() => onSelect(dataset)}
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
