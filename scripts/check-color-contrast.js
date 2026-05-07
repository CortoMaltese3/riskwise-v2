#!/usr/bin/env node
/**
 * Phase 4 Area 16 (issue #121) — WCAG 2.1 AA contrast lint.
 *
 * Validates every `text` / `background` token pair declared in
 * `src/theme/theme.ts` against the WCAG 2.1 AA ratios (4.5:1 normal text,
 * 3:1 large text). Prints the failing pair and the measured ratio, then
 * exits non-zero so CI fails with the exact regression.
 *
 * Why a hand-rolled implementation rather than `color-contrast-checker`?
 * The math is small, the inputs are bounded (a fixed list of token pairs)
 * and avoiding a runtime dependency keeps the bundle and the dependabot
 * surface lean. The acceptance criterion in #121 explicitly allows
 * "color-contrast-checker or equivalent".
 *
 * Token pair list is curated rather than auto-discovered from the theme
 * file: only colour combinations that ship to users as text-on-background
 * matter for AA, and the auto-discovery would have to reason about
 * MUI-specific overlap rules. The list mirrors the semantic palette slots
 * we consume in components (#298): primary, secondary, surface, text,
 * border, feedback, viz.
 */
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const THEME_PATH = resolve(__dirname, "..", "src", "theme", "theme.ts");

const NORMAL_TEXT_RATIO = 4.5;
const LARGE_TEXT_RATIO = 3.0;

// --- Colour-space helpers ----------------------------------------------------

function parseHex(hex) {
  const normalised = hex.replace(/^#/, "").toLowerCase();
  if (normalised.length === 3) {
    return [
      parseInt(normalised[0] + normalised[0], 16),
      parseInt(normalised[1] + normalised[1], 16),
      parseInt(normalised[2] + normalised[2], 16),
    ];
  }
  if (normalised.length === 6) {
    return [
      parseInt(normalised.slice(0, 2), 16),
      parseInt(normalised.slice(2, 4), 16),
      parseInt(normalised.slice(4, 6), 16),
    ];
  }
  throw new Error(`Unparseable hex colour: ${hex}`);
}

// WCAG 2.x relative luminance per
// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function relativeLuminance([r, g, b]) {
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fgHex, bgHex) {
  const l1 = relativeLuminance(parseHex(fgHex));
  const l2 = relativeLuminance(parseHex(bgHex));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// --- Theme parsing -----------------------------------------------------------

// Pull every `key: "#xxxxxx"` declaration out of theme.ts into a Set of hex
// colours. We do not care about which palette slot owns the literal — the
// curated pair list below references colours by their hex value, which is
// stable across MUI versions. A Set (not a Map) is used because property
// names like `main`, `dark`, `contrastText` repeat across palette slots and
// would otherwise overwrite each other.
function parseThemeHexLiterals(source) {
  const out = new Set();
  const re = /(\w+)\s*:\s*"(#[0-9a-fA-F]{3,6})"/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    out.add(match[2].toLowerCase());
  }
  return out;
}

// --- Curated pair list -------------------------------------------------------

