import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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

import ImpactFunctionDialog from "../dialogs/ImpactFunctionDialog";
import useWorkspaceStore from "../../store/useWorkspaceStore";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend);

const CHART_HEIGHT = 320;

const ImpactFunctionCard = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const spec = useWorkspaceStore((s) => s.impactFunctionSpec);
  const loading = useWorkspaceStore((s) => s.impactFunctionLoading);
  const error = useWorkspaceStore((s) => s.impactFunctionError);
  const override = useWorkspaceStore((s) => s.impactFunctionOverride);
  const setOverride = useWorkspaceStore((s) => s.setImpactFunctionOverride);
  const selectedAppOption = useWorkspaceStore((s) => s.selectedAppOption);

  const [editorOpen, setEditorOpen] = useState(false);
  const editable = selectedAppOption !== "era";
  // When an override is pending, the card visualises that — not the
  // canonical curve — so the user can compare the chart they will run
  // against the saved edits at a glance (#453).
  const displaySpec = override ?? spec;
  const isModified = override != null;

  const chartData = useMemo(() => {
    if (!displaySpec) return null;
    return {
      labels: displaySpec.intensity.map((v) => v),
      datasets: [
        {
          label: t("impact_function_dialog_mdd"),
          data: displaySpec.mdd,
          borderColor: theme.palette.primary.main,
          backgroundColor: theme.palette.primary.main,
          tension: 0.1,
          pointRadius: 3,
        },
        {
          label: t("impact_function_dialog_paa"),
          data: displaySpec.paa,
          borderColor: theme.palette.secondary.main,
          backgroundColor: theme.palette.secondary.main,
          tension: 0.1,
          pointRadius: 3,
        },
      ],
    };
  }, [displaySpec, theme, t]);

  const chartOptions = useMemo(() => {
    if (!displaySpec) return null;
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "linear",
          title: {
            display: true,
            text: t("impact_function_dialog_intensity_axis", {
              unit: displaySpec.intensity_unit,
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
  }, [displaySpec, t]);

  const handleSaveOverride = (saved) => {
    setOverride(saved);
    setEditorOpen(false);
  };

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
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="center"
          spacing={1}
          sx={{ mb: 2 }}
        >
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
              marginBottom: 0,
              flexGrow: 1,
            }}
          >
            {displaySpec
              ? t("impact_function_dialog_title", { id: displaySpec.id, name: displaySpec.name })
              : t("impact_function_card_title")}
          </Typography>
          {isModified && (
            <Chip
              color="warning"
              size="small"
              label={t("impact_function_modified_badge")}
              data-testid="impact-function-card-modified-badge"
            />
          )}
        </Stack>

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

        {!loading && !error && !displaySpec && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ textAlign: "center", py: 4 }}
            data-testid="impact-function-viewer-placeholder"
          >
            {t("impact_function_card_placeholder")}
          </Typography>
        )}

        {!loading && !error && displaySpec && (
          <>
            <Typography
              variant="caption"
              color="text.secondary"
              component="div"
              sx={{ mb: 1, textAlign: "center" }}
            >
              {t("impact_function_dialog_intensity_unit", { unit: displaySpec.intensity_unit })}
            </Typography>
            <Box sx={{ height: CHART_HEIGHT, mb: 2 }} data-testid="impact-function-chart">
              <Line data={chartData} options={chartOptions} />
            </Box>
            <TableContainer>
              <Table size="small" data-testid="impact-function-table">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      {t("impact_function_dialog_intensity_axis", {
                        unit: displaySpec.intensity_unit,
                      })}
                    </TableCell>
                    <TableCell align="right">{t("impact_function_dialog_mdd")}</TableCell>
                    <TableCell align="right">{t("impact_function_dialog_paa")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displaySpec.intensity.map((intensityValue, idx) => (
                    <TableRow key={`${intensityValue}-${idx}`}>
                      <TableCell>{intensityValue}</TableCell>
                      <TableCell align="right">{displaySpec.mdd[idx]}</TableCell>
                      <TableCell align="right">{displaySpec.paa[idx]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {editable && (
              <Stack direction="row" justifyContent="center" sx={{ mt: 2 }}>
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  onClick={() => setEditorOpen(true)}
                  data-testid="impact-function-card-edit"
                >
                  {t("impact_function_editor_edit")}
                </Button>
              </Stack>
            )}
          </>
        )}
      </CardContent>
      <ImpactFunctionDialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        impactFunction={spec}
        pendingOverride={override}
        mode={editable ? "custom" : "era"}
        onSaveOverride={handleSaveOverride}
      />
    </Card>
  );
};

export default ImpactFunctionCard;
