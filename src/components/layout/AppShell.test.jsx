import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import theme from "../../theme/theme";
import AppShell from "./AppShell";
import useStore from "../../store";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

vi.mock("../nav/LanguageButton", () => ({ default: () => <div data-testid="lang" /> }));
vi.mock("../nav/MinimizeButton", () => ({ default: () => <div data-testid="minimize" /> }));
vi.mock("../nav/ReloadButton", () => ({ default: () => <div data-testid="reload" /> }));
vi.mock("../nav/ShutdownButton", () => ({ default: () => <div data-testid="shutdown" /> }));
vi.mock("../input/DataInput", () => ({ default: () => <div data-testid="data-input" /> }));
vi.mock("../input/AdaptationMeasuresInput", () => ({
  default: () => <div data-testid="adaptation-input" />,
}));
vi.mock("../inputMacro/MacroEconomicInput", () => ({
  default: () => <div data-testid="macro-input" />,
}));
vi.mock("../main/MainView", () => ({ default: () => <div data-testid="main-view" /> }));
vi.mock("../results/ResultsView", () => ({ default: () => <div data-testid="results-view" /> }));
vi.mock("../reports/ReportsView", () => ({ default: () => <div data-testid="reports-view" /> }));
vi.mock("../workspace/WorkspaceView", () => ({
  default: () => <div data-testid="workspace-view" />,
}));

function renderShell() {
  return render(
    <ThemeProvider theme={theme}>
      <AppShell />
    </ThemeProvider>
  );
}

describe("AppShell", () => {
  it("renders without crashing and shows sidebar nav items", () => {
    renderShell();
    const nav = screen.getByRole("navigation");
    expect(nav).toBeInTheDocument();
    for (const key of [
      "sidebar_home",
      "sidebar_risk_assessment",
      "sidebar_macroeconomic",
      "sidebar_workspace",
      "sidebar_settings",
    ]) {
      expect(screen.getAllByText(key).length).toBeGreaterThan(0);
    }
  });

  it("switches active section when a nav item is clicked", () => {
    renderShell();
    const macroItems = screen.getAllByLabelText("sidebar_macroeconomic");
    fireEvent.click(macroItems[0]);
    expect(useStore.getState().activeSection).toBe("macro");
  });

  it("toggles sidebar collapsed state and persists to localStorage", () => {
    useStore.setState({ sidebarCollapsed: false });
    renderShell();
    const toggle = screen.getByLabelText("sidebar_toggle");
    fireEvent.click(toggle);
    expect(useStore.getState().sidebarCollapsed).toBe(true);
    expect(localStorage.getItem("riskwise.sidebarCollapsed")).toBe("true");
  });
});
