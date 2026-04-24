import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock react-joyride so the Walkthrough component's visibility is observable
// through a simple DOM marker. Joyride itself is well-tested upstream — here
// we only care that Walkthrough decides to render it (run=true) based on the
// ``hasSeenWalkthrough`` localStorage flag.
vi.mock("react-joyride", () => {
  const Mock = ({ run, steps }) =>
    run ? <div data-testid="joyride" data-steps={steps?.length ?? 0} /> : null;
  return {
    __esModule: true,
    default: Mock,
    Joyride: Mock,
    STATUS: { FINISHED: "finished", SKIPPED: "skipped" },
    ACTIONS: { NEXT: "next", PREV: "prev" },
    EVENTS: { STEP_AFTER: "step:after", TARGET_NOT_FOUND: "error:target_not_found" },
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("../i18nConfig", () => ({
  isRtl: () => false,
  default: {},
  applyDocumentDirection: () => {},
}));

const WALKTHROUGH_KEY = "riskwise.hasSeenWalkthrough";

let Walkthrough;

async function loadWalkthrough() {
  vi.resetModules();
  ({ default: Walkthrough } = await import("../components/onboarding/Walkthrough"));
}

describe("Walkthrough first-run gating", () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.localStorage.clear();
  });

  it("renders the joyride tour on fresh install (no hasSeenWalkthrough)", async () => {
    await loadWalkthrough();

    render(<Walkthrough />);

    const joyride = screen.getByTestId("joyride");
    expect(joyride).toBeInTheDocument();
    expect(joyride.dataset.steps).toBe("3");
  });

  it("does not render when hasSeenWalkthrough is already set", async () => {
    globalThis.localStorage.setItem(WALKTHROUGH_KEY, "true");
    await loadWalkthrough();

    render(<Walkthrough />);

    expect(screen.queryByTestId("joyride")).not.toBeInTheDocument();
  });
});
