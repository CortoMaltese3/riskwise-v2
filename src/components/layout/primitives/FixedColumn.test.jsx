import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import FixedColumn from "./FixedColumn";

describe("FixedColumn", () => {
  it("renders children with a numeric width converted to pixels", () => {
    render(
      <FixedColumn width={220}>
        <div data-testid="content">sidebar</div>
      </FixedColumn>
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
    const root = document.querySelector('[data-primitive="fixed-column"]');
    expect(root.style.width).toBe("220px");
    expect(root.getAttribute("data-mode")).toBe("locked");
  });

  it("accepts a string width and passes it through unchanged", () => {
    render(<FixedColumn width="20%">x</FixedColumn>);
    const root = document.querySelector('[data-primitive="fixed-column"]');
    expect(root.style.width).toBe("20%");
  });

  it("propagates minHeight: 0 in locked mode", () => {
    render(<FixedColumn width={100}>x</FixedColumn>);
    const root = document.querySelector('[data-primitive="fixed-column"]');
    expect(root.style.minHeight).toBe("0px");
  });

  it("opts out of viewport-locking when print=true but keeps the width", () => {
    render(
      <FixedColumn width={220} print>
        x
      </FixedColumn>
    );
    const root = document.querySelector('[data-primitive="fixed-column"]');
    expect(root.getAttribute("data-mode")).toBe("print");
    expect(root.style.width).toBe("220px");
    expect(root.style.minHeight).toBe("");
  });

  it("forwards className", () => {
    render(
      <FixedColumn width={100} className="custom">
        x
      </FixedColumn>
    );
    const root = document.querySelector('[data-primitive="fixed-column"]');
    expect(root.className).toContain("custom");
  });
});
