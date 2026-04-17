import { describe, it, expect, vi, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import axe from "axe-core";

vi.mock("../store", () => ({
  default: vi.fn(() => ({
    selectedAppOption: "",
    setSelectedAppOption: vi.fn(),
  })),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("../APIService", () => ({ default: {} }));

async function runAxe(container) {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
  });
  return results.violations;
}

describe("Accessibility baseline — NavigateAlert (launch screen)", () => {
  let NavigateAlert;

  beforeAll(async () => {
    ({ default: NavigateAlert } = await import("../components/alerts/NavigateAlert"));
  });

  it("records the WCAG 2.1 AA violation baseline", async () => {
    const { container } = render(<NavigateAlert />);
    const violations = await runAxe(container);

    const summary = violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length,
    }));

    // Baseline snapshot — update when violations are intentionally fixed.
    // Do not suppress individual rules without a linked issue.
    console.table(summary);

    // Guard: ensure the scan itself ran (even with zero violations)
    expect(Array.isArray(violations)).toBe(true);

    // Critical violations must be zero. Serious violations are tracked here as a
    // known baseline; reduce this number as they are fixed (never increase it).
    const critical = violations.filter((v) => v.impact === "critical");
    const serious = violations.filter((v) => v.impact === "serious");

    expect(critical).toHaveLength(0);
    // Baseline: 0 serious violations on launch screen (update if proven otherwise)
    expect(serious.length).toBeLessThanOrEqual(0);
  });
});
