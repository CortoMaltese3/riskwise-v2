import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, Stack, TextField, Typography } from "@mui/material";

import RiskWiseClient from "../../lib/RiskWiseClient";
import logger from "../../lib/logger.ts";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { cardTitleSx, disabledFieldSx, getInputCardSx } from "./inputCardStyles";

// Left-column summary for the adaptation-measure picker. Click opens the
// middle-pane ``MeasuresCard`` viewer with the full checklist. The fetched
// catalog is hoisted to the workspace store so the viewer can render the
// same rows without re-fetching (see ``MeasuresCard``).
const Measures = () => {
  const { t } = useTranslation();
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
  const selectedExposureFile = useWorkspaceStore((s) => s.selectedExposureFile);
  const selectedMeasureIds = useWorkspaceStore((s) => s.selectedMeasureIds);
  const measures = useWorkspaceStore((s) => s.adaptationMeasures);
  const setMeasures = useWorkspaceStore((s) => s.setAdaptationMeasures);
  const setEntityMeasureNames = useWorkspaceStore((s) => s.setEntityMeasureNames);
  const setSelectedMeasureIds = useWorkspaceStore((s) => s.setSelectedMeasureIds);
  const openInputEditor = useUIStore((s) => s.openInputEditor);
  const setSelectedCard = useUIStore((s) => s.setSelectedCard);

  const [clicked, setClicked] = useState(false);

  useEffect(() => {
    if (!selectedHazard) {
      setMeasures([]);
      setEntityMeasureNames(null);
      return undefined;
    }
    // Guard against an older response overwriting a newer one when the
    // user flips country/hazard/exposureFile mid-flight.
    let cancelled = false;
    RiskWiseClient.fetchAdaptationMeasures(
      selectedCountry ?? "",
      selectedHazard,
      selectedExposureFile || undefined
    )
      .then((response) => {
        if (cancelled) return;
        const data = response?.result?.data;
        let fetched = [];
        if (Array.isArray(data?.measures) && data.measures.length > 0) {
          fetched = data.measures;
        } else {
          // Older responses only carry the name list; synthesize minimal
          // objects so the chip / tooltip code path still has something
          // to render.
          const names = data?.adaptationMeasures ?? [];
          fetched = names.map((name) => ({
            id: name,
            name,
            is_builtin: true,
            source_reference: null,
          }));
        }
        setMeasures(fetched);
        const entityNames = Array.isArray(data?.entityMeasureNames)
          ? data.entityMeasureNames
          : null;
        setEntityMeasureNames(entityNames);
        // Dedupe names so the wire payload doesn't carry duplicate entries.
        const uniqueNames = Array.from(new Set(fetched.map((m) => m.name)));
        setSelectedMeasureIds(uniqueNames);
      })
      .catch((error) => {
        if (cancelled) return;
        logger.error("Measures: fetchAdaptationMeasures failed", {
          error: error?.message ?? String(error),
        });
        setMeasures([]);
        setEntityMeasureNames(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHazard, selectedCountry, selectedExposureFile]);

  const active = Boolean(selectedHazard) && measures.length > 0;
  const cardState = active && selectedMeasureIds.length > 0 ? "valid" : "default";

  const handleMouseDown = () => {
    if (!active) return;
    setClicked(true);
  };
  const handleMouseUp = () => setClicked(false);
  const handleClick = () => {
    if (!active) return;
    setSelectedCard("measures");
    openInputEditor();
  };

  const summaryValue = active
    ? t("adaptation_measures_summary_value", {
        selected: selectedMeasureIds.length,
        total: measures.length,
      })
    : "";

  return (
    <Card
      data-testid="adaptation-measures-summary"
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
            id="adaptation-measures-label"
            variant="h6"
            component="div"
            m={0}
            sx={cardTitleSx}
          >
            {t("adaptation_measures_card_label")}
          </Typography>
        </Stack>
        <TextField
          id="adaptation-measures-textfield"
          fullWidth
          variant="outlined"
          value={summaryValue}
          placeholder={t("input_card_placeholder")}
          disabled
          InputProps={{ readOnly: true }}
          sx={disabledFieldSx}
        />
      </CardContent>
    </Card>
  );
};

export default Measures;
