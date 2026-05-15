import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, Stack, TextField, Typography } from "@mui/material";

import RiskWiseClient from "../../lib/RiskWiseClient";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { cardTitleSx, disabledFieldSx, getInputCardSx } from "./inputCardStyles";

// The card stays passive until every upstream selection that feeds the
// entity-file lookup is resolved. Custom mode also needs the uploaded
// workbook path; ERA derives the canonical filename from the triple alone.
const inputsComplete = (country, hazard, exposure, isValidExposure, mode, file) => {
  if (!country || !hazard || !exposure || !isValidExposure) return false;
  if (mode === "explore" && !file) return false;
  return true;
};

const ImpactFunction = () => {
  const { t } = useTranslation();
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
  const selectedExposure = useWorkspaceStore((s) => s.selectedExposure);
  const isValidExposure = useWorkspaceStore((s) => s.isValidExposure);
  const selectedAppOption = useWorkspaceStore((s) => s.selectedAppOption);
  const selectedExposureFile = useWorkspaceStore((s) => s.selectedExposureFile);
  const spec = useWorkspaceStore((s) => s.impactFunctionSpec);
  const error = useWorkspaceStore((s) => s.impactFunctionError);
  const loading = useWorkspaceStore((s) => s.impactFunctionLoading);
  const setSpec = useWorkspaceStore((s) => s.setImpactFunctionSpec);
  const setError = useWorkspaceStore((s) => s.setImpactFunctionError);
  const setLoading = useWorkspaceStore((s) => s.setImpactFunctionLoading);
  const openInputEditor = useUIStore((s) => s.openInputEditor);
  const setSelectedCard = useUIStore((s) => s.setSelectedCard);

  const [clicked, setClicked] = useState(false);
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
      return undefined;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    selectedCountry,
    selectedHazard,
    selectedExposure,
    selectedAppOption,
    selectedExposureFile,
  ]);

  const cardState = active && spec ? "valid" : error ? "invalid" : "default";

  const handleMouseDown = () => setClicked(true);
  const handleMouseUp = () => setClicked(false);
  const handleClick = () => {
    setSelectedCard("impactFunction");
    openInputEditor();
  };

  let displayValue = "";
  if (active) {
    if (loading) displayValue = t("impact_function_card_loading");
    else if (spec)
      displayValue = t("impact_function_card_summary", { id: spec.id, name: spec.name });
  }

  return (
    <Card
      data-testid="impact-function-summary-card"
      variant="outlined"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      sx={getInputCardSx(cardState, { clicked })}
      aria-disabled={!active}
    >
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
          <Typography
            id="impact-function-label"
            variant="h6"
            component="div"
            m={0}
            sx={cardTitleSx}
          >
            {t("impact_function_card_title")}
          </Typography>
        </Stack>
        <TextField
          id="impact-function-textfield"
          fullWidth
          variant="outlined"
          value={displayValue}
          placeholder={t("input_card_placeholder")}
          disabled
          InputProps={{ readOnly: true }}
          sx={disabledFieldSx}
        />
      </CardContent>
    </Card>
  );
};

export default ImpactFunction;
