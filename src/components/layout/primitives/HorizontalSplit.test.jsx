import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import HorizontalSplit from "./HorizontalSplit";

describe("HorizontalSplit", () => {
  it("renders children inside a locked flex row by default", () => {
    render(
      <HorizontalSplit>
        <div data-testid="left">L</div>
        <div data-testid="right">R</div>
      </HorizontalSplit>
    );
    expect(screen.getByTestId("left")).toBeInTheDocument();
    expect(screen.getByTestId("right")).toBeInTheDocument();
    const root = document.querySelector('[data-primitive="horizontal-split"]');
    expect(root.getAttribute("data-mode")).toBe("locked");
  });

  it("propagates minHeight: 0 on the row in locked mode", () => {
    render(<HorizontalSplit>x</HorizontalSplit>);
    const root = document.querySelector('[data-primitive="horizontal-split"]');
    expect(root.style.minHeight).toBe("0px");
  });

  it("opts out of viewport-locking when print=true", () => {
    render(<HorizontalSplit print>x</HorizontalSplit>);
    const root = document.querySelector('[data-primitive="horizontal-split"]');
    expect(root.getAttribute("data-mode")).toBe("print");
    expect(root.style.minHeight).toBe("");
  });

  it("forwards className", () => {
    render(<HorizontalSplit className="custom">x</HorizontalSplit>);
    const root = document.querySelector('[data-primitive="horizontal-split"]');
    expect(root.className).toContain("custom");
  });
});
