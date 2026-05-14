import React, { useEffect, useMemo, useState } from "react";

import { useTranslation } from "react-i18next";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Link,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";

import AdaptationMeasuresViewTitle from "../title/AdaptationMeasuresViewTitle";
import RiskWiseClient from "../../lib/RiskWiseClient";
import logger from "../../lib/logger.ts";
import useResultsStore from "../../store/useResultsStore";
import useRunScenario from "../../hooks/useRunScenario";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { TABS } from "../main/tabs";

const arraysEqualAsSets = (a, b) => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  for (const x of b) if (!set.has(x)) return false;
  return true;
};

const AdaptationMeasuresInput = () => {
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
  const selectedExposureFile = useWorkspaceStore((s) => s.selectedExposureFile);
  const selectedTab = useUIStore((s) => s.selectedTab);
  const selectedMeasureIds = useWorkspaceStore((s) => s.selectedMeasureIds);
  const appliedMeasureIds = useWorkspaceStore((s) => s.appliedMeasureIds);
  const initializeMeasureSelection = useWorkspaceStore((s) => s.initializeMeasureSelection);
  const toggleMeasureId = useWorkspaceStore((s) => s.toggleMeasureId);
  const resetMeasureSelectionToApplied = useWorkspaceStore((s) => s.resetMeasureSelectionToApplied);
  const isScenarioRunning = useResultsStore((s) => s.isScenarioRunning);
  const { t } = useTranslation();
  const { runScenario } = useRunScenario();

  const [measures, setMeasures] = useState([]);
  // ``null`` means "applicability unknown" (no entity file resolved yet,
  // or the backend could not load the entity). The renderer keeps every
  // card visually neutral in that case so the user does not see a wall
  // of "not in scenario" tags on the first render (issue #450).
  const [entityMeasureNames, setEntityMeasureNames] = useState(null);
  // Per-card checkbox state, keyed by row id. Decoupled from the store's
  // name-keyed `selectedMeasureIds` so that duplicate-name catalog rows do
  // not visually flip together (issue #447 — defense in depth against #443).
  // The store and wire payload stay name-keyed because the catalog → entity
  // join runs through name; see `_filter_entity_measures` in
  // `backend/run_scenario.py`.
  const [selectedRowIds, setSelectedRowIds] = useState(() => new Set());

  // Legacy responses synthesize entries from the name list with no id; the
  // name fallback keeps that path keyed per row.
  const rowIdOf = (m) => m.id ?? m.name;

  const onFetchAdaptationMeasuresHandler = async () => {
    RiskWiseClient.fetchAdaptationMeasures(
      selectedCountry ?? "",
      selectedHazard,
      selectedExposureFile || undefined
    )
      .then((response) => {
        const data = response?.result?.data;
        let fetched = [];
        if (Array.isArray(data?.measures) && data.measures.length > 0) {
          fetched = data.measures;
        } else {
          // Older responses only carry the name list; synthesize minimal objects
          // so the chip / tooltip code path still has something to render.
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
        // ``null`` keeps the cards visually neutral when applicability
        // is unknown (no exposure file resolved, or entity load failed
        // on the backend); a list — even an empty one — flips the
        // renderer into the explicit "tag what isn't in scenario" mode.
        const entityNames = Array.isArray(data?.entityMeasureNames)
          ? data.entityMeasureNames
          : null;
        setEntityMeasureNames(entityNames);
        // Dedupe names so the wire payload doesn't carry duplicate entries.
        const uniqueNames = Array.from(new Set(fetched.map((m) => m.name)));
        initializeMeasureSelection(uniqueNames);
      })
      .catch((error) => {
        logger.error("AdaptationMeasuresInput: fetchAdaptationMeasures failed", {
          error: error?.message ?? String(error),
        });
        setMeasures([]);
        setSelectedRowIds(new Set());
        setEntityMeasureNames(null);
      });
  };

  useEffect(() => {
    if (selectedHazard) {
      onFetchAdaptationMeasuresHandler();
    }
  }, [selectedHazard, selectedCountry, selectedExposureFile]);

  const selectionDiffersFromApplied = useMemo(
    () => !arraysEqualAsSets(selectedMeasureIds, appliedMeasureIds),
    [selectedMeasureIds, appliedMeasureIds]
  );

  const applyDisabled = !selectionDiffersFromApplied || isScenarioRunning;

  const onApply = () => {
    runScenario({ landingTab: TABS.ADAPTATION });
  };

  const onResetSelection = () => {
    resetMeasureSelectionToApplied();
    const appliedSet = new Set(appliedMeasureIds);
    setSelectedRowIds(new Set(measures.filter((m) => appliedSet.has(m.name)).map(rowIdOf)));
  };

  if (selectedTab !== TABS.ADAPTATION) {
    return null;
  }

  return (
    <>
      <AdaptationMeasuresViewTitle />
      {measures.length > 0 ? (
        <Box
          sx={{
            mt: 2,
            padding: 2,
            borderRadius: (theme) => theme.spacing(1),
          }}
        >
          {measures.map((measure) => {
            const badgeLabel = measure.is_builtin
              ? t("adaptation_measure_badge_builtin")
              : t("adaptation_measure_badge_custom");
            const tooltipText =
              measure.source_reference ?? t("adaptation_measure_source_reference_missing");
            const rowId = rowIdOf(measure);
            const checked = selectedRowIds.has(rowId);
            // Applicability tag (issue #450). ``null`` (applicability
            // unknown) renders nothing; an explicit list flips on the
            // "not in scenario" chip for any catalog name absent from
            // it. Cards that ARE in scenario stay visually neutral so
            // the warning chip is the only signal.
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
                    mb: 2,
                    minHeight: 3,
                  }}
                >
                  <CardContent sx={{ p: 1 }}>
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
                          gutterBottom
                          variant="h6"
                          component="div"
                          sx={{ my: 0, wordWrap: "break-word" }}
                        >
                          {t(measure.name)}
                        </Typography>
                      </Stack>
                      <Stack direction="row" alignItems="center" spacing={1}>
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
          <Box
            data-testid="adaptation-measure-apply-bar"
            sx={{
              position: "sticky",
              bottom: 0,
              pt: 1,
              pb: 1,
              mt: 1,
              bgcolor: "background.default",
              borderTop: 1,
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
            }}
          >
            <Link
              component="button"
              type="button"
              variant="body2"
              onClick={onResetSelection}
              disabled={!selectionDiffersFromApplied || isScenarioRunning}
              sx={{
                cursor: selectionDiffersFromApplied ? "pointer" : "default",
                color: selectionDiffersFromApplied ? "primary.main" : "text.disabled",
              }}
              data-testid="adaptation-measure-reset-link"
            >
              {t("adaptation_measure_reset")}
            </Link>
            <Tooltip
              title={isScenarioRunning ? t("adaptation_measure_apply_running_tooltip") : ""}
              placement="top"
              arrow
            >
              <span>
                <Button
                  variant="contained"
                  color="secondary"
                  size="small"
                  disabled={applyDisabled}
                  onClick={onApply}
                  data-testid="adaptation-measure-apply-button"
                >
                  {t("adaptation_measure_apply", { count: selectedMeasureIds.length })}
                </Button>
              </span>
            </Tooltip>
          </Box>
        </Box>
      ) : (
        <Typography sx={{ mt: 2, textAlign: "center", fontStyle: "italic" }}>
          {
            selectedHazard
              ? t("adaptation_input_no_measures") /* No measures are found for selected hazard */
              : t("adaptation_input_no_hazard") /* No hazard is selected */
          }
        </Typography>
      )}
    </>
  );
};

export default AdaptationMeasuresInput;
