import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import "../i18nConfig";
import ContextualTooltip from "../components/help/ContextualTooltip";
import ChartInfoPopover from "../components/help/ChartInfoPopover";

describe("ContextualTooltip", () => {
  it("exposes an accessible label from the i18n key", () => {
    render(<ContextualTooltip titleKey="input_tooltip_country" />);
    expect(screen.getByRole("button", { name: /country/i })).toBeInTheDocument();
  });
});

describe("ChartInfoPopover", () => {
  it("opens a popover with the title/body when clicked", () => {
    render(
      <ChartInfoPopover titleKey="chart_info_waterfall_title" bodyKey="chart_info_waterfall_body" />
    );
    const button = screen.getByRole("button", { name: /risk decomposition/i });
    fireEvent.click(button);
    expect(screen.getAllByText(/Risk decomposition/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/waterfall chart decomposes/i)).toBeInTheDocument();
  });
});
