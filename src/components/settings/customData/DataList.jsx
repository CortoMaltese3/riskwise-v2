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

const formatInstalledAt = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const DataList = ({ installed, onRequestDelete, deleteDisabled }) => {
  const { t } = useTranslation();

  return (
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
                          onClick={() => onRequestDelete(entry)}
                          disabled={deleteDisabled}
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
  );
};

export default DataList;
