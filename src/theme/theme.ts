import { createTheme } from "@mui/material/styles";

// Phase 1 design-token surface (issue #15). Hex literals live here; component
// code consumes these tokens via `sx={{ bgcolor: "header.main", ... }}` or
// `theme.palette.*`. Raw hex/rgb in component files is banned by ESLint for
// files listed under the `theme-tokens-enforced` block in eslint.config.mjs.

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

const headerColors = {
  main: "#8fc3d1",
  contrastText: "#0F172A",
};

declare module "@mui/material/styles" {
  interface Palette {
    inputCard: typeof inputCardColors;
    header: typeof headerColors;
  }
  interface PaletteOptions {
    inputCard?: typeof inputCardColors;
    header?: typeof headerColors;
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
    text: {
      primary: "#0F172A",
      secondary: "#334155",
    },
    background: { default: "#f8fafc", paper: "#ffffff" },
    inputCard: inputCardColors,
    header: headerColors,
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  shape: { borderRadius: 12 },
});

export default theme;
