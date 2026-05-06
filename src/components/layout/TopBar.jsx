import React from "react";
import { useTranslation } from "react-i18next";
import { AppBar, Toolbar, Typography, Box, IconButton, Tooltip } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";

import LanguageSelector from "../nav/LanguageButton";
import MinimizeButton from "../nav/MinimizeButton";
import ReloadButton from "../nav/ReloadButton";
import ShutdownButton from "../nav/ShutdownButton";

import giz_logo from "../../assets/giz_logo.png";
import useStore from "../../store";
import { TOP_BAR_HEIGHT } from "./Sidebar";

const GIZ_LOGO_WIDTH = 140;
const GIZ_LOGO_HEIGHT = 40;

const sectionTitleKeys = {
  home: "sidebar_home",
  risk: "sidebar_risk_assessment",
  macro: "sidebar_macroeconomic",
  workspace: "sidebar_workspace",
  settings: "sidebar_settings",
};

const TopBar = () => {
  const { t } = useTranslation();
  const { activeSection, sidebarCollapsed, setSidebarCollapsed } = useStore();

  return (
    <AppBar
      position="fixed"
      role="banner"
      aria-label={t("application_title")}
      sx={{
        bgcolor: "header.main",
        color: "header.contrastText",
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
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1.1,
          }}
        >
          <Typography
            variant="overline"
            component="div"
            sx={{
              fontSize: "0.7rem",
              fontWeight: 600,
              letterSpacing: "0.15rem",
              opacity: 0.75,
              lineHeight: 1.2,
            }}
          >
            {t("application_title")}
          </Typography>
          <Typography
            noWrap
            component="div"
            sx={{
              fontSize: "1.4rem",
              fontWeight: 600,
              letterSpacing: "0.02rem",
              lineHeight: 1.2,
            }}
          >
            {t(sectionTitleKeys[activeSection] || "application_title")}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <ReloadButton />
          <LanguageSelector />
          <MinimizeButton />
          <ShutdownButton />
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default TopBar;
