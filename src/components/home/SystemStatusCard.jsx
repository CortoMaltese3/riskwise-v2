import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { Box, Skeleton, Stack, Typography } from "@mui/material";

import { formatRelativeTime } from "../../lib/relativeTime";
import useEngineStatus from "../../hooks/useEngineStatus";
import HomeCard from "./HomeCard";

const DOT_SIZE = 10;

const STATUS_TONES = {
  ok: "success.main",
  warn: "warning.main",
  error: "error.main",
  pending: "text.disabled",
};

const StatusDot = ({ tone, label }) => (
  <Box
    component="span"
    role="img"
    aria-label={label}
    sx={{
      width: DOT_SIZE,
      height: DOT_SIZE,
      borderRadius: "50%",
      bgcolor: STATUS_TONES[tone] || STATUS_TONES.pending,
      flexShrink: 0,
      display: "inline-block",
    }}
  />
);

StatusDot.propTypes = {
  tone: PropTypes.oneOf(["ok", "warn", "error", "pending"]).isRequired,
  label: PropTypes.string.isRequired,
};

const StatusRow = ({ label, value, tone, tooltipLabel }) => (
  <Stack direction="row" alignItems="center" spacing={1.5}>
    <StatusDot tone={tone} label={tooltipLabel} />
    <Typography variant="body2" sx={{ flexGrow: 1 }}>
      {label}
    </Typography>
    <Typography variant="body2" color="text.secondary">
      {value}
    </Typography>
  </Stack>
);

StatusRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
  tone: PropTypes.oneOf(["ok", "warn", "error", "pending"]).isRequired,
  tooltipLabel: PropTypes.string.isRequired,
};

const SystemStatusCard = ({ api, lastSyncAt, locale }) => {
  const { t } = useTranslation();
  const { blocked, reason, ready } = useEngineStatus();

  const engineTone = !ready ? "pending" : blocked ? "warn" : "ok";
  const engineValue = !ready
    ? t("home_status_pending")
    : blocked
      ? reason || t("home_status_engine_update_required")
      : t("home_status_ok");

  const apiTone = api.status === "error" ? "error" : api.status === "loading" ? "pending" : "ok";
  const apiValue =
    api.status === "error"
      ? api.message || t("home_status_api_error")
      : api.status === "loading"
        ? t("home_status_api_loading")
        : t("home_status_ok");

  const lastSyncValue = lastSyncAt
    ? formatRelativeTime(lastSyncAt, locale)
    : t("home_status_never");
  const lastSyncTone = lastSyncAt ? "ok" : "pending";

  return (
    <HomeCard data-testid="home-system-status-card" title={t("home_status_title")}>
      {!ready ? (
        <Stack spacing={1.5} data-testid="home-status-loading">
          <Skeleton variant="rectangular" height={20} />
          <Skeleton variant="rectangular" height={20} />
          <Skeleton variant="rectangular" height={20} />
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          <StatusRow
            label={t("home_status_engine")}
            value={engineValue}
            tone={engineTone}
            tooltipLabel={t("home_status_engine_dot_aria", {
              status: engineValue,
              defaultValue: engineValue,
            })}
          />
          <StatusRow
            label={t("home_status_api")}
            value={apiValue}
            tone={apiTone}
            tooltipLabel={t("home_status_api_dot_aria", {
              status: apiValue,
              defaultValue: apiValue,
            })}
          />
          <StatusRow
            label={t("home_status_last_sync")}
            value={lastSyncValue}
            tone={lastSyncTone}
            tooltipLabel={t("home_status_last_sync_dot_aria", {
              status: lastSyncValue,
              defaultValue: lastSyncValue,
            })}
          />
        </Stack>
      )}
    </HomeCard>
  );
};

SystemStatusCard.propTypes = {
  api: PropTypes.shape({
    status: PropTypes.oneOf(["ok", "loading", "error"]).isRequired,
    message: PropTypes.string,
  }).isRequired,
  lastSyncAt: PropTypes.string,
  locale: PropTypes.string,
};

export default SystemStatusCard;
