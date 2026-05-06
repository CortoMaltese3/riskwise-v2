import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";

import useColorSchemeAttribute, { resolveScheme } from "./useColorSchemeAttribute";

const ATTR = "data-mui-color-scheme";

function makeMatchMedia(initialMatches) {
  const listeners = new Set();
  const mql = {
    matches: initialMatches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_event, listener) => listeners.add(listener),
    removeEventListener: (_event, listener) => listeners.delete(listener),
    dispatch(matches) {
      this.matches = matches;
      for (const listener of listeners) listener({ matches });
    },
  };
  globalThis.matchMedia = vi.fn(() => mql);
  return mql;
}

function Probe({ themeMode, forceScheme = null }) {
  useColorSchemeAttribute(themeMode, forceScheme);
  return null;
}

describe("resolveScheme", () => {
  beforeEach(() => {
    globalThis.matchMedia = undefined;
    document.documentElement.removeAttribute(ATTR);
  });

  it("returns the explicit mode when light or dark", () => {
    expect(resolveScheme("light")).toBe("light");
    expect(resolveScheme("dark")).toBe("dark");
  });

  it("falls back to light when matchMedia is unavailable", () => {
    expect(resolveScheme("system")).toBe("light");
  });

  it("returns the OS preference when mode is system", () => {
    makeMatchMedia(true);
    expect(resolveScheme("system")).toBe("dark");
    makeMatchMedia(false);
    expect(resolveScheme("system")).toBe("light");
  });
});

describe("useColorSchemeAttribute", () => {
  beforeEach(() => {
    globalThis.matchMedia = undefined;
    document.documentElement.removeAttribute(ATTR);
  });

  it("sets the data attribute to the explicit mode", () => {
    render(<Probe themeMode="dark" />);
    expect(document.documentElement.getAttribute(ATTR)).toBe("dark");
  });

  it("follows the OS preference when mode is system", () => {
    makeMatchMedia(true);
    render(<Probe themeMode="system" />);
    expect(document.documentElement.getAttribute(ATTR)).toBe("dark");
  });

  it("re-resolves live when the OS preference changes in system mode", () => {
    const mql = makeMatchMedia(false);
    render(<Probe themeMode="system" />);
    expect(document.documentElement.getAttribute(ATTR)).toBe("light");
    act(() => mql.dispatch(true));
    expect(document.documentElement.getAttribute(ATTR)).toBe("dark");
  });

  it("forceScheme wins over stored mode and OS preference", () => {
    makeMatchMedia(true); // OS prefers dark
    render(<Probe themeMode="dark" forceScheme="light" />);
    expect(document.documentElement.getAttribute(ATTR)).toBe("light");
  });

  it("rerenders update the data attribute when themeMode flips", () => {
    const { rerender } = render(<Probe themeMode="light" />);
    expect(document.documentElement.getAttribute(ATTR)).toBe("light");
    rerender(<Probe themeMode="dark" />);
    expect(document.documentElement.getAttribute(ATTR)).toBe("dark");
  });
});
