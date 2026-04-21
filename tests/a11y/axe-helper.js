import axe from "axe-core";

// Run axe with the WCAG 2.1 A and AA tag set against the given container.
// jsdom cannot evaluate colour contrast (`color-contrast`); that rule is
// disabled here so contrast violations do not silently slip in. Contrast
// is covered by the manual scan documented in
// `docs/accessibility-baseline.md` and tracked for full Playwright/Chromium
// audits in a follow-up.
export async function runAxe(container) {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return results.violations;
}

export function formatViolations(violations) {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"}) — ${v.help}`
    )
    .join("\n");
}
