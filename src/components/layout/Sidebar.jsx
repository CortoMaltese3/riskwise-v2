import React from "react";
import { useTranslation } from "react-i18next";
import {
  Drawer,
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

export const SIDEBAR_WIDTH = 220;
export const SIDEBAR_COLLAPSED_WIDTH = 60;
// Matches the GIZ logo in TopBar.jsx (64px tall + 8px top/bottom margins).
// Toolbar in TopBar.jsx is pinned to this height so the banner and sidebar
// paper align cleanly under the AppBar.
export const TOP_BAR_HEIGHT = 80;

const items = [
  { id: "home", labelKey: "sidebar_home", icon: HomeIcon },
  { id: "risk", labelKey: "sidebar_risk_assessment", icon: AssessmentIcon },
  { id: "macro", labelKey: "sidebar_macroeconomic", icon: PublicIcon },
  { id: "workspace", labelKey: "sidebar_workspace", icon: FolderIcon },
  { id: "settings", labelKey: "sidebar_settings", icon: SettingsIcon },
];

const Sidebar = () => {
  const { t } = useTranslation();
  const { activeSection, setActiveSection, sidebarCollapsed } = useStore();
  const setGlossaryOpen = useStore((s) => s.setGlossaryOpen);
  const width = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width,
          top: TOP_BAR_HEIGHT,
          height: `calc(100% - ${TOP_BAR_HEIGHT}px)`,
          overflowX: "hidden",
          transition: "width 150ms ease",
          boxSizing: "border-box",
        },
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
    </Drawer>
  );
};

export default Sidebar;
