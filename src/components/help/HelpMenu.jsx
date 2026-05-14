import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
import InfoIcon from "@mui/icons-material/Info";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import useUIStore from "../../store/useUIStore";
import packageJson from "../../../package.json";

const SHORTCUTS = [
  { keys: "F1", actionKey: "help_shortcut_help_menu" },
  { keys: "Shift + ?", actionKey: "help_shortcut_help_menu" },
  { keys: "Esc", actionKey: "help_shortcut_close" },
];

// Help menu (issue #88). Dialog surfaced from the top-bar Help icon or the
// F1 / Shift+? keybinding mounted in App.jsx. Keeps four entry points:
// tour list, walkthrough restart, shortcuts dialog, and version info.
const HelpMenu = () => {
  const { t } = useTranslation();
  const helpMenuOpen = useUIStore((s) => s.helpMenuOpen);
  const setHelpMenuOpen = useUIStore((s) => s.setHelpMenuOpen);
  const setGlossaryOpen = useUIStore((s) => s.setGlossaryOpen);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const close = () => setHelpMenuOpen(false);

  const handleOpenGlossary = () => {
    close();
    setGlossaryOpen(true);
  };

  return (
    <>
      <Dialog
        open={helpMenuOpen}
        onClose={close}
        maxWidth="sm"
        fullWidth
        aria-labelledby="help-menu-dialog-title"
      >
        <DialogTitle id="help-menu-dialog-title">{t("help_menu_title")}</DialogTitle>
        <DialogContent dividers>
          <List>
            <ListItemButton onClick={handleOpenGlossary}>
              <ListItemIcon>
                <MenuBookIcon />
              </ListItemIcon>
              <ListItemText primary={t("help_menu_glossary")} />
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
        </DialogContent>
      </Dialog>

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
