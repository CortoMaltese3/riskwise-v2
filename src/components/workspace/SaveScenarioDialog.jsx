import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";

import RiskWiseClient from "../../lib/RiskWiseClient";

const SaveScenarioDialog = ({ open, scenarioId, defaultName, onClose, onSaved }) => {
  const [name, setName] = useState(defaultName || "");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName(defaultName || "");
      setTags("");
      setNotes("");
      setError("");
    }
  }, [open, defaultName]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!scenarioId) {
      setError("No scenario id available to save.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await RiskWiseClient.saveScenario(scenarioId, {
        name: name.trim(),
        tags: tags.trim() || null,
        notes: notes.trim() || null,
      });
      if (response?.success && response.result?.status?.code === 2000) {
        onSaved?.(response.result.data);
        onClose?.();
      } else {
        setError(response?.error?.message || "Failed to save scenario");
      }
    } catch (err) {
      setError(err?.message || "Failed to save scenario");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Save scenario</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            fullWidth
            inputProps={{ "aria-label": "scenario-name" }}
          />
          <TextField
            label="Tags (comma-separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            fullWidth
            inputProps={{ "aria-label": "scenario-tags" }}
          />
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            inputProps={{ "aria-label": "scenario-notes" }}
          />
          {error ? (
            <div role="alert" style={{ color: "var(--mui-palette-error-main)" }}>
              {error}
            </div>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={submitting}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

SaveScenarioDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  scenarioId: PropTypes.string,
  defaultName: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func,
};

export default SaveScenarioDialog;
