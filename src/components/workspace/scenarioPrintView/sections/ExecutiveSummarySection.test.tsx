import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ExecutiveSummarySection } from "./ExecutiveSummarySection";
import type { ExecutiveSummary } from "../utils/executiveSummary";

const summary: ExecutiveSummary = {
  presentYear: 2020,
  futureYear: 2080,
  presentValue: 100,
  futureValue: 170,
  absoluteChange: 70,
  percentChange: 70,
  topDriverLabel: "Climate Change",
  topDriverValue: 50,
  unit: "USD",
};

describe("ExecutiveSummarySection", () => {
  it("renders the summary table when a summary is supplied", () => {
    render(
      <ExecutiveSummarySection
        summary={summary}
        formatNumberLocale={(v) => String(v)}
        renderTableCaption={(key) => <span data-testid="caption-stub">{key}</span>}
      />
    );
    expect(screen.getByTestId("print-executive-summary-table")).toBeInTheDocument();
    expect(screen.getByTestId("caption-stub").textContent).toBe(
      "print_caption_table_executive_summary"
    );
  });

  it("shows the unavailable note when summary is null", () => {
    render(
      <ExecutiveSummarySection
        summary={null}
        formatNumberLocale={(v) => String(v)}
        renderTableCaption={() => null}
      />
    );
    expect(screen.getByTestId("print-summary-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("print-executive-summary-table")).toBeNull();
  });
});
