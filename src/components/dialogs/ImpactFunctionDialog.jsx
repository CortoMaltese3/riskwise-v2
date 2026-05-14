import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  Box,
  Button,
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

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend);

const CHART_HEIGHT = 320;

const ImpactFunctionDialog = ({ open, onClose, impactFunction }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const chartData = useMemo(() => {
    if (!impactFunction) return null;
    const { intensity, mdd, paa } = impactFunction;
    // Two-line single chart (AC #452): MDD and PAA share an x-axis so the
    // reader can read their interplay without flipping between subplots.
    return {
      labels: intensity.map((v) => v),
      datasets: [
        {
          label: t("impact_function_dialog_mdd"),
          data: mdd,
          borderColor: theme.palette.primary.main,
          backgroundColor: theme.palette.primary.main,
          tension: 0.1,
          pointRadius: 3,
        },
        {
          label: t("impact_function_dialog_paa"),
          data: paa,
          borderColor: theme.palette.secondary.main,
          backgroundColor: theme.palette.secondary.main,
          tension: 0.1,
          pointRadius: 3,
        },
      ],
    };
  }, [impactFunction, theme, t]);

  if (!impactFunction) return null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: "linear",
        title: {
          display: true,
          text: t("impact_function_dialog_intensity_axis", {
            unit: impactFunction.intensity_unit,
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
          <Typography component="span" variant="h6">
            {t("impact_function_dialog_title", {
              id: impactFunction.id,
              name: impactFunction.name,
            })}
          </Typography>
          <Typography component="span" variant="caption" color="text.secondary">
            {t("impact_function_dialog_intensity_unit", {
              unit: impactFunction.intensity_unit,
            })}
          </Typography>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ height: CHART_HEIGHT, mb: 2 }} data-testid="impact-function-chart">
          <Line data={chartData} options={chartOptions} />
        </Box>
        <TableContainer>
          <Table size="small" data-testid="impact-function-table">
            <TableHead>
              <TableRow>
                <TableCell>
                  {t("impact_function_dialog_intensity_axis", {
                    unit: impactFunction.intensity_unit,
                  })}
                </TableCell>
                <TableCell align="right">{t("impact_function_dialog_mdd")}</TableCell>
                <TableCell align="right">{t("impact_function_dialog_paa")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {impactFunction.intensity.map((intensityValue, idx) => (
                <TableRow key={`${intensityValue}-${idx}`}>
                  <TableCell>{intensityValue}</TableCell>
                  <TableCell align="right">{impactFunction.mdd[idx]}</TableCell>
                  <TableCell align="right">{impactFunction.paa[idx]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("close")}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImpactFunctionDialog;
