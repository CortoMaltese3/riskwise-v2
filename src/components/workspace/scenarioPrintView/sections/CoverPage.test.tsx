import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../../../assets/giz_logo.png", () => ({ default: "giz-logo-stub" }));
vi.mock("../../../../assets/unu_ehs_logo.png", () => ({ default: "unu-logo-stub" }));

import { CoverPage } from "./CoverPage";
import type { ScenarioMeta } from "../hooks/useScenarioMeta";

const meta: ScenarioMeta = {
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
  created_at: null,
};

describe("CoverPage", () => {
  it("renders the cover with scenario meta and run code", () => {
    render(<CoverPage meta={meta} horizon="2020 – 2080" />);
    expect(screen.getByTestId("print-cover")).toBeInTheDocument();
    const runCode = screen.getByTestId("print-cover-run-code");
    expect(runCode.textContent).toContain("scn-1");
  });

  it("locks the logos block to dir=ltr so brand order survives RTL documents (#464)", () => {
    render(<CoverPage meta={meta} horizon="2020 – 2080" />);
    const logos = screen.getByTestId("print-cover-logos");
    expect(logos.getAttribute("dir")).toBe("ltr");
  });

  it("omits the run-code row when meta.id is empty", () => {
    render(<CoverPage meta={{ ...meta, id: "" }} horizon="—" />);
    expect(screen.queryByTestId("print-cover-run-code")).toBeNull();
  });
});
