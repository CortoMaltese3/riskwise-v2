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
let useStore;

beforeAll(async () => {
  ({ default: TopBar } = await import("../components/layout/TopBar"));
  ({ default: useStore } = await import("../store"));
}, 60000);

const SEED = {
  selectedAppOption: "era",
  selectedExposureFile: "seed.xlsx",
  selectedHazardFile: "seed.h5",
  selectedTimeHorizon: [2030, 2080],
  selectedAnnualGrowth: 4.2,
  isValidExposure: true,
  isValidHazard: true,
  isScenarioRunCompleted: true,
  mapTitle: "seeded",
};

beforeEach(() => {
  useStore.setState({ ...SEED });
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
    // era → explore reuses the legacy navigate_verification_subtitle copy.
    expect(screen.getByText("navigate_verification_subtitle")).toBeInTheDocument();
    // Mode has not changed yet — only the dialog is open.
    expect(useStore.getState().selectedAppOption).toBe("era");
    expect(useStore.getState().selectedExposureFile).toBe("seed.xlsx");
  });

  it("confirming the switch atomically resets the mode-bound fields", () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "mode_explore" }));
    fireEvent.click(screen.getByRole("button", { name: "navigate_verification_button" }));

    const state = useStore.getState();
    expect(state.selectedAppOption).toBe("explore");
    expect(state.selectedExposureFile).toBe("");
    expect(state.selectedHazardFile).toBe("");
    expect(state.selectedTimeHorizon).toEqual([2024, 2050]);
    expect(state.selectedAnnualGrowth).toBe(0);
    expect(state.isValidExposure).toBe(false);
    expect(state.isValidHazard).toBe(false);
    expect(state.isScenarioRunCompleted).toBe(false);
    expect(state.mapTitle).toBe("");
  });

  it("cancelling leaves mode and inputs untouched", () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "mode_explore" }));
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));

    const state = useStore.getState();
    expect(state.selectedAppOption).toBe("era");
    expect(state.selectedExposureFile).toBe("seed.xlsx");
    expect(state.selectedHazardFile).toBe("seed.h5");
    expect(state.selectedTimeHorizon).toEqual([2030, 2080]);
    expect(state.selectedAnnualGrowth).toBe(4.2);
    expect(state.isValidExposure).toBe(true);
    expect(state.isValidHazard).toBe(true);
    expect(state.isScenarioRunCompleted).toBe(true);
    expect(state.mapTitle).toBe("seeded");
  });

  it("uses the explore→era copy when switching from Custom to ERA", () => {
    useStore.setState({ selectedAppOption: "explore" });
    render(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "mode_era" }));
    expect(screen.getByText("mode_switch_confirm_to_era")).toBeInTheDocument();
  });
});
