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

  it("default (non-resizable) width does not set resize or width bounds", () => {
    render(<FixedColumn width={280}>x</FixedColumn>);
    const root = document.querySelector('[data-primitive="fixed-column"]');
    expect(root.getAttribute("data-mode")).toBe("locked");
    expect(root.style.resize).toBe("");
    expect(root.style.minWidth).toBe("");
    expect(root.style.maxWidth).toBe("");
    expect(root.style.overflow).toBe("");
  });

  it("resizable mode applies horizontal resize and propagates min/max width bounds", () => {
    render(
      <FixedColumn width={280} resizable minWidth={220} maxWidth={520}>
        x
      </FixedColumn>
    );
    const root = document.querySelector('[data-primitive="fixed-column"]');
    expect(root.getAttribute("data-mode")).toBe("resizable");
    expect(root.style.width).toBe("280px");
    expect(root.style.minWidth).toBe("220px");
    expect(root.style.maxWidth).toBe("520px");
    expect(root.style.resize).toBe("horizontal");
  });

  it("resizable mode contains overflow inside the column and does not affect the document", () => {
    // CSS `resize` requires overflow != visible. We use `auto` so the column
    // itself handles any internal overflow, never falling through to the
    // page. The body stays untouched, so dragging the handle cannot
    // introduce a page-level scrollbar.
    render(
      <FixedColumn width={280} resizable minWidth={220} maxWidth={520}>
        x
      </FixedColumn>
    );
    const root = document.querySelector('[data-primitive="fixed-column"]');
    expect(root.style.overflow).toBe("auto");
    expect(root.style.maxWidth).toBe("520px");
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("resizable mode accepts string width bounds", () => {
    render(
      <FixedColumn width="30%" resizable minWidth="20%" maxWidth="50%">
        x
      </FixedColumn>
    );
    const root = document.querySelector('[data-primitive="fixed-column"]');
    expect(root.style.width).toBe("30%");
    expect(root.style.minWidth).toBe("20%");
    expect(root.style.maxWidth).toBe("50%");
  });
});
