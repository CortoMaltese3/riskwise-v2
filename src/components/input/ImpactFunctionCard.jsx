import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, Card, CardContent, CircularProgress, Stack, Typography } from "@mui/material";

import RiskWiseClient from "../../lib/RiskWiseClient";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import ImpactFunctionDialog from "../dialogs/ImpactFunctionDialog";
import { cardTitleSx, getInputCardSx } from "./inputCardStyles";

// The card stays passive until every upstream selection that feeds the
// entity-file lookup is resolved. Custom mode also needs the uploaded
// workbook path; ERA derives the canonical filename from the triple alone.
const inputsComplete = (country, hazard, exposure, isValidExposure, mode, file) => {
  if (!country || !hazard || !exposure || !isValidExposure) return false;
  if (mode === "explore" && !file) return false;
  return true;
};

const ImpactFunctionCard = () => {
  const { t } = useTranslation();
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
  const selectedExposure = useWorkspaceStore((s) => s.selectedExposure);
  const isValidExposure = useWorkspaceStore((s) => s.isValidExposure);
  const selectedAppOption = useWorkspaceStore((s) => s.selectedAppOption);
  const selectedExposureFile = useWorkspaceStore((s) => s.selectedExposureFile);

  const [spec, setSpec] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const active = inputsComplete(
    selectedCountry,
    selectedHazard,
    selectedExposure,
    isValidExposure,
    selectedAppOption,
    selectedExposureFile
  );

  useEffect(() => {
    if (!active) {
      setSpec(null);
      setError("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const entityFile = selectedAppOption === "explore" ? selectedExposureFile : null;
    RiskWiseClient.fetchImpactFunction(
      selectedCountry,
      selectedHazard,
      selectedExposure,
      entityFile
    ).then((response) => {
      if (cancelled) return;
      setLoading(false);
      if (response.success) {
        setSpec(response.result.data);
        setError("");
      } else {
        setSpec(null);
        setError(response.error?.message || t("impact_function_card_error"));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    active,
    selectedCountry,
    selectedHazard,
    selectedExposure,
    selectedAppOption,
    selectedExposureFile,
    t,
  ]);

  const cardState = active && spec ? "valid" : "default";

  return (
    <>
      <Card variant="outlined" sx={getInputCardSx(cardState)} aria-disabled={!active}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
            <Typography variant="h6" component="div" sx={cardTitleSx}>
              {t("impact_function_card_title")}
            </Typography>
          </Stack>
          {!active && (
            <Typography variant="body2" color="text.secondary">
              {t("impact_function_card_placeholder")}
            </Typography>
          )}
          {active && loading && (
            <Stack direction="row" alignItems="center" spacing={1}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                {t("impact_function_card_loading")}
              </Typography>
            </Stack>
          )}
          {active && !loading && error && (
            <Typography variant="body2" color="error" data-testid="impact-function-card-error">
              {error}
            </Typography>
          )}
          {active && !loading && spec && (
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
              <Stack>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {t("impact_function_card_summary", {
                    id: spec.id,
                    name: spec.name,
                  })}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("impact_function_card_unit", { unit: spec.intensity_unit })}
                </Typography>
              </Stack>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setDialogOpen(true)}
                data-testid="impact-function-view-details"
              >
                {t("impact_function_card_view_details")}
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>
      <ImpactFunctionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        impactFunction={spec}
      />
    </>
  );
};

export default ImpactFunctionCard;
