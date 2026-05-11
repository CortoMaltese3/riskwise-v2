import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";

import RiskWiseClient from "../../lib/RiskWiseClient";
import { formatDateTime } from "../../lib/formatDate";

const MAX_SNAPSHOTS = 10;

const SURFACE_GROUPS = [
  { key: "hazard", labelKey: "snapshot_surface_hazard" },
  { key: "exposure", labelKey: "snapshot_surface_exposure" },
  { key: "impact", labelKey: "snapshot_surface_impact" },
  { key: null, labelKey: "export_pdf_dialog_group_other" },
];

const formatCreatedAt = (value, locale) => {
  if (!value) return "";
  try {
    return formatDateTime(value, locale);
  } catch {
    return String(value);
  }
};

const ExportPdfDialog = ({ open, onClose, scenarioId, scenarioName }) => {
  const { i18n, t } = useTranslation();
  const locale = i18n.language;
  const [snapshots, setSnapshots] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [hasWaterfall, setHasWaterfall] = useState(false);
  const [hasCostBenefit, setHasCostBenefit] = useState(false);
  const [includeWaterfall, setIncludeWaterfall] = useState(true);
  const [includeCostBenefit, setIncludeCostBenefit] = useState(true);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const url = await window.api?.http?.getBaseUrl?.();
        if (!cancelled && url) setBaseUrl(url);
      } catch {
        // Best-effort: dialog still renders without thumbnails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !scenarioId) return undefined;
    let cancelled = false;
    setSelectedIds([]);
    setError("");
    setLoading(true);
    setHasWaterfall(false);
    setHasCostBenefit(false);
    setIncludeWaterfall(true);
    setIncludeCostBenefit(true);
    (async () => {
      try {
        const [listResponse, scenarioResponse] = await Promise.all([
          RiskWiseClient.listSnapshots(scenarioId),
          RiskWiseClient.getScenario(scenarioId).catch(() => null),
        ]);
        if (cancelled) return;
        if (listResponse?.success && listResponse.result?.status?.code === 2000) {
          setSnapshots(listResponse.result.data || []);
        } else {
          setSnapshots([]);
          setError(listResponse?.error?.message || "Failed to load snapshots");
        }
        if (scenarioResponse?.success) {
          const results = scenarioResponse.result?.data?.results ?? {};
          const waterfallPresent = Boolean(results.waterfall_data);
          let costbenPresent = false;
          if (results.costben_data) {
            try {
              const parsed = JSON.parse(results.costben_data);
              costbenPresent = Array.isArray(parsed?.measures) && parsed.measures.length > 0;
            } catch {
              costbenPresent = false;
            }
          }
          setHasWaterfall(waterfallPresent);
          setHasCostBenefit(costbenPresent);
          setIncludeWaterfall(waterfallPresent);
          setIncludeCostBenefit(costbenPresent);
        }
      } catch (err) {
        if (!cancelled) {
          setSnapshots([]);
          setError(err?.message || "Failed to load snapshots");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, scenarioId]);

  const isSelected = (id) => selectedIds.includes(id);
  const atCap = selectedIds.length >= MAX_SNAPSHOTS;

  const toggle = (id) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  };

  // Captured waterfall / cost-benefit snapshots would duplicate the
  // auto-rendered charts in the PDF; they remain visible in the snapshot
  // drawer.
  const mapSnapshots = useMemo(
    () => snapshots.filter((s) => s.snapshot_type === "map"),
    [snapshots]
  );

  const groupedSnapshots = useMemo(() => {
    return SURFACE_GROUPS.map((group) => ({
      ...group,
      items: mapSnapshots.filter((s) => (s.surface ?? null) === group.key),
    })).filter((group) => group.items.length > 0);
  }, [mapSnapshots]);

  const handleCancel = () => onClose(null);
  const handleGenerate = () =>
    onClose({
      snapshotIds: selectedIds,
      includeWaterfall,
      includeCostBenefit,
    });

  const renderSnapshotRow = (snap) => {
    const selected = isSelected(snap.id);
    const disabled = !selected && atCap;
    const row = (
      <Box
        key={snap.id}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 1,
          py: 0.5,
          borderRadius: 1,
          backgroundColor: "background.paper",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Checkbox
          checked={selected}
          disabled={disabled}
          onChange={() => toggle(snap.id)}
          slotProps={{ input: { "aria-label": `select-snapshot-${snap.id}` } }}
        />
        {baseUrl ? (
          <Box
            component="img"
            src={`${baseUrl}${RiskWiseClient.snapshotImageUrl(snap.id)}`}
            loading="lazy"
            alt={snap.title || snap.caption || snap.snapshot_type}
            sx={{
              maxWidth: 120,
              maxHeight: 80,
              objectFit: "contain",
              backgroundColor: "background.default",
              borderRadius: 1,
            }}
          />
        ) : null}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap>
            {snap.title || snap.snapshot_type}
          </Typography>
          {snap.caption ? (
            <Typography variant="body2" color="text.secondary" noWrap>
              {snap.caption}
            </Typography>
          ) : null}
          <Typography variant="caption" color="text.secondary">
            {snap.snapshot_type} · {formatCreatedAt(snap.created_at, locale)}
          </Typography>
        </Box>
      </Box>
    );
    return disabled ? (
      <Tooltip key={snap.id} title={t("export_pdf_dialog_cap_tooltip")}>
        <span>{row}</span>
      </Tooltip>
    ) : (
      row
    );
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      fullWidth
      maxWidth="sm"
      aria-label="export-pdf-dialog"
    >
      <DialogTitle>{t("export_pdf_dialog_title")}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }} color="text.secondary">
          {t("export_pdf_dialog_subtitle", { name: scenarioName ?? "" })}
        </Typography>

        {(hasWaterfall || hasCostBenefit) && (
          <Stack
            data-testid="export-pdf-chart-toggles"
            spacing={0}
            sx={{ mb: 2, pb: 1, borderBottom: 1, borderColor: "divider" }}
          >
            {hasWaterfall && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeWaterfall}
                    onChange={(e) => setIncludeWaterfall(e.target.checked)}
                    slotProps={{ input: { "aria-label": "include-waterfall" } }}
                  />
                }
                label={t("export_pdf_dialog_include_waterfall")}
              />
            )}
            {hasCostBenefit && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeCostBenefit}
                    onChange={(e) => setIncludeCostBenefit(e.target.checked)}
                    slotProps={{ input: { "aria-label": "include-cost-benefit" } }}
                  />
                }
                label={t("export_pdf_dialog_include_cost_benefit")}
              />
            )}
          </Stack>
        )}

        {loading ? (
          <Typography variant="body2">{t("workspace_snapshots_loading")}</Typography>
        ) : error ? (
          <Typography role="alert" color="error" variant="body2">
            {error}
          </Typography>
        ) : mapSnapshots.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t("export_pdf_dialog_empty")}
          </Typography>
        ) : (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {t("export_pdf_dialog_select_label")}
            </Typography>
            <Stack spacing={2} data-testid="export-pdf-snapshot-list">
              {groupedSnapshots.map((group) => (
                <Box
                  key={group.key ?? "other"}
                  data-testid={`snapshot-group-${group.key ?? "other"}`}
                >
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    {t("export_pdf_dialog_group_count", {
                      label: t(group.labelKey),
                      count: group.items.length,
                    })}
                  </Typography>
                  <Stack spacing={1}>{group.items.map((snap) => renderSnapshotRow(snap))}</Stack>
                </Box>
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
              {t("export_pdf_dialog_selected_count", {
                count: selectedIds.length,
                max: MAX_SNAPSHOTS,
              })}
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>{t("export_pdf_dialog_cancel")}</Button>
        <Button variant="contained" onClick={handleGenerate} disabled={loading}>
          {t("export_pdf_dialog_generate")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

ExportPdfDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  scenarioId: PropTypes.string,
  scenarioName: PropTypes.string,
};

export default ExportPdfDialog;
