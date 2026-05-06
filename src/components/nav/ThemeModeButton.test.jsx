import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import ThemeModeButton from "./ThemeModeButton";
import useStore from "../../store";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

describe("ThemeModeButton", () => {
  beforeEach(() => {
    useStore.setState({ themeMode: "system" });
  });

  it("opens a menu with light, dark, and system options", () => {
    render(<ThemeModeButton />);
    fireEvent.click(screen.getByLabelText("theme_mode_selector_aria"));
    expect(screen.getByRole("menuitem", { name: "theme_mode_light" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "theme_mode_dark" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "theme_mode_system" })).toBeInTheDocument();
  });

  it("selecting an option updates the store and closes the menu", () => {
    render(<ThemeModeButton />);
    fireEvent.click(screen.getByLabelText("theme_mode_selector_aria"));
    fireEvent.click(screen.getByRole("menuitem", { name: "theme_mode_dark" }));
    expect(useStore.getState().themeMode).toBe("dark");
  });

  it("marks the active mode with the selected class (MUI MenuItem convention)", () => {
    useStore.setState({ themeMode: "light" });
    render(<ThemeModeButton />);
    fireEvent.click(screen.getByLabelText("theme_mode_selector_aria"));
    const lightItem = screen.getByRole("menuitem", { name: "theme_mode_light" });
    const darkItem = screen.getByRole("menuitem", { name: "theme_mode_dark" });
    expect(lightItem.className).toMatch(/Mui-selected/);
    expect(darkItem.className).not.toMatch(/Mui-selected/);
  });
});
