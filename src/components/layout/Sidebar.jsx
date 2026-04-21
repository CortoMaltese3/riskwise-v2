import React from "react";
import { useTranslation } from "react-i18next";
import {
  Drawer,
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

import useStore from "../../store";

export const SIDEBAR_WIDTH = 220;
export const SIDEBAR_COLLAPSED_WIDTH = 60;
export const TOP_BAR_HEIGHT = 64;

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
      <Box component="nav" role="navigation" aria-label={t("sidebar_primary_nav_aria")}>
        <List disablePadding>
          {items.map(({ id, labelKey, icon: Icon }) => {
            const label = t(labelKey);
            const selected = activeSection === id;
            const button = (
              <ListItemButton
                selected={selected}
                onClick={() => setActiveSection(id)}
                aria-label={label}
                aria-current={selected ? "page" : undefined}
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
      </Box>
    </Drawer>
  );
};

export default Sidebar;
