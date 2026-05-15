import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardContent, Checkbox, Chip, Stack, Tooltip, Typography } from "@mui/material";

import useWorkspaceStore from "../../store/useWorkspaceStore";

// Legacy responses synthesize entries from the name list with no id; the
// name fallback keeps that path keyed per row.
const rowIdOf = (m) => m.id ?? m.name;

const MeasuresCard = () => {
  const { t } = useTranslation();
  const measures = useWorkspaceStore((s) => s.adaptationMeasures);
  const entityMeasureNames = useWorkspaceStore((s) => s.entityMeasureNames);
  const selectedMeasureIds = useWorkspaceStore((s) => s.selectedMeasureIds);
  const toggleMeasureId = useWorkspaceStore((s) => s.toggleMeasureId);

  // Per-card visual state is derived from the store's name-keyed selection,
  // disambiguated by row id so duplicate-name rows do not flip together
  // (issue #447 — defense in depth against #443).
  const selectedNamesByRow = new Map();
  measures.forEach((m) => {
    const id = rowIdOf(m);
    selectedNamesByRow.set(id, selectedMeasureIds.includes(m.name));
  });

  return (
    <Card
      data-testid="measures-card"
      sx={{
        maxWidth: 800,
        margin: "auto",
        bgcolor: "primary.bgStrong",
        border: 2,
        borderColor: "primary.dark",
        borderRadius: (theme) => theme.spacing(2),
      }}
    >
      <CardContent>
        <Typography
          gutterBottom
          variant="h5"
          component="div"
          color="text.primary"
          sx={{
            textAlign: "center",
            fontWeight: "bold",
            backgroundColor: "secondary.main",
            borderRadius: (theme) => theme.spacing(1),
            padding: 1,
            marginBottom: 2,
          }}
        >
          {t("adaptation_measures_card_title", { count: selectedMeasureIds.length })}
        </Typography>

        {measures.length === 0 ? (
          <Typography
            variant="body2"
            sx={{ textAlign: "center", fontStyle: "italic", color: "text.secondary", py: 2 }}
          >
            {t("adaptation_input_no_measures")}
          </Typography>
        ) : (
          <Box>
            {measures.map((measure) => {
              const rowId = rowIdOf(measure);
              const checked = selectedNamesByRow.get(rowId) ?? false;
              const isNotApplicable =
                entityMeasureNames !== null && !entityMeasureNames.includes(measure.name);
              const badgeLabel = measure.is_builtin
                ? t("adaptation_measure_badge_builtin")
                : t("adaptation_measure_badge_custom");
              const tooltipText =
                measure.source_reference ?? t("adaptation_measure_source_reference_missing");
              const onToggle = () => toggleMeasureId(measure.name);
              return (
                <Tooltip key={rowId} title={tooltipText} placement="top-start" arrow>
                  <Card
                    variant="outlined"
                    sx={{
                      bgcolor: "secondary.light",
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
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default MeasuresCard;
