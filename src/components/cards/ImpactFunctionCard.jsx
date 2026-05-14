import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  Box,
  Card,
  CardContent,
  CircularProgress,
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

import useWorkspaceStore from "../../store/useWorkspaceStore";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend);

const CHART_HEIGHT = 320;

const ImpactFunctionCard = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const spec = useWorkspaceStore((s) => s.impactFunctionSpec);
  const loading = useWorkspaceStore((s) => s.impactFunctionLoading);
  const error = useWorkspaceStore((s) => s.impactFunctionError);

  const chartData = useMemo(() => {
    if (!spec) return null;
    return {
      labels: spec.intensity.map((v) => v),
      datasets: [
        {
          label: t("impact_function_dialog_mdd"),
          data: spec.mdd,
          borderColor: theme.palette.primary.main,
          backgroundColor: theme.palette.primary.main,
          tension: 0.1,
          pointRadius: 3,
        },
        {
          label: t("impact_function_dialog_paa"),
          data: spec.paa,
          borderColor: theme.palette.secondary.main,
          backgroundColor: theme.palette.secondary.main,
          tension: 0.1,
          pointRadius: 3,
        },
      ],
    };
  }, [spec, theme, t]);

  const chartOptions = useMemo(() => {
    if (!spec) return null;
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "linear",
          title: {
            display: true,
            text: t("impact_function_dialog_intensity_axis", { unit: spec.intensity_unit }),
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
  }, [spec, t]);

  return (
    <Card
      sx={{
        maxWidth: 800,
        margin: "auto",
        bgcolor: "primary.bgStrong",
        border: 2,
        borderColor: "primary.dark",
        borderRadius: (th) => th.spacing(2),
      }}
    >
      <CardContent>
        <Typography
          gutterBottom
          variant="h5"
          component="div"
          color="text.primary"
          sx={{
            textAlign: "center",
            fontWeight: "bold",
            backgroundColor: "secondary.main",
            borderRadius: (th) => th.spacing(1),
            padding: 1,
            marginBottom: 2,
          }}
        >
          {spec
            ? t("impact_function_dialog_title", { id: spec.id, name: spec.name })
            : t("impact_function_card_title")}
        </Typography>

        {loading && (
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="center"
            spacing={1}
            sx={{ py: 4 }}
          >
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              {t("impact_function_card_loading")}
            </Typography>
          </Stack>
        )}

        {!loading && error && (
          <Typography
            variant="body2"
            color="error"
            data-testid="impact-function-viewer-error"
            sx={{ textAlign: "center", py: 4 }}
          >
            {error}
          </Typography>
        )}

        {!loading && !error && !spec && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ textAlign: "center", py: 4 }}
            data-testid="impact-function-viewer-placeholder"
          >
            {t("impact_function_card_placeholder")}
          </Typography>
        )}

        {!loading && !error && spec && (
          <>
            <Typography
              variant="caption"
              color="text.secondary"
              component="div"
              sx={{ mb: 1, textAlign: "center" }}
            >
              {t("impact_function_dialog_intensity_unit", { unit: spec.intensity_unit })}
            </Typography>
            <Box sx={{ height: CHART_HEIGHT, mb: 2 }} data-testid="impact-function-chart">
              <Line data={chartData} options={chartOptions} />
            </Box>
            <TableContainer>
              <Table size="small" data-testid="impact-function-table">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      {t("impact_function_dialog_intensity_axis", { unit: spec.intensity_unit })}
                    </TableCell>
                    <TableCell align="right">{t("impact_function_dialog_mdd")}</TableCell>
                    <TableCell align="right">{t("impact_function_dialog_paa")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {spec.intensity.map((intensityValue, idx) => (
                    <TableRow key={`${intensityValue}-${idx}`}>
                      <TableCell>{intensityValue}</TableCell>
                      <TableCell align="right">{spec.mdd[idx]}</TableCell>
                      <TableCell align="right">{spec.paa[idx]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ImpactFunctionCard;
