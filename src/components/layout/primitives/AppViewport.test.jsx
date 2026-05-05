import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import AppViewport from "./AppViewport";

describe("AppViewport", () => {
  it("renders children inside a locked viewport shell by default", () => {
    render(
      <AppViewport>
        <div data-testid="content">hello</div>
      </AppViewport>
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
    const root = document.querySelector('[data-primitive="app-viewport"]');
    expect(root).toBeInTheDocument();
    expect(root.getAttribute("data-mode")).toBe("locked");
  });

  it("applies 100vh height and overflow:hidden in locked mode", () => {
    render(<AppViewport>x</AppViewport>);
    const root = document.querySelector('[data-primitive="app-viewport"]');
    expect(root.style.height).toBe("100vh");
    expect(root.style.overflow).toBe("hidden");
    expect(root.style.boxSizing).toBe("border-box");
  });

  it("opts out of viewport-locking when print=true", () => {
    render(<AppViewport print>print body</AppViewport>);
    const root = document.querySelector('[data-primitive="app-viewport"]');
    expect(root.getAttribute("data-mode")).toBe("print");
    expect(root.style.height).toBe("");
    expect(root.style.overflow).toBe("");
  });

  it("forwards className", () => {
    render(<AppViewport className="custom">x</AppViewport>);
    const root = document.querySelector('[data-primitive="app-viewport"]');
    expect(root.className).toContain("custom");
  });
});
