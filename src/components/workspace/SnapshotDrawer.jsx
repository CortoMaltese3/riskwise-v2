import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { Box, IconButton, Stack, TextField, Typography } from "@mui/material";
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
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await window.api?.http?.getBaseUrl?.();
        if (!cancelled && url) setBaseUrl(url);
      } catch {
        // Backend URL is best-effort: drawer still renders without
        // thumbnails, falling back to alt text and metadata.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Generic single-field PATCH for the snapshot drawer. The title and caption
  // fields commit independently (per #350) so each blur sends only the field
  // it owns — the backend reads ``model_fields_set`` and leaves untouched
  // columns alone, so this cannot accidentally null out the other value.
  const handleFieldCommit = async (snap, field, nextValue) => {
    const trimmed = nextValue.trim();
    const value = trimmed.length === 0 ? null : trimmed;
    if ((snap[field] ?? null) === value) return;
    const previous = snapshots;
    setSnapshots((current) =>
      current.map((s) => (s.id === snap.id ? { ...s, [field]: value } : s))
    );
    try {
      const response = await RiskWiseClient.updateSnapshot(snap.id, { [field]: value });
      if (!(response?.success && response.result?.status?.code === 2000)) {
        setSnapshots(previous);
        setError(response?.error?.message || `${field} update failed`);
      }
    } catch (err) {
      setSnapshots(previous);
      setError(err?.message || `${field} update failed`);
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
    <Stack spacing={1} data-testid="snapshot-drawer">
      <Typography variant="subtitle2">{t("workspace_snapshots_title")}</Typography>
      {snapshots.map((snap) => (
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
          }}
        >
          {baseUrl ? (
            <Box
              component="img"
              src={`${baseUrl}${RiskWiseClient.snapshotImageUrl(snap.id)}`}
              loading="lazy"
              alt={snap.caption || snap.snapshot_type}
              sx={{
                maxWidth: 240,
                maxHeight: 160,
                objectFit: "contain",
                backgroundColor: "background.default",
                borderRadius: 1,
              }}
            />
          ) : null}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <SnapshotTextField
              value={snap.title}
              onCommit={(value) => handleFieldCommit(snap, "title", value)}
              placeholder={t("snapshot_title_helper")}
              ariaLabel={`title-${snap.id}`}
              maxLength={120}
              labelText={t("snapshot_title_label")}
            />
            <SnapshotTextField
              value={snap.caption}
              onCommit={(value) => handleFieldCommit(snap, "caption", value)}
              placeholder={t("workspace_snapshot_caption_placeholder")}
              ariaLabel={`caption-${snap.id}`}
              maxLength={500}
            />
            <Typography variant="caption" color="text.secondary">
              {snap.snapshot_type} · {formatCreatedAt(snap.created_at, locale)}
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

// Shared inline-edit input for title and caption. A single component keeps
// the commit-on-blur, Enter-to-blur, and controlled-input behaviour identical
// across both fields; the parent only varies the aria-label and length cap.
const SnapshotTextField = ({ value, onCommit, placeholder, ariaLabel, maxLength, labelText }) => {
  const [internal, setInternal] = useState(value || "");

  useEffect(() => {
    setInternal(value || "");
  }, [value]);

  return (
    <TextField
      variant="standard"
      size="small"
      fullWidth
      label={labelText}
      value={internal}
      placeholder={placeholder}
      onChange={(e) => setInternal(e.target.value)}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.target.blur();
        }
      }}
      slotProps={{
        htmlInput: {
          "aria-label": ariaLabel,
          maxLength,
        },
      }}
    />
  );
};

SnapshotTextField.propTypes = {
  value: PropTypes.string,
  onCommit: PropTypes.func.isRequired,
  placeholder: PropTypes.string.isRequired,
  ariaLabel: PropTypes.string.isRequired,
  maxLength: PropTypes.number.isRequired,
  labelText: PropTypes.string,
};

SnapshotDrawer.propTypes = {
  scenarioId: PropTypes.string.isRequired,
};

export default SnapshotDrawer;
