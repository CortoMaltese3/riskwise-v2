import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../../../lib/formatDate", () => ({
  formatDate: (value: unknown) => `formatted(${String(value)})`,
}));

import { ScenarioMetaTable } from "./ScenarioMetaTable";
import type { ScenarioWorkspaceItem } from "../../../../lib/RiskWiseClient";

const meta: ScenarioWorkspaceItem = {
  is_imported: false,
  modified: false,
  saved: false,
  id: "scn-1",
  name: "My Scenario",
  country: "Egypt",
  hazard_type: "flood",
  scenario: "rcp_8_5",
  ref_year: 2020,
  future_year: 2080,
  annual_growth: 1.5,
  exposure_type: "buildings",
  asset_type: "economic",
  created_at: "2026-01-15T10:00:00Z",
  app_version: "2.4.0",
  engine_version: "1.2.0",
  entity_data_sha256: "abc123def456abcdef0123456789abcdef0123456789abcdef0123456789abcd",
  hazard_data_sha256: "1111111122222222333333334444444455555555666666667777777788888888",
  country_config_sha256: "aaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999",
  random_seed: 42,
  computed_at: "2026-01-15T10:30:00Z",
};

describe("ScenarioMetaTable", () => {
  it("renders the provenance table with shortened SHA prefixes and provenance rows", () => {
    render(
      <ScenarioMetaTable
        meta={meta}
        locale="en"
        renderTableCaption={(key) => <span data-testid="caption-stub">{key}</span>}
      />
    );

    expect(screen.getByTestId("print-methodology")).toBeInTheDocument();
    const table = screen.getByTestId("print-provenance-table");
    expect(table.textContent).toContain("App Version");
    expect(table.textContent).toContain("2.4.0");
    // 8-char SHA prefix only
    expect(table.textContent).toContain("abc123de");
    expect(table.textContent).not.toContain("abc123def456");
    expect(screen.getByTestId("caption-stub").textContent).toBe("print_caption_table_provenance");
    expect(screen.getByTestId("reproducibility-note")).toBeInTheDocument();
  });
});
