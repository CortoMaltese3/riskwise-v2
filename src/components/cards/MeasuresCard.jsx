import React from "react";
import { useTranslation } from "react-i18next";

import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";

import useWorkspaceStore from "../../store/useWorkspaceStore";
import { layoutTransition } from "../../theme/theme";

const rowIdOf = (m) => m.id ?? m.name;

// The display label is the catalog ``displayName`` (i18n key like
// ``adaptation_measures_trees_planting``) when the entity row joined to a
// catalog row; otherwise the raw engine name (e.g. ``TP``) — which still
// passes through ``t()`` so a custom-mode translation key would resolve.
const labelKey = (m) => m.displayName || m.name;

const MeasuresCard = () => {
  const { t } = useTranslation();
  const measures = useWorkspaceStore((s) => s.adaptationMeasures);
  const selectedMeasureIds = useWorkspaceStore((s) => s.selectedMeasureIds);
  const toggleMeasureId = useWorkspaceStore((s) => s.toggleMeasureId);
  const setSelectedMeasureIds = useWorkspaceStore((s) => s.setSelectedMeasureIds);

  // Per-card visual state is derived from the store's name-keyed selection,
  // disambiguated by row id so duplicate-name rows do not flip together
  // (issue #447 — defense in depth against #443).
  const selectedNamesByRow = new Map();
  measures.forEach((m) => {
    const id = rowIdOf(m);
    selectedNamesByRow.set(id, selectedMeasureIds.includes(m.name));
  });

  const uniqueNames = Array.from(new Set(measures.map((m) => m.name)));
  const allSelected =
    uniqueNames.length > 0 && uniqueNames.every((n) => selectedMeasureIds.includes(n));
  const toggleAllLabel = allSelected
    ? t("adaptation_measures_unselect_all")
    : t("adaptation_measures_select_all");
  const handleToggleAll = () => setSelectedMeasureIds(allSelected ? [] : uniqueNames);

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
        <Stack
          direction="row"
          alignItems="center"
          sx={{
            backgroundColor: "secondary.main",
            borderRadius: (theme) => theme.spacing(1),
            padding: 1,
            marginBottom: 2,
          }}
        >
          <Typography
            variant="h5"
            component="div"
            color="text.primary"
            sx={{ flex: 1, textAlign: "center", fontWeight: "bold" }}
          >
            {t("adaptation_measures_card_title", { count: selectedMeasureIds.length })}
          </Typography>
          {measures.length > 0 && (
            <Button
              size="small"
              onClick={handleToggleAll}
              data-testid="adaptation-measures-toggle-all"
              sx={{
                color: "text.primary",
                textTransform: "none",
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {toggleAllLabel}
            </Button>
          )}
        </Stack>

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
              const badgeLabel = measure.is_builtin
                ? t("adaptation_measure_badge_builtin")
                : t("adaptation_measure_badge_custom");
              // Suppress the row tooltip when no citation exists — it
              // only added noise on built-in rows that never carry a
              // source_reference.
              const tooltipText = measure.source_reference ?? "";
              const onToggle = () => toggleMeasureId(measure.name);
              const row = (
                <CardActionArea
                  onClick={onToggle}
                  data-testid={`measure-row-${rowId}`}
                  aria-pressed={checked}
                  aria-label={t(labelKey(measure))}
                  sx={{
                    backgroundColor: checked ? "secondary.main" : "secondary.light",
                    borderRadius: (theme) => theme.spacing(1),
                    mb: 1,
                    p: 1,
                    transition: layoutTransition(["transform", "background-color"]),
                    "&:active": { transform: "scale(0.99)" },
                  }}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    spacing={1}
                  >
                    <Typography
                      variant="body1"
                      color="text.primary"
                      sx={{ flex: 1, wordWrap: "break-word" }}
                    >
                      {t(labelKey(measure))}
                    </Typography>
                    <Chip
                      size="small"
                      label={badgeLabel}
                      color={measure.is_builtin ? "default" : "secondary"}
                      variant="outlined"
                    />
                  </Stack>
                </CardActionArea>
              );
              return tooltipText ? (
                <Tooltip key={rowId} title={tooltipText} placement="top-start" arrow>
                  {row}
                </Tooltip>
              ) : (
                <Box key={rowId}>{row}</Box>
              );
            })}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default MeasuresCard;
