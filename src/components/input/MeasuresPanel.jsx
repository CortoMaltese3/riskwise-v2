import React, { useEffect, useState } from "react";

import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import RiskWiseClient from "../../lib/RiskWiseClient";
import logger from "../../lib/logger.ts";
import useWorkspaceStore from "../../store/useWorkspaceStore";

// Collapsible accordion that lets the user toggle adaptation measures from
// the Risk input column. The selection feeds the next scenario run through
// the global Run button — there is no per-panel Apply gesture.
const MeasuresPanel = () => {
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
  const selectedExposureFile = useWorkspaceStore((s) => s.selectedExposureFile);
  const selectedMeasureIds = useWorkspaceStore((s) => s.selectedMeasureIds);
  const setSelectedMeasureIds = useWorkspaceStore((s) => s.setSelectedMeasureIds);
  const toggleMeasureId = useWorkspaceStore((s) => s.toggleMeasureId);
  const { t } = useTranslation();

  const [measures, setMeasures] = useState([]);
  // ``null`` means "applicability unknown" (no entity file resolved yet,
  // or the backend could not load the entity). The renderer keeps every
  // card visually neutral in that case so the user does not see a wall
  // of "not in scenario" tags on the first render (issue #450).
  const [entityMeasureNames, setEntityMeasureNames] = useState(null);
  // Per-card checkbox state, keyed by row id. Decoupled from the store's
  // name-keyed ``selectedMeasureIds`` so that duplicate-name catalog rows do
  // not visually flip together (issue #447 — defense in depth against #443).
  // The store and wire payload stay name-keyed because the catalog → entity
  // join runs through name; see ``_filter_entity_measures`` in
  // ``backend/run_scenario.py``.
  const [selectedRowIds, setSelectedRowIds] = useState(() => new Set());

  // Legacy responses synthesize entries from the name list with no id; the
  // name fallback keeps that path keyed per row.
  const rowIdOf = (m) => m.id ?? m.name;

  useEffect(() => {
    if (!selectedHazard) {
      setMeasures([]);
      setSelectedRowIds(new Set());
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
        setSelectedRowIds(new Set(fetched.map(rowIdOf)));
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
        logger.error("MeasuresPanel: fetchAdaptationMeasures failed", {
          error: error?.message ?? String(error),
        });
        setMeasures([]);
        setSelectedRowIds(new Set());
        setEntityMeasureNames(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHazard, selectedCountry, selectedExposureFile]);

  if (!selectedHazard) {
    return null;
  }

  const summaryLabel = t("adaptation_measures_panel_title", {
    count: selectedMeasureIds.length,
  });

  return (
    <Accordion
      data-testid="adaptation-measures-panel"
      disableGutters
      square={false}
      defaultExpanded={false}
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={{
        bgcolor: "primary.bgStrong",
        boxShadow: "none",
        "&:before": { display: "none" },
        border: 1,
        borderColor: "divider",
        borderRadius: (theme) => theme.spacing(0.5),
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        aria-controls="adaptation-measures-panel-body"
        id="adaptation-measures-panel-header"
        data-testid="adaptation-measures-panel-summary"
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {summaryLabel}
        </Typography>
      </AccordionSummary>
      <AccordionDetails id="adaptation-measures-panel-body" sx={{ pt: 0 }}>
        {measures.length > 0 ? (
          <>
            {measures.map((measure) => {
              const badgeLabel = measure.is_builtin
                ? t("adaptation_measure_badge_builtin")
                : t("adaptation_measure_badge_custom");
              const tooltipText =
                measure.source_reference ?? t("adaptation_measure_source_reference_missing");
              const rowId = rowIdOf(measure);
              const checked = selectedRowIds.has(rowId);
              const isNotApplicable =
                entityMeasureNames !== null && !entityMeasureNames.includes(measure.name);
              const onToggle = () => {
                setSelectedRowIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(rowId)) next.delete(rowId);
                  else next.add(rowId);
                  return next;
                });
                toggleMeasureId(measure.name);
              };
              return (
                <Tooltip key={rowId} title={tooltipText} placement="top-start" arrow>
                  <Card
                    variant="outlined"
                    sx={{
                      bgcolor: "primary.bgStrong",
                      mb: 1,
                      minHeight: 3,
                    }}
                  >
                    <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        spacing={1}
                      >
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1 }}>
                          <Checkbox
                            size="small"
                            checked={checked}
                            onChange={onToggle}
                            slotProps={{
                              input: {
                                "aria-label": t(measure.name),
                                "data-testid": `measure-checkbox-${rowId}`,
                              },
                            }}
                          />
                          <Typography
                            variant="body2"
                            component="div"
                            sx={{ wordWrap: "break-word" }}
                          >
                            {t(measure.name)}
                          </Typography>
                        </Stack>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          {isNotApplicable && (
                            <Tooltip
                              title={t("adaptation_measure_applicability_not_in_scenario_tooltip")}
                              placement="top"
                              arrow
                            >
                              <Chip
                                size="small"
                                label={t("adaptation_measure_applicability_not_in_scenario")}
                                color="warning"
                                variant="outlined"
                                data-testid={`measure-applicability-not-in-scenario-${rowId}`}
                              />
                            </Tooltip>
                          )}
                          <Chip
                            size="small"
                            label={badgeLabel}
                            color={measure.is_builtin ? "default" : "secondary"}
                            variant="outlined"
                          />
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                </Tooltip>
              );
            })}
          </>
        ) : (
          <Typography
            variant="body2"
            sx={{ textAlign: "center", fontStyle: "italic", color: "text.secondary" }}
          >
            {t("adaptation_input_no_measures")}
          </Typography>
        )}
      </AccordionDetails>
    </Accordion>
  );
};

export default MeasuresPanel;
