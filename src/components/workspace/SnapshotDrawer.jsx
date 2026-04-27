import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";

import RiskWiseClient from "../../lib/RiskWiseClient";
import { formatDateTime } from "../../lib/formatDate";

const formatCreatedAt = (value, locale) => {
  if (!value) return "";
  try {
    return formatDateTime(value, locale);
  } catch {
    return String(value);
  }
};

const SnapshotDrawer = ({ scenarioId }) => {
  const { i18n, t } = useTranslation();
  const locale = i18n.language;
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const response = await RiskWiseClient.listSnapshots(scenarioId);
        if (cancelled) return;
        if (response?.success && response.result?.status?.code === 2000) {
          setSnapshots(response.result.data || []);
          setError("");
        } else {
          setError(response?.error?.message || "Failed to load snapshots");
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || "Failed to load snapshots");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scenarioId]);

  const handleDelete = async (id) => {
    const previous = snapshots;
    setSnapshots((current) => current.filter((s) => s.id !== id));
    try {
      const response = await RiskWiseClient.deleteSnapshot(id);
      if (!(response?.success && response.result?.status?.code === 2000)) {
        setSnapshots(previous);
        setError(response?.error?.message || "Delete failed");
      }
    } catch (err) {
      setSnapshots(previous);
      setError(err?.message || "Delete failed");
    }
  };

  if (loading) return <Typography variant="body2">{t("workspace_snapshots_loading")}</Typography>;
  if (error)
    return (
      <Typography role="alert" color="error" variant="body2">
        {error}
      </Typography>
    );
  if (!snapshots.length)
    return <Typography variant="body2">{t("workspace_snapshots_empty")}</Typography>;

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">{t("workspace_snapshots_title")}</Typography>
      {snapshots.map((snap) => (
        <Box
          key={snap.id}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 1,
            py: 0.5,
            borderRadius: 1,
            backgroundColor: "background.paper",
          }}
        >
          <Box>
            <Typography variant="body2">{snap.snapshot_type}</Typography>
            <Typography variant="caption" color="text.secondary">
              {formatCreatedAt(snap.created_at, locale)}
            </Typography>
          </Box>
          <IconButton
            size="small"
            aria-label={`delete-snapshot-${snap.id}`}
            onClick={() => handleDelete(snap.id)}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
    </Stack>
  );
};

SnapshotDrawer.propTypes = {
  scenarioId: PropTypes.string.isRequired,
};

export default SnapshotDrawer;
