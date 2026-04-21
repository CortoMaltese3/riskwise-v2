import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import BugReportIcon from "@mui/icons-material/BugReport";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import InfoIcon from "@mui/icons-material/Info";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import TourIcon from "@mui/icons-material/Tour";

import useStore from "../../store";
import { TOURS } from "../onboarding/tours";
import packageJson from "../../../package.json";

const SHORTCUTS = [
  { keys: "F1", actionKey: "help_shortcut_help_menu" },
  { keys: "Shift + ?", actionKey: "help_shortcut_help_menu" },
  { keys: "Esc", actionKey: "help_shortcut_close" },
];

// Help menu (issue #88). Drawer surfaced from the top-bar Help icon or the
// F1 / Shift+? keybinding mounted in App.jsx. Keeps four entry points:
// tour list, walkthrough restart, shortcuts dialog, and version info.
const HelpMenu = () => {
  const { t } = useTranslation();
  const helpMenuOpen = useStore((s) => s.helpMenuOpen);
  const setHelpMenuOpen = useStore((s) => s.setHelpMenuOpen);
  const startTour = useStore((s) => s.startTour);
  const startWalkthrough = useStore((s) => s.startWalkthrough);

  const [toursOpen, setToursOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const close = () => setHelpMenuOpen(false);

  const handleRestartWalkthrough = () => {
    close();
    startWalkthrough();
  };

  return (
    <>
      <Drawer
        anchor="right"
        open={helpMenuOpen}
        onClose={close}
        PaperProps={{ sx: { width: 320 } }}
      >
        <Box role="presentation" sx={{ p: 2 }}>
          <Typography variant="h6" component="h2" gutterBottom>
            {t("help_menu_title")}
          </Typography>
          <List>
            <ListItemButton
              onClick={() => setToursOpen((v) => !v)}
              aria-expanded={toursOpen}
              aria-controls="help-menu-tours"
            >
              <ListItemIcon>
                <TourIcon />
              </ListItemIcon>
              <ListItemText primary={t("help_menu_take_a_tour")} />
              {toursOpen ? <ExpandLess /> : <ExpandMore />}
            </ListItemButton>
            <Collapse in={toursOpen} unmountOnExit>
              <List id="help-menu-tours" component="div" disablePadding>
                {TOURS.map((tour) => (
                  <ListItemButton key={tour.id} sx={{ pl: 6 }} onClick={() => startTour(tour.id)}>
                    <ListItemText primary={t(tour.titleKey)} />
                  </ListItemButton>
                ))}
              </List>
            </Collapse>

            <ListItemButton onClick={handleRestartWalkthrough}>
              <ListItemIcon>
                <RestartAltIcon />
              </ListItemIcon>
              <ListItemText primary={t("help_menu_restart_walkthrough")} />
            </ListItemButton>

            <ListItemButton onClick={() => setShortcutsOpen(true)}>
              <ListItemIcon>
                <KeyboardIcon />
              </ListItemIcon>
              <ListItemText primary={t("help_menu_keyboard_shortcuts")} />
            </ListItemButton>

            <ListItemButton disabled>
              <ListItemIcon>
                <BugReportIcon />
              </ListItemIcon>
              <ListItemText
                primary={t("help_menu_export_diagnostics")}
                secondary={t("help_menu_coming_soon")}
              />
            </ListItemButton>

            <Divider sx={{ my: 1 }} />

            <ListItem>
              <ListItemIcon>
                <InfoIcon />
              </ListItemIcon>
              <ListItemText
                primary={t("help_menu_about")}
                secondary={t("help_menu_version", { version: packageJson.version })}
              />
            </ListItem>
          </List>
        </Box>
      </Drawer>

      <Dialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        aria-labelledby="help-shortcuts-dialog-title"
      >
        <DialogTitle id="help-shortcuts-dialog-title">
          {t("help_menu_keyboard_shortcuts")}
        </DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("help_shortcut_header_shortcut")}</TableCell>
                <TableCell>{t("help_shortcut_header_action")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {SHORTCUTS.map((row) => (
                <TableRow key={row.keys}>
                  <TableCell>{row.keys}</TableCell>
                  <TableCell>{t(row.actionKey)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShortcutsOpen(false)}>{t("onboarding_close")}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default HelpMenu;
