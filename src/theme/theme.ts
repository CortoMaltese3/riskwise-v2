import { createTheme } from "@mui/material/styles";

// Phase 1 design-token surface (issue #15, extended in #78). Hex literals live
// in this file only; component code consumes these tokens via
// `sx={{ bgcolor: "header.main", ... }}` or `theme.palette.*`. Raw hex/rgb in
// component files is banned by ESLint (see `eslint.config.mjs`).

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

// Salmon/pink action palette used across card titles, primary action buttons
// and selected-state chips throughout the v1 UI. Kept as a sibling to the
// primary teal so the two can be paired without overloading MUI's primary.
const accentColors = {
  main: "#F79191",
  light: "#FFCCCC",
  paleBg: "#FFEBEB",
  dark: "#F35A5A",
  contrastText: "#0F172A",
};

// Card chrome: pale teal fill + primary.dark border used on every input card.
const cardColors = {
  bg: "#DCEFF2",
};

// Muted neutral surface used for "remarks" sections and secondary text lines.
const surfaceColors = {
  muted: "#F2F2F2",
  mutedText: "#6F6F6F",
  border: "#AAAAAA",
  borderLight: "#CCCCCC",
};

// Top-level navigation tab strip.
const tabColors = {
  main: "#70ADB5",
  contrastText: "#FFFFFF",
};

// Map layer-switcher buttons (hazard/exposure/risk maps).
const mapControlColors = {
  main: "#2A4D69",
  light: "#5C87B1",
  hover: "#9886D6",
  contrastText: "#FFFFFF",
};

// Results table header (MUITable).
const tableHeaderColors = {
  main: "#73B588",
};

// Legacy loader background swatch.
const loaderColors = {
  main: "#2A4D69",
};

// Slider disabled-rail swatch.
const sliderColors = {
  disabledRail: "#D8D8D8",
};

declare module "@mui/material/styles" {
  interface Palette {
    inputCard: typeof inputCardColors;
    header: typeof headerColors;
    accent: typeof accentColors;
    card: typeof cardColors;
    surface: typeof surfaceColors;
    tab: typeof tabColors;
    mapControl: typeof mapControlColors;
    tableHeader: typeof tableHeaderColors;
    loader: typeof loaderColors;
    slider: typeof sliderColors;
  }
  interface PaletteOptions {
    inputCard?: typeof inputCardColors;
    header?: typeof headerColors;
    accent?: typeof accentColors;
    card?: typeof cardColors;
    surface?: typeof surfaceColors;
    tab?: typeof tabColors;
    mapControl?: typeof mapControlColors;
    tableHeader?: typeof tableHeaderColors;
    loader?: typeof loaderColors;
    slider?: typeof sliderColors;
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
    error: {
      main: "#B00020",
      dark: "#BA000D",
      contrastText: "#ffffff",
    },
    text: {
      primary: "#0F172A",
      secondary: "#334155",
    },
    background: { default: "#f8fafc", paper: "#ffffff" },
    inputCard: inputCardColors,
    header: headerColors,
    accent: accentColors,
    card: cardColors,
    surface: surfaceColors,
    tab: tabColors,
    mapControl: mapControlColors,
    tableHeader: tableHeaderColors,
    loader: loaderColors,
    slider: sliderColors,
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButtonBase: {
      styleOverrides: {
        root: {
          "&:focus-visible": {
            outline: "2px solid var(--mui-palette-primary-main)",
            outlineOffset: "2px",
          },
        },
      },
    },
  },
});

export default theme;
