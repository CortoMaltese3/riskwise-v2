import { createTheme } from "@mui/material/styles";

/**
 * Phase 0 spike theme (issue #6). Scope is intentionally small: Inter font,
 * CSS variables, primary palette, shape radius, and a custom `inputCard`
 * palette carrying the legacy hex colours used by the scenario-configuration
 * panel. Phase 1 (Area 12.1) expands this into the full design-token system.
 */

const inputCardColors = {
  default: "#CCE1E7",
  valid: "#C0E7CF",
  invalid: "#FFB3B3",
  neutral: "#CFCFCF",
  hover: "#DAE7EA",
  panelBg: "#DDEBEF",
  sectionBg: "#DAE7EA",
  disabledBg: "#E6E6E6",
  disabledText: "#A6A6A6",
};

declare module "@mui/material/styles" {
  interface Palette {
    inputCard: typeof inputCardColors;
  }
  interface PaletteOptions {
    inputCard?: typeof inputCardColors;
  }
}

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: {
      main: "#45ABB9",
      dark: "#3B919D",
      light: "#8AC8D0",
      contrastText: "#ffffff",
    },
    background: { default: "#f8fafc", paper: "#ffffff" },
    inputCard: inputCardColors,
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  shape: { borderRadius: 12 },
});

export default theme;
