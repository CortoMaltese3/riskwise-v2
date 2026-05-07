import { createTheme } from "@mui/material/styles";

// Phase 1 design-token surface (issue #15, extended in #78). Hex literals live
// in this file only; component code consumes these tokens via
// `sx={{ bgcolor: "primary.light", ... }}` or `theme.palette.*`. Raw hex/rgb in
// component files is banned by ESLint (see `eslint.config.mjs`). The same ban
// applies to raw `px` / `em` literals in component code (issue #217 / spec
// § Density) — spacing comes from `theme.spacing(n)` and the named-constant
// escapes for fixed chrome (`TOP_BAR_HEIGHT`, `SIDEBAR_WIDTH`,
// `SIDEBAR_COLLAPSED_WIDTH`, `INPUT_CARD_HEIGHT`).

// Light/dark color schemes (issue #288). Both schemes share the same custom
// palette slots so component `sx={{ bgcolor: "primary.light" }}` keeps working
// — MUI swaps the underlying CSS variable based on the
// `data-mui-color-scheme` attribute set on `<html>` from `App.jsx`.

// Issue #298 rationalises the palette into a flat semantic system. New
// namespaces (`primary` with `bg`, `secondary`, `surface.subdued`, `border`,
// `feedback`, `viz`) are introduced alongside the legacy tokens (`header`,
// `accent`, `card`, `tab`, `mapControl`, `tableHeader`, `loader`, `slider`,
// `inputCard`). Components migrate in the next commit; the legacy slots are
// removed once every consumer has moved.

// Motion tokens (issue #217 / spec § Motion). One canonical duration + easing
// applied to every layout transition (sidebar collapse / expand, card hover,
// drawer open / close, panel resize). Chart, map, and skeleton transitions
// are owned by their respective libraries and stay outside this token set.
// `prefers-reduced-motion` is respected by MUI v9 default behaviour.
export const MOTION_DURATION_MS = 150;
export const MOTION_EASING = "cubic-bezier(0.0, 0, 0.2, 1)";

// Convenience builder for sx blocks. Pass the CSS properties to animate, get
// a canonical transition string back. Default `["all"]` covers the common
// hover / state-change case without enumerating every property.
export const layoutTransition = (props: readonly string[] = ["all"]): string =>
  props.map((p) => `${p} ${MOTION_DURATION_MS}ms ${MOTION_EASING}`).join(", ");

// --- New semantic palette (issue #298) ---------------------------------------

// Primary teal. `light` slightly paler than the spec'd `#8FC3D1` so
// `primary.dark` (`#0E5A66`) on `primary.light` clears WCAG 2.1 AA 4.5:1 with
// headroom (5.1:1) — the original swatch measured 4.07:1. The light-mode
// `primary.{main,dark,contrastText}` values match the existing palette so
// downstream UI is pixel-equivalent through the `header` migration.
const lightPrimary = {
  bg: "#DDEBEF",
  light: "#9CCDDA",
  main: "#2F7A86",
  dark: "#0E5A66",
  contrastText: "#FFFFFF",
};

// Secondary salmon (replaces the legacy `accent` namespace).
const lightSecondary = {
  bg: "#FFEBEB",
  light: "#FFCCCC",
  main: "#F79191",
  dark: "#F35A5A",
  contrastText: "#0F172A",
};

// Surface neutrals. `muted` matches the legacy value; `subdued` is the new
// "no validation state" card background, deliberately darker than `muted`.
const lightSurface = {
  muted: "#F2F2F2",
  subdued: "#CFCFCF",
};

const lightText = {
  primary: "#0F172A",
  secondary: "#5F5F5F",
  disabled: "#A6A6A6",
};

const lightBorder = {
  default: "#CCCCCC",
  strong: "#AAAAAA",
};

