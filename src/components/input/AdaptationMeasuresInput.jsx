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

  // Match the existing key-fallback pattern at the render site: catalog
  // measures have both id and name, but the join with entity measures runs
  // through name, so it must be the value we put into the store.
  const measureValueOf = (m) => m.name;

  const onFetchAdaptationMeasuresHandler = async () => {
    RiskWiseClient.fetchAdaptationMeasures(selectedCountry ?? "", selectedHazard)
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
        initializeMeasureSelection(fetched.map(measureValueOf));
      })
      .catch((error) => {
        logger.error("AdaptationMeasuresInput: fetchAdaptationMeasures failed", {
          error: error?.message ?? String(error),
        });
        setMeasures([]);
      });
  };

  useEffect(() => {
    if (selectedHazard) {
      onFetchAdaptationMeasuresHandler();
    }
  }, [selectedHazard, selectedCountry]);

  const selectionDiffersFromApplied = useMemo(
    () => !arraysEqualAsSets(selectedMeasureIds, appliedMeasureIds),
    [selectedMeasureIds, appliedMeasureIds]
  );

  const applyDisabled = !selectionDiffersFromApplied || isScenarioRunning;

  const onApply = () => {
    runScenario({ landingTab: TABS.ADAPTATION });
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
            const value = measureValueOf(measure);
            const checked = selectedMeasureIds.includes(value);
            return (
              <Tooltip
                key={measure.id ?? measure.name}
                title={tooltipText}
                placement="top-start"
                arrow
              >
                <Card
                  variant="outlined"
                  sx={{
                    bgcolor: (theme) => theme.palette.primary.bgStrong,
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
                          onChange={() => toggleMeasureId(value)}
                          slotProps={{
                            input: {
                              "aria-label": t(measure.name),
                              "data-testid": `measure-checkbox-${value}`,
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
                      <Chip
                        size="small"
                        label={badgeLabel}
                        color={measure.is_builtin ? "default" : "secondary"}
                        variant="outlined"
                      />
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
              bgcolor: (theme) => theme.palette.background.default,
              borderTop: (theme) => `${theme.spacing(0.125)} solid ${theme.palette.divider}`,
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
              onClick={resetMeasureSelectionToApplied}
              disabled={!selectionDiffersFromApplied || isScenarioRunning}
              sx={{
                cursor: selectionDiffersFromApplied ? "pointer" : "default",
                color: (theme) =>
                  selectionDiffersFromApplied
                    ? theme.palette.primary.main
                    : theme.palette.text.disabled,
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
