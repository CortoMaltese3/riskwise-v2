import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import ThemeModeButton from "./ThemeModeButton";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

// Minimal CSS-vars theme so MUI's CssVarsProvider (the implementation behind
// <ThemeProvider> when colorSchemes are present) wires up `useColorScheme`.
const TEST_STORAGE_KEY = "riskwise.themeMode.test";
const testTheme = createTheme({
  cssVariables: { colorSchemeSelector: "data-mui-color-scheme" },
  colorSchemes: { light: true, dark: true },
});

const renderInProvider = (defaultMode = "system") =>
  render(
    <ThemeProvider theme={testTheme} defaultMode={defaultMode} modeStorageKey={TEST_STORAGE_KEY}>
      <ThemeModeButton />
    </ThemeProvider>
  );

describe("ThemeModeButton", () => {
  beforeEach(() => {
    globalThis.localStorage?.removeItem(TEST_STORAGE_KEY);
  });

  it("opens a menu with light, dark, and system options", () => {
    renderInProvider();
    fireEvent.click(screen.getByLabelText("theme_mode_selector_aria"));
    expect(screen.getByRole("menuitem", { name: "theme_mode_light" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "theme_mode_dark" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "theme_mode_system" })).toBeInTheDocument();
  });

  it("selecting an option persists to MUI's mode storage and closes the menu", () => {
    renderInProvider();
    fireEvent.click(screen.getByLabelText("theme_mode_selector_aria"));
    fireEvent.click(screen.getByRole("menuitem", { name: "theme_mode_dark" }));
    expect(globalThis.localStorage?.getItem(TEST_STORAGE_KEY)).toBe("dark");
  });

  it("marks the active mode with the selected class (MUI MenuItem convention)", () => {
    globalThis.localStorage?.setItem(TEST_STORAGE_KEY, "light");
    renderInProvider("light");
    fireEvent.click(screen.getByLabelText("theme_mode_selector_aria"));
    const lightItem = screen.getByRole("menuitem", { name: "theme_mode_light" });
    const darkItem = screen.getByRole("menuitem", { name: "theme_mode_dark" });
    expect(lightItem.className).toMatch(/Mui-selected/);
    expect(darkItem.className).not.toMatch(/Mui-selected/);
  });
});
