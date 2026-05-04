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

const GIZ_LOGO_WIDTH = 230;
const GIZ_LOGO_HEIGHT = 64;

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
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1,
          minHeight: `${TOP_BAR_HEIGHT}px`,
          "@media (min-width:600px)": { minHeight: `${TOP_BAR_HEIGHT}px` },
        }}
      >
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
        <Box sx={{ display: "flex", alignItems: "center", flexBasis: "25%", flexGrow: 0 }}>
          <Box
            component="img"
            src={giz_logo}
            alt="giz_logo"
            sx={{ width: GIZ_LOGO_WIDTH, height: GIZ_LOGO_HEIGHT, my: 1, mx: 2 }}
          />
        </Box>
        <Typography
          variant="h5"
          noWrap
          component="div"
          sx={{ flexGrow: 1, textAlign: "center", display: { xs: "none", sm: "block" } }}
        >
          {t(sectionTitleKeys[activeSection] || "application_title")}
        </Typography>
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
