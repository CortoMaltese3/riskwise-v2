import axe from "axe-core";

// Run axe with the WCAG 2.1 A and AA tag set against the given container.
// jsdom cannot evaluate colour contrast (`color-contrast`); that rule is
// disabled here so contrast violations do not silently slip in. Contrast
// is covered by the manual scan documented in
// `docs/audits/accessibility-baseline-v1.md` and tracked for full Playwright/Chromium
// audits in a follow-up.
export async function runAxe(container) {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return results.violations;
}

// Format violations so CI logs name the failing rule AND the selector that
// triggered it (Phase 4 Area 16, issue #121 acceptance criterion: "CI fails
// with a clear message naming the failing rule and selector"). Each axe
// violation may apply to several DOM nodes; we surface up to three target
// selectors per violation to keep output bounded but actionable.
export function formatViolations(violations) {
  const formatNode = (node) => {
    // axe stores CSS selectors at `node.target` (an array of strings — one per
    // iframe boundary; for our jsdom tests there is only one). Joining with
    // " >>> " mirrors axe-core's own convention for reporting.
    const target = Array.isArray(node.target) ? node.target.join(" >>> ") : String(node.target);
    return `    - ${target}`;
  };
  return violations
    .map((v) => {
      const header = `[${v.impact}] ${v.id} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"}) — ${v.help}`;
      const sample = v.nodes.slice(0, 3).map(formatNode).join("\n");
      const overflow = v.nodes.length > 3 ? `\n    … and ${v.nodes.length - 3} more` : "";
      return `${header}\n${sample}${overflow}\n    help: ${v.helpUrl}`;
    })
    .join("\n");
}
