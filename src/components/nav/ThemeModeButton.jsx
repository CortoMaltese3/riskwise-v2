import React, { useState } from "react";

import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import SettingsBrightnessIcon from "@mui/icons-material/SettingsBrightness";
import { useColorScheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

// Same shape as `LanguageButton` (icon-trigger + Menu of options). If a third
// nav button gains the same shape, extract a shared `IconMenuButton`.
//
// Mode persistence and the `data-mui-color-scheme` attribute on <html> are
// owned by MUI's ThemeProvider (configured in App.jsx with our storage key);
// this component is a thin reader/setter via `useColorScheme`.
const ThemeModeButton = () => {
  const { t } = useTranslation();
  const { mode, setMode } = useColorScheme();
  const [anchorEl, setAnchorEl] = useState(null);

  const modes = [
    { code: "light", label: t("theme_mode_light"), Icon: LightModeIcon },
    { code: "dark", label: t("theme_mode_dark"), Icon: DarkModeIcon },
    { code: "system", label: t("theme_mode_system"), Icon: SettingsBrightnessIcon },
  ];

  // `mode` is undefined during SSR or before the provider hydrates; fall back
  // to the system icon so the button still renders.
  const ActiveIcon = modes.find((m) => m.code === mode)?.Icon ?? SettingsBrightnessIcon;

  const handleClose = () => setAnchorEl(null);
  const handleSelect = (next) => {
    setMode(next);
    handleClose();
  };

  return (
    <>
      <IconButton
        color="inherit"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label={t("theme_mode_selector_aria")}
        aria-haspopup="menu"
        aria-controls="theme-mode-menu"
        aria-expanded={Boolean(anchorEl)}
      >
        <ActiveIcon />
      </IconButton>
      <Menu id="theme-mode-menu" anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
        {modes.map((m) => (
          <MenuItem key={m.code} selected={mode === m.code} onClick={() => handleSelect(m.code)}>
            {m.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default ThemeModeButton;
