import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

import ChartDataTable from "../components/charts/ChartDataTable";

const HEADERS = ["Category", "Value"];
const ROWS = [
  ["Risk 2024", "100"],
  ["Climate change", "50"],
  ["Risk 2050", "175"],
];

describe("ChartDataTable", () => {
  it("renders headers and rows inside a semantic table", () => {
    render(<ChartDataTable headers={HEADERS} rows={ROWS} caption="Waterfall" />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    HEADERS.forEach((h) =>
      expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument()
    );
    ROWS.forEach((r) =>
      expect(screen.getByRole("row", { name: new RegExp(r[0]) })).toBeInTheDocument()
    );
  });

  it("keeps the table in the DOM even when <details> is collapsed", () => {
    const { container } = render(<ChartDataTable headers={HEADERS} rows={ROWS} />);
    const details = container.querySelector("details");
    expect(details?.open).toBeFalsy();
    expect(container.querySelector("table")).toBeInTheDocument();
  });

  it("returns nothing when rows are empty", () => {
    const { container } = render(<ChartDataTable headers={HEADERS} rows={[]} />);
    expect(container.querySelector("table")).toBeNull();
  });

  it("has no critical or serious axe violations", async () => {
    const { container } = render(
      <ChartDataTable headers={HEADERS} rows={ROWS} caption="Waterfall" />
    );
    const results = await axe.run(container, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
    const critical = results.violations.filter((v) => v.impact === "critical");
    const serious = results.violations.filter((v) => v.impact === "serious");
    expect(critical).toHaveLength(0);
    expect(serious).toHaveLength(0);
  });
});
