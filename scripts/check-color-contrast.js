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
 * MUI-specific overlap rules. The list mirrors the MUI palette slots we
 * actually consume in components (header, accent, tab, mapControl,
 * tableHeader) plus the foundational primary/text/background pairs.
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
  // Foundational text on backgrounds.
  { name: "text.primary on background.default", fg: "#0F172A", bg: "#f8fafc", size: "normal" },
  { name: "text.primary on background.paper", fg: "#0F172A", bg: "#ffffff", size: "normal" },
  { name: "text.secondary on background.default", fg: "#334155", bg: "#f8fafc", size: "normal" },
  { name: "text.secondary on background.paper", fg: "#334155", bg: "#ffffff", size: "normal" },
  // Header AppBar — `header.contrastText` is dark slate so the pale teal bg
  // works for body-size labels.
  { name: "header.contrastText on header.main", fg: "#0F172A", bg: "#8fc3d1", size: "normal" },
  // Accent palette (salmon) — used for primary CTAs. Dark contrastText sits
  // on the salmon main; ensure both the main and dark fills clear AA against
  // their dark text.
  { name: "accent.contrastText on accent.main", fg: "#0F172A", bg: "#F79191", size: "normal" },
  { name: "accent.contrastText on accent.light", fg: "#0F172A", bg: "#FFCCCC", size: "normal" },
  { name: "accent.contrastText on accent.paleBg", fg: "#0F172A", bg: "#FFEBEB", size: "normal" },
  // Tab strip — dark slate labels on teal (flipped from white in #121 to
  // clear AA at 14px, which falls under the 4.5:1 normal-text threshold).
  { name: "tab.contrastText on tab.main", fg: "#0F172A", bg: "#70ADB5", size: "normal" },
  // Map controls — white icon labels on dark blue.
  {
    name: "mapControl.contrastText on mapControl.main",
    fg: "#FFFFFF",
    bg: "#2A4D69",
    size: "normal",
  },
  // Primary button — primary.dark is the active/hover fill that pairs with
  // white text. Both `main` and `dark` were darkened in #121 so white text
  // clears the 4.5:1 normal-text threshold (button labels are 14px).
  { name: "primary.contrastText on primary.dark", fg: "#ffffff", bg: "#0E5A66", size: "normal" },
  { name: "primary.contrastText on primary.main", fg: "#ffffff", bg: "#2F7A86", size: "normal" },
  // Sub-tab strip — primary.light is a tinted background. Pairs with dark
  // text in MainSubTabs (white text on this swatch is 1.87:1, not viable).
  { name: "text.primary on primary.light", fg: "#0F172A", bg: "#8AC8D0", size: "normal" },
  // Error palette — `error.main` background pairs with white text in toasts
  // and validation banners.
  { name: "error.contrastText on error.main", fg: "#ffffff", bg: "#B00020", size: "normal" },
  { name: "error.contrastText on error.dark", fg: "#ffffff", bg: "#BA000D", size: "normal" },
  // Surface muted — the "remarks" panels use mutedText on muted background.
  // mutedText darkened from #6F6F6F → #5F5F5F in #121 (was 4.49:1, now 5.70:1).
  { name: "surface.mutedText on surface.muted", fg: "#5F5F5F", bg: "#F2F2F2", size: "normal" },
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