// Light-mode feedback `main` swatches darkened from the spec values so each
// passes WCAG AA 4.5:1 on `background.paper` (#FFFFFF):
//   success: #05A660 → #047D49 (3.16:1 → 5.21:1)
//   warning: #E5B800 → #8C6F00 (2.20:1 → 4.79:1) — yellow-on-white is the
//     hardest pair; the spec calls this out explicitly.
//   error:   #E53535 → #D32525 (4.29:1 → 5.17:1)
// The `bg` tints are unchanged. Dark-mode swatches keep the spec values
// because they pair against `#1E293B` paper, which has plenty of headroom.
const lightFeedback = {
  success: { main: "#047D49", bg: "#D9F5E6" },
  warning: { main: "#8C6F00", bg: "#FDF4CC" },
  error: { main: "#D32525", bg: "#FFE4E4" },
  info: { main: "#004FC4", bg: "#D9E8FF" },
};

// Categorical chart palette (six fixed hues, used in both schemes). The order
// is stable so chart series colours don't shift when datasets change.
const VIZ_CATEGORICAL = [
  "#2F7A86", // primary teal
  "#F79191", // secondary salmon
  "#FDDD48", // warning yellow
  "#5B8DEF", // info blue
  "#9966FF", // purple
  "#39D98A", // success green
] as const;

const lightViz = {
  categorical: VIZ_CATEGORICAL as readonly string[],
  positive: "#05A660",
  neutral: "#2F7A86",
  negative: "#E53535",
  ramps: {
    flood: { interpolator: "Blues", domain: [0, 1] as [number, number] },
    heatwave: { interpolator: "Reds", domain: [0, 1] as [number, number] },
    drought: { interpolator: "YlOrBr", domain: [0, 1] as [number, number] },
    risk: { interpolator: "YlOrRd", domain: [0, 1] as [number, number] },
  },
};

// --- Dark scheme (new) -------------------------------------------------------

// Dark `primary.light` is intentionally pale so `primary.dark` (`#0E5A66`)
// remains AA-readable on it (5.4:1) — the spec'd `#5FA0AE` measured 2.67:1.
// This follows Material 3's dark-mode convention of pale tinted primaries
// paired with dark contrast text.
const darkPrimary = {
  bg: "#1E3A42",
  light: "#A0CDD8",
  main: "#5FB3C2",
  dark: "#0E5A66",
  contrastText: "#0F172A",
};

const darkSecondary = {
  bg: "#3D2020",
  light: "#7A4A4A",
  main: "#F79191",
  dark: "#E04848",
  contrastText: "#0F172A",
};

const darkSurface = {
  muted: "#334155",
  subdued: "#475569",
};

const darkText = {
  primary: "#F1F5F9",
  secondary: "#94A3B8",
  disabled: "#64748B",
};

const darkBorder = {
  default: "#334155",
  strong: "#475569",
};

const darkFeedback = {
  success: { main: "#39D98A", bg: "#0F3D26" },
  warning: { main: "#FDDD48", bg: "#3D3300" },
  error: { main: "#FF5C5C", bg: "#3D1414" },
  info: { main: "#5B8DEF", bg: "#0F2647" },
};

const darkViz = {
  categorical: VIZ_CATEGORICAL as readonly string[],
  positive: "#39D98A",
  neutral: "#5FB3C2",
  negative: "#FF5C5C",
  // Dark-mode ramps clip the unreadable pale steps at the start of each D3
  // sequential scheme, preserving direction + hue family. Resolved via
  // `d3.interpolateXxx` in `src/utils/colorScales.js`.
  ramps: {
    flood: { interpolator: "Blues", domain: [0.3, 1.0] as [number, number] },
    heatwave: { interpolator: "Reds", domain: [0.3, 1.0] as [number, number] },
    drought: { interpolator: "YlOrBr", domain: [0.25, 1.0] as [number, number] },
    risk: { interpolator: "YlOrRd", domain: [0.25, 1.0] as [number, number] },
  },
};

// --- Legacy palette (issues #15, #78, #288) ---------------------------------
// Retained until every consumer migrates to the semantic tokens above. Removal
// is the last commit of issue #298.

