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

vi.mock("../lib/RiskWiseClient", () => ({ default: {} }));

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

    // Log violation table so the baseline is visible in CI output.
    // Update when violations are intentionally fixed; never suppress without a linked issue.
    console.table(violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })));

    const critical = violations.filter((v) => v.impact === "critical");
    const serious = violations.filter((v) => v.impact === "serious");

    expect(critical).toHaveLength(0);
    expect(serious).toHaveLength(0);
  });
});
