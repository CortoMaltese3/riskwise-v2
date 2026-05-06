import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import {
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Box,
} from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import AssessmentIcon from "@mui/icons-material/Assessment";
import PublicIcon from "@mui/icons-material/Public";
import FolderIcon from "@mui/icons-material/Folder";
import SettingsIcon from "@mui/icons-material/Settings";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlined";

import useStore from "../../store";
import { SECTION_IDS } from "../../constants/sections";
import { layoutTransition } from "../../theme/theme";

export const SIDEBAR_WIDTH = 220;
export const SIDEBAR_COLLAPSED_WIDTH = 60;
// Matches the GIZ logo in TopBar.jsx (64px tall + 8px top/bottom margins).
// Toolbar in TopBar.jsx is pinned to this height so AppViewport's pt offset
// clears the fixed AppBar.
export const TOP_BAR_HEIGHT = 80;

const ITEM_META = {
  home: { labelKey: "sidebar_home", icon: HomeIcon },
  risk: { labelKey: "sidebar_risk_assessment", icon: AssessmentIcon },
  macro: { labelKey: "sidebar_macroeconomic", icon: PublicIcon },
  workspace: { labelKey: "sidebar_workspace", icon: FolderIcon },
  settings: { labelKey: "sidebar_settings", icon: SettingsIcon },
};

const items = SECTION_IDS.map((id) => ({ id, ...ITEM_META[id] }));

const Sidebar = ({ width }) => {
  const { t } = useTranslation();
  const { activeSection, setActiveSection, sidebarCollapsed } = useStore();
  const setGlossaryOpen = useStore((s) => s.setGlossaryOpen);

  return (
    <Box
      sx={{
        width,
        height: "100%",
        bgcolor: "background.paper",
        borderRight: 1,
        borderColor: "divider",
        overflowX: "hidden",
        transition: layoutTransition(["width"]),
        boxSizing: "border-box",
      }}
    >
      <Box
        component="nav"
        role="navigation"
        aria-label={t("sidebar_primary_nav_aria")}
        data-tour="sidebar-nav"
        sx={{ display: "flex", flexDirection: "column", height: "100%" }}
      >
        <List disablePadding sx={{ flexGrow: 1 }}>
          {items.map(({ id, labelKey, icon: Icon }) => {
            const label = t(labelKey);
            const selected = activeSection === id;
            const button = (
              <ListItemButton
                selected={selected}
                onClick={() => setActiveSection(id)}
                aria-label={label}
                aria-current={selected ? "page" : undefined}
                data-tour={id === "workspace" ? "workspace-nav" : undefined}
                sx={{
                  minHeight: 48,
                  px: sidebarCollapsed ? 2 : 2.5,
                  justifyContent: sidebarCollapsed ? "center" : "flex-start",
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    mr: sidebarCollapsed ? 0 : 2,
                    justifyContent: "center",
                    color: selected ? "primary.main" : "inherit",
                  }}
                >
                  <Icon />
                </ListItemIcon>
                {!sidebarCollapsed && <ListItemText primary={label} />}
              </ListItemButton>
            );
            return (
              <ListItem key={id} disablePadding>
                {sidebarCollapsed ? (
                  <Tooltip title={label} placement="right">
                    {button}
                  </Tooltip>
                ) : (
                  button
                )}
              </ListItem>
            );
          })}
        </List>
        <Box
          sx={{
            borderTop: 1,
            borderColor: "divider",
            p: 1,
            display: "flex",
            justifyContent: sidebarCollapsed ? "center" : "flex-start",
          }}
        >
          <Tooltip title={t("glossary_title")} placement="right">
            <IconButton
              aria-label={t("glossary_open_aria")}
              onClick={() => setGlossaryOpen(true)}
              size="small"
            >
              <HelpOutlineIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );
};

Sidebar.propTypes = {
  width: PropTypes.number.isRequired,
};

export default Sidebar;