const lightInputCardColors = {
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

// `contrastText` darkened from `#0F172A` → `#0A4750` in #287 to recolor the
// TopBar away from generic dark slate and onto the brand teal family.
const lightHeaderColors = {
  main: "#8fc3d1",
  contrastText: "#0A4750",
};

const lightAccentColors = {
  main: "#F79191",
  light: "#FFCCCC",
  paleBg: "#FFEBEB",
  dark: "#F35A5A",
  contrastText: "#0F172A",
};

const lightCardColors = {
  bg: "#DCEFF2",
};

// Old `surface` shape is a superset of the new one for the migration window.
// `mutedText`, `border`, `borderLight` move to `text.secondary`, `border.strong`,
// `border.default` respectively in the new system.
const lightSurfaceColors = {
  muted: "#F2F2F2",
  mutedText: "#5F5F5F",
  border: "#AAAAAA",
  borderLight: "#CCCCCC",
  subdued: "#CFCFCF",
};

const lightTabColors = {
  main: "#70ADB5",
  contrastText: "#0F172A",
};

const lightMapControlColors = {
  main: "#2A4D69",
  light: "#5C87B1",
  hover: "#9886D6",
  contrastText: "#FFFFFF",
};

const lightTableHeaderColors = {
  main: "#73B588",
};

const lightLoaderColors = {
  main: "#2A4D69",
};

const lightSliderColors = {
  disabledRail: "#D8D8D8",
};

const darkInputCardColors = {
  default: "#1E3A42",
  valid: "#1E4030",
  invalid: "#5C2A2A",
  neutral: "#3A3A3A",
  hover: "#264852",
  panelBg: "#1E3A42",
  sectionBg: "#264852",
  disabledBg: "#2A3340",
  disabledText: "#64748B",
};

const darkHeaderColors = {
  main: "#1F4F58",
  contrastText: "#F1F5F9",
};

const darkAccentColors = {
  main: "#F79191",
  light: "#5C3A3A",
  paleBg: "#3A2828",
  dark: "#FFB8B8",
  contrastText: "#0F172A",
};

const darkCardColors = {
  bg: "#1E293B",
};

const darkSurfaceColors = {
  muted: "#334155",
  mutedText: "#94A3B8",
  border: "#475569",
  borderLight: "#334155",
  subdued: "#475569",
};

const darkTabColors = {
  main: "#1F4F58",
  contrastText: "#F1F5F9",
};

const darkMapControlColors = {
  main: "#5C87B1",
  light: "#2A4D69",
  hover: "#9886D6",
  contrastText: "#FFFFFF",
};

const darkTableHeaderColors = {
  main: "#3F6E51",
};

const darkLoaderColors = {
  main: "#0F172A",
};

const darkSliderColors = {
  disabledRail: "#475569",
};

declare module "@mui/material/styles" {
  interface Palette {
    // New semantic namespaces (#298)
    surface: typeof lightSurfaceColors;
    border: typeof lightBorder;
    feedback: typeof lightFeedback;
    viz: typeof lightViz;
    // Legacy namespaces — removed once consumers migrate.
    inputCard: typeof lightInputCardColors;
    header: typeof lightHeaderColors;
    accent: typeof lightAccentColors;
    card: typeof lightCardColors;
    tab: typeof lightTabColors;
    mapControl: typeof lightMapControlColors;
    tableHeader: typeof lightTableHeaderColors;
    loader: typeof lightLoaderColors;
    slider: typeof lightSliderColors;
  }
  interface PaletteOptions {
    surface?: typeof lightSurfaceColors;
    border?: typeof lightBorder;
    feedback?: typeof lightFeedback;
    viz?: typeof lightViz;
    inputCard?: typeof lightInputCardColors;
    header?: typeof lightHeaderColors;
    accent?: typeof lightAccentColors;
    card?: typeof lightCardColors;
    tab?: typeof lightTabColors;
    mapControl?: typeof lightMapControlColors;
    tableHeader?: typeof lightTableHeaderColors;
    loader?: typeof lightLoaderColors;
    slider?: typeof lightSliderColors;
  }
}

// `data-mui-color-scheme` is the attribute App.jsx flips on `<html>` to
// switch schemes. The selector value here is what MUI uses to namespace the
// generated CSS variables (e.g. `[data-mui-color-scheme="dark"] { --mui-... }`).
export const COLOR_SCHEME_ATTRIBUTE = "data-mui-color-scheme";

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: COLOR_SCHEME_ATTRIBUTE,
  },
  defaultColorScheme: "light",
  colorSchemes: {
    light: {
      palette: {
        primary: lightPrimary,
        secondary: lightSecondary,
        // `error.main` is aliased to `feedback.error.main` so MUI built-ins
        // (`<Alert severity="error">`, etc.) inherit the new red without
        // needing to be migrated component-by-component.
        error: {
          main: lightFeedback.error.main,
          dark: "#BA000D",
          contrastText: "#FFFFFF",
        },
        text: lightText,
        background: { default: "#F8FAFC", paper: "#FFFFFF" },
        surface: lightSurfaceColors,
        border: lightBorder,
        feedback: lightFeedback,
        viz: lightViz,
        inputCard: lightInputCardColors,
        header: lightHeaderColors,
        accent: lightAccentColors,
        card: lightCardColors,
        tab: lightTabColors,
        mapControl: lightMapControlColors,
        tableHeader: lightTableHeaderColors,
        loader: lightLoaderColors,
        slider: lightSliderColors,
      },
    },
    dark: {
      palette: {
        primary: darkPrimary,
        secondary: darkSecondary,
        error: {
          main: darkFeedback.error.main,
          dark: "#FF8A95",
          contrastText: "#0F172A",
        },
        text: darkText,
        background: { default: "#0F172A", paper: "#1E293B" },
        surface: darkSurfaceColors,
        border: darkBorder,
        feedback: darkFeedback,
        viz: darkViz,
        inputCard: darkInputCardColors,
        header: darkHeaderColors,
        accent: darkAccentColors,
        card: darkCardColors,
        tab: darkTabColors,
        mapControl: darkMapControlColors,
        tableHeader: darkTableHeaderColors,
        loader: darkLoaderColors,
        slider: darkSliderColors,
      },
    },
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  shape: { borderRadius: 12 },
  // Override MUI's 300 ms default standard duration to the canonical 150 ms.
  // Easing keeps MUI's `easeOut` cubic-bezier (the spec's canonical curve).
  // Component code consumes these via `theme.transitions.create(...)` or via
  // the `layoutTransition()` helper above; no component should hand-roll a
  // duration / easing again.
  transitions: {
    duration: {
      standard: MOTION_DURATION_MS,
    },
  },
  components: {
    // The visible focus ring is owned here so every interactive element gets
    // it for free (spec § Focus and keyboard). Components must not redefine
    // `&:focus-visible` without an explanatory code comment.
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
    // Button intents (issue #285 / spec § Buttons). Three intents driven by
    // MUI variant; size is owned by the theme, not call sites.
    //
    //   variant="contained" — primary CTA. One per surface (empty-state hero,
    //                         modal primary action, dropzone browse, page CTA).
    //                         Anchored with `minWidth: 140` so short labels
    //                         like "Save" don't shrink to a tab.
    //   variant="outlined"  — action. Inline / secondary actions in toolbars,
    //                         tables, and dialog secondary buttons.
    //   variant="text"      — subtle. Tertiary, nav-like.
    //
    // Call sites must NOT pass `size` on `<Button>` (the theme owns sizing) and
    // must NOT pass sizing-related `sx` (`width`, `minWidth`, `padding`,
    // `fontSize`). Spacing (`mt`, `mb`) belongs to the parent layout where
    // possible, but staying on the button is acceptable when the parent is a
    // plain `Box` — the rule targets *sizing*, not nudges.
    //
    // Legitimate size="small" on `<Button>` is reserved for dense toolbar /
    // table-row / chart-toggle actions. Avoid it on primary CTAs.
    MuiButton: {
      defaultProps: {
        // Flat contained buttons (no MUI default elevation shadow).
        disableElevation: true,
      },
      styleOverrides: {
        contained: {
          minWidth: 140,
        },
        sizeSmall: {
          minWidth: 0,
        },
      },
    },
  },
});

export default theme;
