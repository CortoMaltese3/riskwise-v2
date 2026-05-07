import { createTheme } from "@mui/material/styles";

// Phase 1 design-token surface (issue #15, extended in #78, rationalised in
// #298). Hex literals live in this file only; component code consumes these
// tokens via `sx={{ bgcolor: "primary.light", ... }}` or `theme.palette.*`.
// Raw hex/rgb in component files is banned by ESLint (see `eslint.config.mjs`).
// The same ban applies to raw `px` / `em` literals in component code (issue
// #217 / spec § Density) — spacing comes from `theme.spacing(n)` and the
// named-constant escapes for fixed chrome (`TOP_BAR_HEIGHT`, `SIDEBAR_WIDTH`,
// `SIDEBAR_COLLAPSED_WIDTH`, `INPUT_CARD_HEIGHT`).

// Light/dark color schemes (issue #288). Both schemes share the same custom
// palette slots so component `sx={{ bgcolor: "primary.light" }}` keeps working
// — MUI swaps the underlying CSS variable based on the
// `data-mui-color-scheme` attribute set on `<html>` from `App.jsx`.

// Issue #298 collapses the v1 palette into seven semantic namespaces: `primary`
// (with a `bg` step), `secondary`, `surface`, `text`, `border`, `feedback`,
// `viz`. The legacy ad-hoc namespaces — `header`, `accent`, `card`, `tab`,
// `mapControl`, `tableHeader`, `loader`, `slider`, `inputCard` — are gone.
// MUI's built-in `error.main` is aliased to `feedback.error.main` so
// `<Alert severity="error">` and other MUI internals continue to use the new
// red without per-component migration.

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

// --- Light scheme ------------------------------------------------------------

// Primary teal. `light` slightly paler than the spec'd `#8FC3D1` so
// `primary.dark` (`#0E5A66`) on `primary.light` clears WCAG 2.1 AA 4.5:1 with
// headroom — the original swatch measured 4.07:1.
//
// `bg` and `bgStrong` are two pale-teal steps used together: `bg` for the
// outer panel surrounding a group of cards, `bgStrong` for the cards
// themselves. The two-step hierarchy matches the v1 inputCard panel/default
// pairing (#DDEBEF panel, #CCE1E7 card) so cards sit visibly on the panel
// instead of dissolving into it.
const lightPrimary = {
  bg: "#DDEBEF",
  bgStrong: "#C9DEE3",
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

// Surface neutrals. `subdued` is the "no validation state" card background,
// deliberately darker than `muted` so the unselected card reads as inert.
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

// Light-mode feedback `main` swatches darkened from the #298 spec values so
// each passes WCAG AA 4.5:1 on `background.paper` (#FFFFFF):
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
  // Light-mode ramps use D3's pre-baked schemeXxx[9] arrays sliced to the
  // dark end (resolved in `src/utils/colorScales.js`). Domain `[0, 1]`
  // means "use the scheme as-is".
  ramps: {
    flood: { interpolator: "Blues", domain: [0, 1] as [number, number] },
    heatwave: { interpolator: "Reds", domain: [0, 1] as [number, number] },
    drought: { interpolator: "YlOrBr", domain: [0, 1] as [number, number] },
    risk: { interpolator: "YlOrRd", domain: [0, 1] as [number, number] },
  },
};

// --- Dark scheme -------------------------------------------------------------

// Dark `primary.light` is intentionally pale so `primary.dark` (`#0E5A66`)
// remains AA-readable on it — the spec'd `#5FA0AE` measured 2.67:1. This
// follows Material 3's dark-mode convention of pale tinted primaries paired
// with dark contrast text.
//
// `bgStrong` is *lighter* than `bg` in dark mode: dark surfaces follow
// elevation conventions where higher-emphasis elements move toward white,
// so cards on a panel pop one step lighter than the panel itself.
const darkPrimary = {
  bg: "#1E3A42",
  bgStrong: "#2A4F58",
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

declare module "@mui/material/styles" {
  interface Palette {
    surface: typeof lightSurface;
    border: typeof lightBorder;
    feedback: typeof lightFeedback;
    viz: typeof lightViz;
  }
  interface PaletteOptions {
    surface?: typeof lightSurface;
    border?: typeof lightBorder;
    feedback?: typeof lightFeedback;
    viz?: typeof lightViz;
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
        // MUI's default `action.disabledBackground` (rgba(0,0,0,0.12)) is too
        // translucent to read against tinted card surfaces — the disabled
        // OutlinedInput slot dissolves into the card. Override with a solid
        // neutral grey that sits clearly on top of `primary.bgStrong`.
        action: { disabledBackground: "#E6E6E6" },
        surface: lightSurface,
        border: lightBorder,
        feedback: lightFeedback,
        viz: lightViz,
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
        action: { disabledBackground: "#2A3340" },
        surface: darkSurface,
        border: darkBorder,
        feedback: darkFeedback,
        viz: darkViz,
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
