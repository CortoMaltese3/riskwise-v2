import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { runAxe, formatViolations } from "./axe-helper";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => (opts && opts.label ? `${key}:${opts.label}` : key),
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("../../src/components/nav/LanguageButton", () => ({
  default: () => (
    <button type="button" aria-label="lang">
      lang
    </button>
  ),
}));
vi.mock("../../src/components/nav/MinimizeButton", () => ({
  default: () => (
    <button type="button" aria-label="minimize">
      min
    </button>
  ),
}));
vi.mock("../../src/components/nav/ShutdownButton", () => ({
  default: () => (
    <button type="button" aria-label="shutdown">
      shut
    </button>
  ),
}));
vi.mock("../../src/components/input/DataInput", () => ({
  default: () => <div data-testid="data-input">data input</div>,
}));
vi.mock("../../src/components/input/AdaptationMeasuresInput", () => ({
  default: () => <div data-testid="adaptation-input">adaptation</div>,
}));
vi.mock("../../src/components/inputMacro/MacroEconomicInput", () => ({
  default: () => <div data-testid="macro-input">macro</div>,
}));
vi.mock("../../src/components/main/MainView", () => ({
  default: () => <div data-testid="main-view">main view</div>,
}));
vi.mock("../../src/components/results/ResultsView", () => ({
  default: () => <div data-testid="results-view">results</div>,
}));
vi.mock("../../src/components/workspace/WorkspaceView", () => ({
  default: () => <div data-testid="workspace-view">workspace</div>,
}));

vi.mock("../../src/lib/RiskWiseClient", () => ({
  default: {
    listScenarios: vi.fn().mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: [] },
    }),
    deleteScenario: vi.fn(),
    patchScenario: vi.fn(),
    listSnapshots: vi.fn(),
  },
}));

let theme;
let AppShell;
let RiskAssessmentView;
let WorkspaceView;
let useStore;
let useWorkspaceStore;

const FIXTURE = [
  {
    id: "s-1",
    name: "Egypt flood",
    country: "Egypt",
    hazard_type: "flood",
    tags: "eg",
    notes: null,
    status: "completed",
    created_at: "2026-04-20T10:00:00Z",
  },
  {
    id: "s-2",
    name: "Thailand drought",
    country: "Thailand",
    hazard_type: "drought",
    tags: null,
    notes: null,
    status: "completed",
    created_at: "2026-04-19T10:00:00Z",
  },
];

beforeAll(async () => {
  ({ default: theme } = await import("../../src/theme/theme"));
  ({ default: AppShell, RiskAssessmentView } =
    await import("../../src/components/layout/AppShell"));
  ({ default: WorkspaceView } = await import("../../src/components/workspace/WorkspaceView"));
  ({ default: useStore } = await import("../../src/store/useUIStore"));
  ({ default: useWorkspaceStore } = await import("../../src/store/useWorkspaceStore"));
}, 60000);

beforeEach(() => {
  useStore.setState({ activeSection: "risk", sidebarCollapsed: false, selectedTab: 1 });
  useWorkspaceStore.setState({
    scenarios: [],
    search: "",
    countryFilter: "",
    hazardFilter: "",
    sortKey: "created_at",
    sortDir: "desc",
    selectedIds: [],
    error: "",
  });
});

const withTheme = (ui) => <ThemeProvider theme={theme}>{ui}</ThemeProvider>;

const expectNoViolations = async (container) => {
  const violations = await runAxe(container);
  if (violations.length > 0) {
    throw new Error(
      `axe found ${violations.length} violation(s):\n${formatViolations(violations)}`
    );
  }
  expect(violations).toHaveLength(0);
};

describe("Accessibility golden path", () => {
  it("AppShell has no axe violations", async () => {
    const { container } = render(withTheme(<AppShell />));
    await expectNoViolations(container);
  });

  it("RiskAssessmentView has no axe violations", async () => {
    const { container } = render(withTheme(<RiskAssessmentView />));
    await expectNoViolations(container);
  });

  it("WorkspaceView (populated) has no axe violations", async () => {
    const { container } = render(withTheme(<WorkspaceView initialScenarios={FIXTURE} />));
    await expectNoViolations(container);
  });

  it("WorkspaceView (empty state) has no axe violations", async () => {
    const { container } = render(withTheme(<WorkspaceView initialScenarios={[]} />));
    await expectNoViolations(container);
  });
});
