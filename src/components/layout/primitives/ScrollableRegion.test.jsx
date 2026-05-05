import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import ScrollableRegion from "./ScrollableRegion";
import AppViewport from "./AppViewport";

describe("ScrollableRegion", () => {
  it("renders children inside a locked scroll region by default", () => {
    render(
      <ScrollableRegion>
        <div data-testid="content">scroll me</div>
      </ScrollableRegion>
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
    const root = document.querySelector('[data-primitive="scrollable-region"]');
    expect(root.getAttribute("data-mode")).toBe("locked");
    expect(root.getAttribute("data-axis")).toBe("y");
  });

  it("propagates minHeight: 0 in locked mode", () => {
    render(<ScrollableRegion>x</ScrollableRegion>);
    const root = document.querySelector('[data-primitive="scrollable-region"]');
    expect(root.style.minHeight).toBe("0px");
  });

  it("accepts an axis prop and exposes it for assertion", () => {
    render(<ScrollableRegion axis="both">x</ScrollableRegion>);
    const root = document.querySelector('[data-primitive="scrollable-region"]');
    expect(root.getAttribute("data-axis")).toBe("both");
  });

  it("does not introduce a page-level scrollbar when nested inside AppViewport", () => {
    // The page-scrollbar guarantee comes from AppViewport's overflow:hidden
    // root. ScrollableRegion is the only primitive that adds an internal
    // scrollbar — verify AppViewport still clamps the viewport when the region
    // is nested inside it.
    render(
      <AppViewport>
        <ScrollableRegion>nested</ScrollableRegion>
      </AppViewport>
    );
    const viewport = document.querySelector('[data-primitive="app-viewport"]');
    expect(viewport.style.overflow).toBe("hidden");
    expect(viewport.style.height).toBe("100vh");
  });

  it("opts out of viewport-locking when print=true", () => {
    render(<ScrollableRegion print>x</ScrollableRegion>);
    const root = document.querySelector('[data-primitive="scrollable-region"]');
    expect(root.getAttribute("data-mode")).toBe("print");
    expect(root.style.minHeight).toBe("");
  });

  it("forwards className", () => {
    render(<ScrollableRegion className="custom">x</ScrollableRegion>);
    const root = document.querySelector('[data-primitive="scrollable-region"]');
    expect(root.className).toContain("custom");
  });
});
