import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    minimize: vi.fn(),
    shutdown: vi.fn(),
    reload: vi.fn(),
  },
}));

vi.mock("../components/nav/LanguageButton", () => ({
  default: () => <div data-testid="mock-language" />,
}));
vi.mock("../components/nav/MinimizeButton", () => ({
  default: () => <div data-testid="mock-minimize" />,
}));
vi.mock("../components/nav/ReloadButton", () => ({
  default: () => <div data-testid="mock-reload" />,
}));
vi.mock("../components/nav/ShutdownButton", () => ({
  default: () => <div data-testid="mock-shutdown" />,
}));
vi.mock("../components/nav/ThemeModeButton", () => ({
  default: () => <div data-testid="mock-theme" />,
}));
vi.mock("../assets/giz_logo.png", () => ({ default: "" }));

let TopBar;
let useUIStore;
let useResultsStore;
let useWorkspaceStore;

beforeAll(async () => {
  ({ default: TopBar } = await import("../components/layout/TopBar"));
  ({ default: useUIStore } = await import("../store/useUIStore"));
  ({ default: useResultsStore } = await import("../store/useResultsStore"));
  ({ default: useWorkspaceStore } = await import("../store/useWorkspaceStore"));
}, 60000);

const seedAll = (opts = {}) => {
  useWorkspaceStore.setState({
    selectedAppOption: opts.selectedAppOption ?? "era",
    selectedExposureFile: "seed.xlsx",
    selectedHazardFile: "seed.h5",
    selectedTimeHorizon: [2030, 2080],
    selectedAnnualGrowth: 4.2,
    isValidExposure: true,
    isValidHazard: true,
  });
  useResultsStore.setState({ isScenarioRunCompleted: true });
  useUIStore.setState({ mapTitle: "seeded" });
};

beforeEach(() => {
  seedAll();
});

afterEach(() => {
  cleanup();
});

describe("TopBar mode toggle + confirm dialog", () => {
  it("does not open the dialog on first render", () => {
    render(<TopBar />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the dialog when the user toggles to a different mode", () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "mode_explore" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("mode_switch_confirm_title")).toBeInTheDocument();
    expect(screen.getByText("navigate_verification_subtitle")).toBeInTheDocument();
    expect(useWorkspaceStore.getState().selectedAppOption).toBe("era");
    expect(useWorkspaceStore.getState().selectedExposureFile).toBe("seed.xlsx");
  });

  it("confirming the switch atomically resets the mode-bound fields", () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "mode_explore" }));
    fireEvent.click(screen.getByRole("button", { name: "navigate_verification_button" }));

    const ws = useWorkspaceStore.getState();
    expect(ws.selectedAppOption).toBe("explore");
    expect(ws.selectedExposureFile).toBe("");
    expect(ws.selectedHazardFile).toBe("");
    expect(ws.selectedTimeHorizon).toEqual([2024, 2050]);
    expect(ws.selectedAnnualGrowth).toBe(0);
    expect(ws.isValidExposure).toBe(false);
    expect(ws.isValidHazard).toBe(false);
    expect(useResultsStore.getState().isScenarioRunCompleted).toBe(false);
    expect(useUIStore.getState().mapTitle).toBe("");
  });

  it("cancelling leaves mode and inputs untouched", () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "mode_explore" }));
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));

    const ws = useWorkspaceStore.getState();
    expect(ws.selectedAppOption).toBe("era");
    expect(ws.selectedExposureFile).toBe("seed.xlsx");
    expect(ws.selectedHazardFile).toBe("seed.h5");
    expect(ws.selectedTimeHorizon).toEqual([2030, 2080]);
    expect(ws.selectedAnnualGrowth).toBe(4.2);
    expect(ws.isValidExposure).toBe(true);
    expect(ws.isValidHazard).toBe(true);
    expect(useResultsStore.getState().isScenarioRunCompleted).toBe(true);
    expect(useUIStore.getState().mapTitle).toBe("seeded");
  });

  it("uses the explore→era copy when switching from Custom to ERA", () => {
    seedAll({ selectedAppOption: "explore" });
    render(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "mode_era" }));
    expect(screen.getByText("mode_switch_confirm_to_era")).toBeInTheDocument();
  });
});
