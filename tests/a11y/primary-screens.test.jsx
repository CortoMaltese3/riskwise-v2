import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { runAxe, formatViolations } from "./axe-helper";

// Phase 4 Area 16 (issue #121): axe-core coverage for the remaining primary
// screens. AppShell, RiskAssessmentView, and WorkspaceView are exercised in
// `golden-path.test.jsx`. This file rounds out the gate by adding HomeView,
// MacroEconomicInput, and every SettingsView panel so a new violation in
// any primary screen fails CI with the rule id and selector
// (see `formatViolations`).
//
// The Settings sections call out to RiskWiseClient and the Electron bridge
// during effects; both are stubbed below so the axe scan stays deterministic.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => (opts && opts.label ? `${key}:${opts.label}` : key),
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("../../src/lib/RiskWiseClient", () => ({
  default: {
    listScenarios: vi
      .fn()
      .mockResolvedValue({ success: true, result: { status: { code: 2000 }, data: [] } }),
    listDataPacks: vi
      .fn()
      .mockResolvedValue({ success: true, result: { status: { code: 2000 }, data: [] } }),
    listMeasureSets: vi
      .fn()
      .mockResolvedValue({ success: true, result: { status: { code: 2000 }, data: [] } }),
    listCustomDataPacks: vi
      .fn()
      .mockResolvedValue({ success: true, result: { status: { code: 2000 }, data: [] } }),
    listCREDDataPacks: vi
      .fn()
      .mockResolvedValue({ success: true, result: { status: { code: 2000 }, data: [] } }),
    deleteScenario: vi.fn(),
    patchScenario: vi.fn(),
    listSnapshots: vi.fn(),
  },
}));

vi.mock("../../src/hooks/useToast", () => ({
  enqueueToast: vi.fn(),
  default: () => ({ enqueueToast: vi.fn() }),
}));

// Static imports — the existing golden-path test takes ~3s when it pulls in
// AppShell + Workspace, so static module loading is fast enough; the dynamic
// ``await import(...)`` style used elsewhere serialises module evaluation
// inside ``beforeAll`` and times out on CI.
import theme from "../../src/theme/theme";
import HomeView from "../../src/components/layout/views/HomeView";
import AppShell from "../../src/components/layout/AppShell";
import SettingsView from "../../src/components/settings/SettingsView";
import CustomDataSection from "../../src/components/settings/CustomDataSection";
import CREDDataSection from "../../src/components/settings/CREDDataSection";
import MeasuresSection from "../../src/components/settings/MeasuresSection";
import UpdatesPanel from "../../src/components/settings/UpdatesPanel";
import OfflineSection from "../../src/components/settings/OfflineSection";
import DiagnosticsSection from "../../src/components/settings/DiagnosticsSection";
import MacroEconomicInput from "../../src/components/inputMacro/MacroEconomicInput";
import useStore from "../../src/store";
import useWorkspaceStore from "../../src/store/workspaceSlice";

const withTheme = (ui) => <ThemeProvider theme={theme}>{ui}</ThemeProvider>;

const expectNoViolations = async (container) => {
  const violations = await runAxe(container);
  if (violations.length > 0) {
    // The thrown error includes the rule id, node count, and target selector
    // so CI logs name the failing rule and selector — an acceptance criterion
    // of issue #121.
    throw new Error(
      `axe found ${violations.length} violation(s):\n${formatViolations(violations)}`
    );
  }
  expect(violations).toHaveLength(0);
};

describe("Accessibility — primary screens (issue #121)", () => {
  // Stub the Electron preload bridge that DiagnosticsSection / OfflineSection /
  // UpdatesPanel reach for. Returning resolved no-op shapes lets the panels
  // settle into an idle state, which is what we audit.
  beforeAll(() => {
    globalThis.window.electron = {
      diagnostics: {
        getSentryStatus: vi.fn().mockResolvedValue({ enabled: false, shouldPromptConsent: false }),
        setSentryConsent: vi.fn().mockResolvedValue({ enabled: false }),
        exportZip: vi.fn().mockResolvedValue({ ok: true, path: "/tmp/diag.zip" }),
      },
      offline: {
        getStatus: vi.fn().mockResolvedValue({ packInstalled: false, packPath: null }),
        installPack: vi.fn(),
        removePack: vi.fn(),
      },
      updates: {
        getStatus: vi.fn().mockResolvedValue({ updateAvailable: false }),
        checkForUpdates: vi.fn(),
        onStatus: vi.fn(() => () => {}),
      },
    };
  });

  beforeEach(() => {
    useStore.setState({
      activeSection: "home",
      sidebarCollapsed: false,
      selectedTab: 0,
      credOutputData: null,
    });
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

  it("HomeView has no axe violations", async () => {
    const { container } = render(withTheme(<HomeView />));
    await expectNoViolations(container);
  });

  it("AppShell with home section selected has no axe violations", async () => {
    useStore.setState({ activeSection: "home", selectedTab: 0 });
    const { container } = render(withTheme(<AppShell />));
    await expectNoViolations(container);
  });

  it("MacroEconomicInput (selectedTab=2) has no axe violations", async () => {
    useStore.setState({ activeSection: "macro", selectedTab: 2 });
    const { container } = render(withTheme(<MacroEconomicInput />));
    await expectNoViolations(container);
  });

  // SettingsView is a tab strip whose panel mounts depend on `activeTab` local
  // state. We render the parent for the default panel, then render each tab's
  // section in isolation so axe inspects every panel without driving user
  // interactions.
  it("SettingsView default panel (custom data) has no axe violations", async () => {
    const { container } = render(withTheme(<SettingsView />));
    await expectNoViolations(container);
  });

  it.each([
    ["CustomDataSection", CustomDataSection],
    ["CREDDataSection", CREDDataSection],
    ["MeasuresSection", MeasuresSection],
    ["UpdatesPanel", UpdatesPanel],
    ["OfflineSection", OfflineSection],
    ["DiagnosticsSection", DiagnosticsSection],
  ])("Settings panel %s has no axe violations", async (_name, Component) => {
    const { container } = render(withTheme(<Component />));
    await expectNoViolations(container);
  });
});