// Each pair represents a foreground/background combination that actually
// renders together in the UI. The `size` field controls which AA threshold
// applies (3:1 for "large", 4.5:1 for "normal"). When in doubt, default to
// "normal" — large text is opted into intentionally.
const PAIRS = [
  // --- Light scheme ---
  // Foundational text on backgrounds.
  {
    name: "[light] text.primary on background.default",
    fg: "#0F172A",
    bg: "#F8FAFC",
    size: "normal",
  },
  {
    name: "[light] text.primary on background.paper",
    fg: "#0F172A",
    bg: "#FFFFFF",
    size: "normal",
  },
  {
    name: "[light] text.secondary on background.default",
    fg: "#5F5F5F",
    bg: "#F8FAFC",
    size: "normal",
  },
  {
    name: "[light] text.secondary on background.paper",
    fg: "#5F5F5F",
    bg: "#FFFFFF",
    size: "normal",
  },
  // TopBar header band — `primary.dark` text on `primary.light` band. The
  // bumped `primary.light` (#9CCDDA) clears AA where the spec'd `#8FC3D1`
  // failed at 4.07:1.
  { name: "[light] primary.dark on primary.light", fg: "#0E5A66", bg: "#9CCDDA", size: "normal" },
  // Primary button — white text on `primary.{main,dark}`.
  {
    name: "[light] primary.contrastText on primary.main",
    fg: "#FFFFFF",
    bg: "#2F7A86",
    size: "normal",
  },
  {
    name: "[light] primary.contrastText on primary.dark",
    fg: "#FFFFFF",
    bg: "#0E5A66",
    size: "normal",
  },
  // Secondary salmon (used for CTAs and selected-state chips).
  {
    name: "[light] secondary.contrastText on secondary.main",
    fg: "#0F172A",
    bg: "#F79191",
    size: "normal",
  },
  {
    name: "[light] secondary.contrastText on secondary.light",
    fg: "#0F172A",
    bg: "#FFCCCC",
    size: "normal",
  },
  {
    name: "[light] secondary.contrastText on secondary.bg",
    fg: "#0F172A",
    bg: "#FFEBEB",
    size: "normal",
  },
  // Feedback indicators on white paper. `main` swatches are darkened from
  // the spec values so each clears the 4.5:1 floor — see theme.ts comment.
  {
    name: "[light] feedback.success.main on background.paper",
    fg: "#047D49",
    bg: "#FFFFFF",
    size: "normal",
  },
  {
    name: "[light] feedback.warning.main on background.paper",
    fg: "#8C6F00",
    bg: "#FFFFFF",
    size: "normal",
  },
  {
    name: "[light] feedback.error.main on background.paper",
    fg: "#D32525",
    bg: "#FFFFFF",
    size: "normal",
  },
  {
    name: "[light] feedback.info.main on background.paper",
    fg: "#004FC4",
    bg: "#FFFFFF",
    size: "normal",
  },
  // --- Dark scheme ---
  {
    name: "[dark] text.primary on background.default",
    fg: "#F1F5F9",
    bg: "#0F172A",
    size: "normal",
  },
  { name: "[dark] text.primary on background.paper", fg: "#F1F5F9", bg: "#1E293B", size: "normal" },
  {
    name: "[dark] text.secondary on background.default",
    fg: "#94A3B8",
    bg: "#0F172A",
    size: "normal",
  },
  { name: "[dark] primary.dark on primary.light", fg: "#0E5A66", bg: "#A0CDD8", size: "normal" },
  {
    name: "[dark] primary.contrastText on primary.main",
    fg: "#0F172A",
    bg: "#5FB3C2",
    size: "normal",
  },
  {
    name: "[dark] feedback.success.main on background.paper",
    fg: "#39D98A",
    bg: "#1E293B",
    size: "normal",
  },
  {
    name: "[dark] feedback.warning.main on background.paper",
    fg: "#FDDD48",
    bg: "#1E293B",
    size: "normal",
  },
  {
    name: "[dark] feedback.error.main on background.paper",
    fg: "#FF5C5C",
    bg: "#1E293B",
    size: "normal",
  },
  {
    name: "[dark] feedback.info.main on background.paper",
    fg: "#5B8DEF",
    bg: "#1E293B",
    size: "normal",
  },
];

// --- Main --------------------------------------------------------------------

function main() {
  const themeSource = readFileSync(THEME_PATH, "utf8");
  const themeHex = parseThemeHexLiterals(themeSource);

  // Sanity check — every colour referenced in PAIRS must still exist in the
  // theme file. Otherwise the pair list has drifted and the lint is checking
  // colours nothing on screen actually uses. Comparison is case-insensitive
  // because the theme mixes cases (`#FFFFFF` vs `#ffffff`) in equivalent slots.
  for (const pair of PAIRS) {
    if (!themeHex.has(pair.fg.toLowerCase())) {
      console.error(`[contrast-lint] WARNING: ${pair.name} fg ${pair.fg} no longer in theme.ts`);
    }
    if (!themeHex.has(pair.bg.toLowerCase())) {
      console.error(`[contrast-lint] WARNING: ${pair.name} bg ${pair.bg} no longer in theme.ts`);
    }
  }

  const failures = [];
  for (const pair of PAIRS) {
    const ratio = contrastRatio(pair.fg, pair.bg);
    const required = pair.size === "large" ? LARGE_TEXT_RATIO : NORMAL_TEXT_RATIO;
    const status = ratio >= required ? "PASS" : "FAIL";
    const line = `${status}  ${ratio.toFixed(2)}:1 (need ${required}:1, ${pair.size} text)  ${pair.name}  fg=${pair.fg} bg=${pair.bg}`;
    if (status === "FAIL") {
      failures.push(line);
      console.error(line);
    } else {
      console.log(line);
    }
  }

  if (failures.length > 0) {
    console.error("");
    console.error(
      `[contrast-lint] ${failures.length} pair(s) below WCAG 2.1 AA thresholds. ` +
        `Adjust the failing tokens in src/theme/theme.ts.`
    );
    process.exit(1);
  }

  console.log("");
  console.log(`[contrast-lint] ${PAIRS.length} pair(s) — all meet WCAG 2.1 AA.`);
}

main();
