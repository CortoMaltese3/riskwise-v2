import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
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
import { enqueueToast } from "../../hooks/useToast";

const SaveScenarioDialog = ({ open, scenarioId, defaultName, onClose, onSaved }) => {
  const { t } = useTranslation();
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
    const trimmedName = name.trim();
    if (!trimmedName) {
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
        name: trimmedName,
        tags: tags.trim() || null,
        notes: notes.trim() || null,
      });
      if (response?.success && response.result?.status?.code === 2000) {
        enqueueToast({
          severity: "success",
          message: t("save_scenario_success_toast", { name: trimmedName }),
        });
        onSaved?.(response.result.data);
        onClose?.();
      } else {
        enqueueToast({
          severity: "error",
          message: response?.error?.message || t("save_scenario_error_toast"),
        });
      }
    } catch (err) {
      enqueueToast({
        severity: "error",
        message: err?.message || t("save_scenario_error_toast"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("save_scenario_dialog_title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label={t("save_scenario_name_label")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            fullWidth
            inputProps={{ "aria-label": "scenario-name" }}
          />
          <TextField
            label={t("save_scenario_tags_label")}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            fullWidth
            inputProps={{ "aria-label": "scenario-tags" }}
          />
          <TextField
            label={t("save_scenario_notes_label")}
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
          {t("cancel")}
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={submitting}>
          {t("save_scenario_action")}
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
