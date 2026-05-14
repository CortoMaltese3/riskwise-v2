import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import EastIcon from "@mui/icons-material/East";
import WestIcon from "@mui/icons-material/West";

import useUIStore from "../../store/useUIStore";
import { formatRelativeTime } from "../../lib/relativeTime";
import { isRtl } from "../../i18nConfig";
import HomeCard from "./HomeCard";

const RECENT_LIMIT = 5;
const SKELETON_ROWS = 3;

const sortByCreated = (a, b) => {
  const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
  const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
  return tb - ta;
};

const RecentRow = ({ row, locale, onActivate }) => {
  const subtitleParts = [row.hazard_type, row.country, row.status].filter(Boolean);
  const relative = formatRelativeTime(row.created_at, locale);
  const subtitle = [subtitleParts.join(" / "), relative].filter(Boolean).join(" · ");
  return (
    <ListItem disablePadding dense>
      <ListItemButton
        sx={{ borderRadius: 1 }}
        onClick={onActivate ? () => onActivate(row) : undefined}
        data-testid={`home-recent-row-${row.id}`}
      >
        <ListItemText
          primary={row.name || row.id}
          secondary={subtitle}
          slotProps={{
            primary: { variant: "body1", noWrap: true },
            secondary: { variant: "body2", color: "text.secondary", noWrap: true },
          }}
        />
      </ListItemButton>
    </ListItem>
  );
};

RecentRow.propTypes = {
  row: PropTypes.object.isRequired,
  locale: PropTypes.string,
  onActivate: PropTypes.func,
};

const RecentProjectsCard = ({ scenarios, loading, error, onActivate }) => {
  const { t, i18n } = useTranslation();
  const setActiveSection = useUIStore((s) => s.setActiveSection);
  const rtl = isRtl(i18n.language);
  const ArrowIcon = rtl ? WestIcon : EastIcon;

  const recent = useMemo(
    () => [...scenarios].sort(sortByCreated).slice(0, RECENT_LIMIT),
    [scenarios]
  );

  const lastCompleted = useMemo(
    () =>
      scenarios.reduce((best, s) => {
        if (s.status !== "completed") return best;
        return !best || sortByCreated(s, best) < 0 ? s : best;
      }, null),
    [scenarios]
  );

  return (
    <HomeCard
      data-testid="home-recent-card"
      title={t("home_recent_title")}
      action={
        <Button
          size="small"
          endIcon={<ArrowIcon fontSize="small" />}
          onClick={() => setActiveSection("workspace")}
        >
          {t("home_recent_view_all")}
        </Button>
      }
    >
      {!loading && !error && lastCompleted && (
        <Typography
          variant="body2"
          color="text.secondary"
          data-testid="home-recent-last-completed"
          sx={{ mb: 1 }}
        >
          {t("home_recent_last_completed", {
            name: lastCompleted.name || lastCompleted.id,
            relative: formatRelativeTime(lastCompleted.created_at, i18n.language),
          })}
        </Typography>
      )}
      {loading ? (
        <Stack spacing={1} data-testid="home-recent-loading">
          {Array.from({ length: SKELETON_ROWS }).map((_, idx) => (
            <Skeleton key={idx} variant="rectangular" height={48} />
          ))}
        </Stack>
      ) : error ? (
        <Alert severity="error" data-testid="home-recent-error">
          {t("home_recent_error")}
        </Alert>
      ) : recent.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-testid="home-recent-empty">
          {t("home_recent_empty")}
        </Typography>
      ) : (
        <List dense disablePadding>
          {recent.map((row) => (
            <RecentRow key={row.id} row={row} locale={i18n.language} onActivate={onActivate} />
          ))}
        </List>
      )}
    </HomeCard>
  );
};

RecentProjectsCard.propTypes = {
  scenarios: PropTypes.array.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string,
  onActivate: PropTypes.func,
};

export default RecentProjectsCard;
