import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { Alert, Box, IconButton, Paper, Skeleton, Stack, Typography } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";

import HomeCard from "./HomeCard";

const PINNED_LIMIT = 4;
const SKELETON_TILES = 3;

const TILE_SX = {
  p: 1.5,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  bgcolor: "background.default",
};

const PinnedTile = ({ row, onUnpin, label }) => (
  <Paper variant="outlined" sx={TILE_SX} data-testid={`home-pinned-${row.id}`}>
    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
      <Typography variant="body1" sx={{ fontWeight: 500 }} noWrap>
        {row.name || row.id}
      </Typography>
      <IconButton
        size="small"
        onClick={() => onUnpin(row.id)}
        aria-label={label}
        data-testid={`home-pinned-unpin-${row.id}`}
      >
        <StarIcon fontSize="small" color="primary" />
      </IconButton>
    </Stack>
    {(row.country || row.hazard_type) && (
      <Typography variant="body2" color="text.secondary" noWrap>
        {[row.hazard_type, row.country].filter(Boolean).join(" / ")}
      </Typography>
    )}
  </Paper>
);

PinnedTile.propTypes = {
  row: PropTypes.object.isRequired,
  onUnpin: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
};

const PinnedCard = ({ scenarios, pinnedIds, loading, error, onUnpin }) => {
  const { t } = useTranslation();
  const pinned = useMemo(() => {
    const byId = new Map(scenarios.map((row) => [row.id, row]));
    return pinnedIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .slice(0, PINNED_LIMIT);
  }, [scenarios, pinnedIds]);

  return (
    <HomeCard data-testid="home-pinned-card" title={t("home_pinned_title")}>
      {loading ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
            gap: 1.5,
          }}
          data-testid="home-pinned-loading"
        >
          {Array.from({ length: SKELETON_TILES }).map((_, idx) => (
            <Skeleton key={idx} variant="rectangular" height={80} />
          ))}
        </Box>
      ) : error ? (
        <Alert severity="error" data-testid="home-pinned-error">
          {t("home_pinned_error")}
        </Alert>
      ) : pinned.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-testid="home-pinned-empty">
          {t("home_pinned_empty")}
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
            gap: 1.5,
          }}
        >
          {pinned.map((row) => (
            <PinnedTile
              key={row.id}
              row={row}
              onUnpin={onUnpin}
              label={t("workspace_unpin_aria", { id: row.id })}
            />
          ))}
        </Box>
      )}
    </HomeCard>
  );
};

PinnedCard.propTypes = {
  scenarios: PropTypes.array.isRequired,
  pinnedIds: PropTypes.array.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string,
  onUnpin: PropTypes.func.isRequired,
};

export default PinnedCard;
