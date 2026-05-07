import React from "react";
import { useTranslation } from "react-i18next";
import { AppBar, Toolbar, Typography, Box, IconButton, Tooltip } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";

import LanguageSelector from "../nav/LanguageButton";
import MinimizeButton from "../nav/MinimizeButton";
import ReloadButton from "../nav/ReloadButton";
import ShutdownButton from "../nav/ShutdownButton";
import ThemeModeButton from "../nav/ThemeModeButton";

import giz_logo from "../../assets/giz_logo.png";
import useStore from "../../store";
import { TOP_BAR_HEIGHT } from "./Sidebar";

const GIZ_LOGO_WIDTH = 140;
const GIZ_LOGO_HEIGHT = 40;

const TopBar = () => {
  const { t } = useTranslation();
  const { sidebarCollapsed, setSidebarCollapsed } = useStore();

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
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <ReloadButton />
          <ThemeModeButton />
          <LanguageSelector />
          <MinimizeButton />
          <ShutdownButton />
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default TopBar;
