import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import FixedColumn from "./FixedColumn";

const getRoot = () => document.querySelector('[data-primitive="fixed-column"]');
const getHandle = () => document.querySelector("[data-resize-handle]");

const drag = (handle, fromX, toX) => {
  fireEvent.mouseDown(handle, { clientX: fromX });
  fireEvent.mouseMove(window, { clientX: toX });
  fireEvent.mouseUp(window, { clientX: toX });
};

describe("FixedColumn", () => {
  afterEach(() => {
    document.body.style.userSelect = "";
  });

  it("renders children with a numeric width converted to pixels", () => {
    render(
      <FixedColumn width={220}>
        <div data-testid="content">sidebar</div>
      </FixedColumn>
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(getRoot().style.width).toBe("220px");
    expect(getRoot().getAttribute("data-mode")).toBe("locked");
  });

  it("accepts a string width and passes it through unchanged", () => {
    render(<FixedColumn width="20%">x</FixedColumn>);
    expect(getRoot().style.width).toBe("20%");
  });

  it("propagates minHeight: 0 in locked mode", () => {
    render(<FixedColumn width={100}>x</FixedColumn>);
    expect(getRoot().style.minHeight).toBe("0px");
  });

  it("opts out of viewport-locking when print=true but keeps the width", () => {
    render(
      <FixedColumn width={220} print>
        x
      </FixedColumn>
    );
    expect(getRoot().getAttribute("data-mode")).toBe("print");
    expect(getRoot().style.width).toBe("220px");
    expect(getRoot().style.minHeight).toBe("");
  });

  it("forwards className", () => {
    render(
      <FixedColumn width={100} className="custom">
        x
      </FixedColumn>
    );
    expect(getRoot().className).toContain("custom");
  });

  it("default (non-resizable) mode renders no drag handle", () => {
    render(<FixedColumn width={280}>x</FixedColumn>);
    expect(getRoot().getAttribute("data-mode")).toBe("locked");
    expect(getHandle()).toBeNull();
  });

  it("resizable mode renders a right-edge handle by default", () => {
    render(
      <FixedColumn width={280} resizable minWidth={220} maxWidth={520}>
        x
      </FixedColumn>
    );
    expect(getRoot().getAttribute("data-mode")).toBe("resizable");
    expect(getRoot().style.width).toBe("280px");
    const handle = getHandle();
    expect(handle.getAttribute("data-resize-handle")).toBe("right");
    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("resizable mode renders a left-edge handle when handleSide is left", () => {
    render(
      <FixedColumn width={260} resizable handleSide="left" minWidth={220} maxWidth={520}>
        x
      </FixedColumn>
    );
    expect(getHandle().getAttribute("data-resize-handle")).toBe("left");
  });

  it("dragging a right-edge handle outward widens the column", () => {
    render(
      <FixedColumn width={280} resizable minWidth={220} maxWidth={520}>
        x
      </FixedColumn>
    );
    drag(getHandle(), 100, 160);
    expect(getRoot().style.width).toBe("340px");
  });

  it("dragging a left-edge handle leftward widens a right-hand panel", () => {
    render(
      <FixedColumn width={260} resizable handleSide="left" minWidth={220} maxWidth={520}>
        x
      </FixedColumn>
    );
    // Pointer moves left (300 -> 240); a left-edge handle grows the panel.
    drag(getHandle(), 300, 240);
    expect(getRoot().style.width).toBe("320px");
  });

  it("clamps the width to maxWidth while dragging", () => {
    render(
      <FixedColumn width={280} resizable minWidth={220} maxWidth={520}>
        x
      </FixedColumn>
    );
    drag(getHandle(), 0, 1000);
    expect(getRoot().style.width).toBe("520px");
  });

  it("clamps the width to minWidth while dragging", () => {
    render(
      <FixedColumn width={280} resizable minWidth={220} maxWidth={520}>
        x
      </FixedColumn>
    );
    drag(getHandle(), 0, -1000);
    expect(getRoot().style.width).toBe("220px");
  });

  it("supports keyboard resizing via arrow keys with bounds", () => {
    render(
      <FixedColumn width={280} resizable minWidth={220} maxWidth={520}>
        x
      </FixedColumn>
    );
    const handle = getHandle();
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(getRoot().style.width).toBe("288px");
    fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
    expect(getRoot().style.width).toBe("256px");
  });

  it("does not introduce a page-level scrollbar in resizable mode", () => {
    render(
      <FixedColumn width={280} resizable minWidth={220} maxWidth={520}>
        x
      </FixedColumn>
    );
    drag(getHandle(), 0, 1000);
    // The column is the only thing that resizes; the document is untouched and
    // the width is bounded, so dragging can never spill a page-level scrollbar.
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
    expect(getRoot().style.width).toBe("520px");
  });

  it("restores user-select after a drag completes", () => {
    render(
      <FixedColumn width={280} resizable minWidth={220} maxWidth={520}>
        x
      </FixedColumn>
    );
    const handle = getHandle();
    fireEvent.mouseDown(handle, { clientX: 0 });
    expect(document.body.style.userSelect).toBe("none");
    fireEvent.mouseUp(window, { clientX: 10 });
    expect(document.body.style.userSelect).toBe("");
  });
});
