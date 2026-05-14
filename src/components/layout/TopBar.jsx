import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";

import LanguageSelector from "../nav/LanguageButton";
import MinimizeButton from "../nav/MinimizeButton";
import ShutdownButton from "../nav/ShutdownButton";
import ThemeModeButton from "../nav/ThemeModeButton";
import ModeSwitchConfirmDialog from "../alerts/ModeSwitchConfirmDialog";

import giz_logo from "../../assets/giz_logo.png";
import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { switchAppMode } from "../../store/orchestrators";
import { TOP_BAR_HEIGHT } from "./Sidebar";

const GIZ_LOGO_WIDTH = 140;
const GIZ_LOGO_HEIGHT = 40;

const TopBar = () => {
  const { t } = useTranslation();
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);
  const selectedAppOption = useWorkspaceStore((s) => s.selectedAppOption);
  const isScenarioRunning = useResultsStore((s) => s.isScenarioRunning);

  const [pendingMode, setPendingMode] = useState(null);

  const handleModeChange = (_event, nextMode) => {
    // ToggleButtonGroup yields null when the active button is clicked again.
    // We always confirm an actual change; ignore the deselect case. Mode
    // changes also abort while a scenario is running because they reset
    // the workspace and would corrupt the in-flight job.
    if (!nextMode || nextMode === selectedAppOption || isScenarioRunning) return;
    setPendingMode(nextMode);
  };

  const handleConfirm = () => {
    if (pendingMode) switchAppMode(pendingMode);
    setPendingMode(null);
  };

  const handleCancel = () => setPendingMode(null);

  return (
    <AppBar
      position="fixed"
      role="banner"
      aria-label={t("application_title")}
      sx={{
        bgcolor: "primary.light",
        color: "primary.dark",
        top: 0,
        zIndex: (theme) => theme.zIndex.drawer + 1,
      }}
    >
      <Toolbar
        disableGutters
        sx={(theme) => ({
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          alignItems: "center",
          px: 1,
          minHeight: `${TOP_BAR_HEIGHT}px`,
          [theme.breakpoints.up("sm")]: { minHeight: `${TOP_BAR_HEIGHT}px` },
        })}
      >
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Tooltip title={t("sidebar_toggle")}>
            <IconButton
              aria-label={t("sidebar_toggle")}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              color="inherit"
              size="small"
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          </Tooltip>
          <Box
            component="img"
            src={giz_logo}
            alt="giz_logo"
            sx={{ width: GIZ_LOGO_WIDTH, height: GIZ_LOGO_HEIGHT, my: 1, mx: 2 }}
          />
        </Box>
        <Box
          sx={{
            display: { xs: "none", sm: "flex" },
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
          }}
        >
          <Typography
            noWrap
            component="div"
            sx={{
              fontSize: "1rem",
              fontWeight: 600,
              letterSpacing: "0.2rem",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            {t("application_title")}
          </Typography>
          <Tooltip
            title={isScenarioRunning ? t("scenario_running_disabled_tooltip") : ""}
            placement="bottom"
          >
            <ToggleButtonGroup
              size="small"
              color="primary"
              exclusive
              value={selectedAppOption}
              onChange={handleModeChange}
              aria-label={t("mode_aria_label")}
            >
              <ToggleButton value="era" aria-label={t("mode_era")} disabled={isScenarioRunning}>
                {t("mode_era")}
              </ToggleButton>
              <ToggleButton
                value="explore"
                aria-label={t("mode_explore")}
                disabled={isScenarioRunning}
              >
                {t("mode_explore")}
              </ToggleButton>
            </ToggleButtonGroup>
          </Tooltip>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <ThemeModeButton />
          <LanguageSelector />
          <MinimizeButton />
          <ShutdownButton />
        </Box>
      </Toolbar>
      <ModeSwitchConfirmDialog
        open={pendingMode !== null}
        pendingMode={pendingMode}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </AppBar>
  );
};

export default TopBar;
