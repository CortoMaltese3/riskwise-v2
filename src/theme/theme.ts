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
// `mutedText` darkened from `#6F6F6F` → `#5F5F5F` in #121 to clear WCAG AA
// 4.5:1 against `muted` (was 4.49:1 — one hundredth shy of AA).
const surfaceColors = {
  muted: "#F2F2F2",
  mutedText: "#5F5F5F",
  border: "#AAAAAA",
  borderLight: "#CCCCCC",
};

// Top-level navigation tab strip. `contrastText` flipped from white to the
// project's dark slate in #121: white-on-`#70ADB5` was 2.52:1 (failing AA at
// 14px); dark slate is 7.08:1.
const tabColors = {
  main: "#70ADB5",
  contrastText: "#0F172A",
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
    // Primary teal darkened in #121 for WCAG 2.1 AA compliance:
    //   - `main`  #45ABB9 → #2F7A86 (white-on-main was 2.70:1, now 4.94:1)
    //   - `dark`  #3B919D → #0E5A66 (white-on-dark was 3.67:1, now 7.86:1)
    // `light` stays as the tinted-surface swatch and is intended to pair with
    // dark text rather than white (see MainSubTabs unselected-tab fix).
    primary: {
      main: "#2F7A86",
      dark: "#0E5A66",
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
