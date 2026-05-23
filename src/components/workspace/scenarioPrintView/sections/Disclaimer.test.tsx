import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { Disclaimer } from "./Disclaimer";

describe("Disclaimer", () => {
  it("renders each paragraph in the disclaimer body", () => {
    render(<Disclaimer paragraphs={["First paragraph", "Second paragraph"]} />);

    const body = screen.getByTestId("print-disclaimer-body");
    expect(body.textContent).toContain("First paragraph");
    expect(body.textContent).toContain("Second paragraph");
  });
});
