import React, { useState } from "react";

import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import SettingsBrightnessIcon from "@mui/icons-material/SettingsBrightness";
import { useTranslation } from "react-i18next";

import useStore from "../../store";

// Same shape as `LanguageButton` (icon-trigger + Menu of options). If a third
// nav button gains the same shape, extract a shared `IconMenuButton`.
const ThemeModeButton = () => {
  const { t } = useTranslation();
  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const [anchorEl, setAnchorEl] = useState(null);

  const modes = [
    { code: "light", label: t("theme_mode_light"), Icon: LightModeIcon },
    { code: "dark", label: t("theme_mode_dark"), Icon: DarkModeIcon },
    { code: "system", label: t("theme_mode_system"), Icon: SettingsBrightnessIcon },
  ];

  const ActiveIcon = modes.find((m) => m.code === themeMode)?.Icon ?? SettingsBrightnessIcon;

  const handleClose = () => setAnchorEl(null);
  const handleSelect = (mode) => {
    setThemeMode(mode);
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
        {modes.map((mode) => (
          <MenuItem
            key={mode.code}
            selected={themeMode === mode.code}
            onClick={() => handleSelect(mode.code)}
          >
            {mode.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default ThemeModeButton;
