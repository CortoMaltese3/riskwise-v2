import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts === "object") {
        const parts = Object.entries(opts).map(([k, v]) => `${k}=${String(v)}`);
        return parts.length ? `${key}|${parts.join(",")}` : key;
      }
      return key;
    },
    i18n: { language: "en" },
  }),
}));

vi.mock("../charts/WaterfallChart", () => ({
  default: () => <div data-testid="waterfall-chart" />,
}));

vi.mock("../charts/CostBenefitChart", () => ({
  default: () => <div data-testid="costben-chart" />,
}));

vi.mock("../../assets/giz_logo.png", () => ({ default: "giz-logo-stub" }));
vi.mock("../../assets/unu_ehs_logo.png", () => ({ default: "unu-logo-stub" }));

// Stub the locale-aware date formatter so timestamp tests are deterministic.
vi.mock("../../lib/formatDate", () => ({
  formatDate: (value: unknown) => {
    if (value instanceof Date) return "2026-05-11";
    return String(value ?? "");
  },
  formatDateTime: (value: unknown) => {
    if (value instanceof Date) return "12:34:56";
    return String(value ?? "");
  },
}));

// useReportLocale fetches /api/v1/settings; the component shares the same
// window.api.http.request mock for scenarios. Stub the hook directly so the
// test only needs to control the scenario payload.
vi.mock("../../hooks/useReportLocale", () => ({
  useReportLocale: () => ({
    locale: "en-US",
    currency: "EUR",
    formatNumber: (v: number) => v.toLocaleString("en-US"),
    formatCurrency: (v: number) => `EUR ${v.toLocaleString("en-US")}`,
  }),
}));

// Snapshot list + image-URL helper sit behind RiskWiseClient. Mock the whole
// module so the snapshot-embedding effect can be exercised without an Electron
// IPC bridge or a real loopback server.
const listSnapshotsMock = vi.fn();
vi.mock("../../lib/RiskWiseClient", () => ({
  default: {
    listSnapshots: (...args: unknown[]) => listSnapshotsMock(...args),
    snapshotImageUrl: (id: string) => `/api/v1/snapshots/${id}/image`,
  },
}));

import ScenarioPrintView from "./ScenarioPrintView";
import enLocale from "../../locales/en.json";

const meta = {
  id: "scn-1",
  name: "My Scenario",
  country: "Egypt",
  hazard_type: "flood",
  scenario: "rcp_8_5",
  ref_year: 2020,
  future_year: 2080,
  annual_growth: 1.5,
  exposure_type: "buildings",
  asset_type: "economic",
  created_at: "2026-01-15T10:00:00Z",
  app_version: "2.4.0",
  engine_version: "1.2.0",
  climada_version: "4.0.0",
  entity_data_sha256: "abc123def456abcdef0123456789abcdef0123456789abcdef0123456789abcd",
  hazard_data_sha256: "1111111122222222333333334444444455555555666666667777777788888888",
  country_config_sha256: "aaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999",
  random_seed: 42,
  computed_at: "2026-01-15T10:30:00Z",
};

const waterfall = {
  present_year: 2020,
  future_year: 2080,
  measurement_unit: "USD",
  categories: [
    { key: "risk_present", label: "Present", value: 100, base: 0 },
    { key: "climate_change", label: "Climate Change", value: 50, base: 100 },
    { key: "economic_growth", label: "Economic Growth", value: 20, base: 150 },
    { key: "risk_future", label: "Future", value: 170, base: 0 },
  ],
};

const costben = {
  currency_unit: "USD",
  present_year: 2020,
  future_year: 2080,
  measures: [
    { name: "Sea wall", cost: 1000, benefit: 3000, benefit_cost_ratio: 3.0 },
    { name: "Retrofit", cost: 500, benefit: 2500, benefit_cost_ratio: 5.0 },
  ],
};

interface ScenarioPayload {
  scenario: typeof meta;
  results: { waterfall_data?: string; costben_data?: string };
}

const mockScenario = (payload: ScenarioPayload) => {
  const requestMock = vi.fn().mockResolvedValue({
    success: true,
    result: { data: payload },
  });
  (window as unknown as { api: unknown }).api = {
    http: {
      request: requestMock,
      getBaseUrl: vi.fn().mockResolvedValue("http://127.0.0.1:8000"),
    },
  };
  return requestMock;
};

const mockElectron = (username: string | null = "alice") => {
  const getCurrentUser = vi.fn().mockResolvedValue(username);
  (window as unknown as { electron: unknown }).electron = { getCurrentUser };
  return getCurrentUser;
};

interface SnapshotFixture {
  id: string;
  snapshot_type: string;
  surface?: "hazard" | "exposure" | "impact" | "adaptation" | null;
  title?: string | null;
  caption?: string | null;
}

const mockSnapshots = (
  items: SnapshotFixture[],
  failingIds: string[] = []
): { fetchMock: ReturnType<typeof vi.fn> } => {
  listSnapshotsMock.mockResolvedValue({
    success: true,
    result: {
      status: { code: 2000 },
      data: items.map((s) => ({
        id: s.id,
        scenario_id: "scn-1",
        snapshot_type: s.snapshot_type,
        surface: s.surface ?? null,
        title: s.title ?? null,
        caption: s.caption ?? null,
        created_at: "2026-04-20T10:00:00Z",
      })),
    },
  });
  const fetchMock = vi.fn((url: string) => {
    const fail = failingIds.some((id) => url.includes(`/snapshots/${id}/image`));
    if (fail) return Promise.resolve({ ok: false, status: 404 });
    return Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(new Blob(["png-bytes"], { type: "image/png" })),
    });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { fetchMock };
};

beforeEach(() => {
  delete (document.body.dataset as Record<string, string | undefined>).printReady;
  listSnapshotsMock.mockReset();
  // Default to an empty snapshot list so the surface-count effect (#364)
  // always resolves cleanly; tests that need specific snapshots override
  // this via mockSnapshots().
  listSnapshotsMock.mockResolvedValue({
    success: true,
    result: { status: { code: 2000 }, data: [] },
  });
  mockElectron("alice");
  // jsdom doesn't implement object URLs; stub so blob URLs are observable in
  // assertions and revocation can be tracked across test boundaries.
  let nextBlobId = 0;
  globalThis.URL.createObjectURL = vi.fn(() => `blob:fake-${++nextBlobId}`);
  globalThis.URL.revokeObjectURL = vi.fn();
});

// Drives the readiness gate forward: every <img> in the document fires
// load so the Promise.all-on-load contract resolves.
const flushImageLoads = () => {
  document.querySelectorAll("img").forEach((img) => fireEvent.load(img));
};

const SECTION_TESTIDS_IN_ORDER = [
  "print-cover",
  "print-toc",
  "print-input-parameters",
  "print-executive-summary",
  "print-section-hazard",
  "print-section-exposure",
  "print-section-impact",
  "print-section-cost-benefit",
  "print-methodology",
  "print-disclaimer",
];

describe("ScenarioPrintView", () => {
  it("forces the light color scheme on the print root regardless of stored theme mode (#289)", async () => {
    // The app exposes a stored theme mode via localStorage (`themeMode` key,
    // set by `ThemeModeButton`). Pre-populate the dark mode and confirm the
    // print view still scopes its subtree to `data-mui-color-scheme="light"`
    // so PDF exports stay legible on light printer paper.
    window.localStorage.setItem("themeMode", "dark");
    document.documentElement.setAttribute("data-mui-color-scheme", "dark");

    mockScenario({
      scenario: meta,
      results: {
        waterfall_data: JSON.stringify(waterfall),
        costben_data: JSON.stringify(costben),
      },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("print-root")).toBeInTheDocument());
    const root = screen.getByTestId("print-root");
    expect(root.getAttribute("data-mui-color-scheme")).toBe("light");

    // Clean up the document attribute and storage so it doesn't bleed into
    // subsequent tests.
    document.documentElement.removeAttribute("data-mui-color-scheme");
    window.localStorage.removeItem("themeMode");
  });

  it("renders all ten sections with a fully populated fixture, in the correct order", async () => {
    mockScenario({
      scenario: meta,
      results: {
        waterfall_data: JSON.stringify(waterfall),
        costben_data: JSON.stringify(costben),
      },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("print-disclaimer")).toBeInTheDocument());

    // Section order: collect testids in DOM order and confirm they match.
    const allSections = SECTION_TESTIDS_IN_ORDER.map((id) => screen.getByTestId(id));
    const sectionDocOrder = [...document.querySelectorAll("[data-testid]")]
      .map((el) => el.getAttribute("data-testid"))
      .filter((id): id is string => id !== null && SECTION_TESTIDS_IN_ORDER.includes(id));
    expect(sectionDocOrder).toEqual(SECTION_TESTIDS_IN_ORDER);
    expect(allSections).toHaveLength(SECTION_TESTIDS_IN_ORDER.length);

    expect(screen.getByTestId("waterfall-chart")).toBeInTheDocument();
    expect(screen.getByTestId("costben-chart")).toBeInTheDocument();
    expect(screen.getByTestId("print-risk-table")).toBeInTheDocument();
    expect(screen.getByTestId("print-costben-table")).toBeInTheDocument();
    expect(screen.getByTestId("print-cover-logos")).toBeInTheDocument();
    expect(screen.getByTestId("reproducibility-note")).toBeInTheDocument();
    expect(screen.getByTestId("print-methodology-body")).toBeInTheDocument();

    // Per-domain snapshot slots exist as empty placeholders.
    expect(screen.getByTestId("snapshots-slot-hazard")).toBeEmptyDOMElement();
    expect(screen.getByTestId("snapshots-slot-exposure")).toBeEmptyDOMElement();
    expect(screen.getByTestId("snapshots-slot-impact")).toBeEmptyDOMElement();
    expect(screen.getByTestId("snapshots-slot-cost-benefit")).toBeEmptyDOMElement();

    // Cost-benefit rows render sorted by BCR descending; "Retrofit" (5.0) > "Sea wall" (3.0).
    const costbenTable = screen.getByTestId("print-costben-table");
    const rowNames = Array.from(costbenTable.querySelectorAll("tbody tr td:first-child")).map(
      (n) => n.textContent
    );
    expect(rowNames).toEqual(["Retrofit", "Sea wall"]);

    await waitFor(() => expect(document.body.dataset.printReady).toBe("true"));
  });

  it("section heading order matches the mini-TOC entries", async () => {
    mockScenario({
      scenario: meta,
      results: {
        waterfall_data: JSON.stringify(waterfall),
        costben_data: JSON.stringify(costben),
      },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("print-toc-entries")).toBeInTheDocument());

    const tocText = screen.getByTestId("print-toc-entries").textContent ?? "";
    const tocList = tocText.split(" · ").map((s) => s.trim());

    expect(tocList).toEqual([
      "print_section_input_parameters",
      "print_section_executive_summary",
      "print_section_hazard",
      "print_section_exposure",
      "print_section_impact",
      "print_section_cost_benefit_adaptation",
      "print_section_methodology",
      "print_section_disclaimer",
    ]);
  });

  it("mini-TOC skips Impact and Cost-Benefit when their data is missing", async () => {
    mockScenario({ scenario: meta, results: {} });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("print-toc-entries")).toBeInTheDocument());
    const tocText = screen.getByTestId("print-toc-entries").textContent ?? "";
    expect(tocText).not.toContain("print_section_impact");
    expect(tocText).not.toContain("print_section_cost_benefit_adaptation");
  });

  it("shows the scenario identifier on the cover page when meta.id is present", async () => {
    mockScenario({
      scenario: meta,
      results: {
        waterfall_data: JSON.stringify(waterfall),
        costben_data: JSON.stringify(costben),
      },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("print-cover")).toBeInTheDocument());

    const runCode = screen.getByTestId("print-cover-run-code");
    const cover = screen.getByTestId("print-cover");
    expect(cover.contains(runCode)).toBe(true);
    expect(runCode.textContent).toContain("print_cover_run_code");
    expect(runCode.textContent).toContain(meta.id);
  });

  it("omits the cover run-code row when meta.id is missing", async () => {
    mockScenario({
      scenario: { ...meta, id: "" },
      results: {
        waterfall_data: JSON.stringify(waterfall),
        costben_data: JSON.stringify(costben),
      },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("print-cover")).toBeInTheDocument());
    expect(screen.queryByTestId("print-cover-run-code")).toBeNull();
  });

  it("renders continuous Table and Figure captions in order", async () => {
    mockScenario({
      scenario: meta,
      results: {
        waterfall_data: JSON.stringify(waterfall),
        costben_data: JSON.stringify(costben),
      },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("print-disclaimer")).toBeInTheDocument());

    const tableCaptions = screen.getAllByTestId("caption-table").map((el) => el.textContent ?? "");
    // 5 tables: parameters, executive summary, risk decomposition, cost-benefit summary, provenance.
    expect(tableCaptions).toHaveLength(5);
    expect(tableCaptions[0]).toContain("table_label|number=1");
    expect(tableCaptions[1]).toContain("table_label|number=2");
    expect(tableCaptions[2]).toContain("table_label|number=3");
    expect(tableCaptions[3]).toContain("table_label|number=4");
    expect(tableCaptions[4]).toContain("table_label|number=5");
    expect(tableCaptions[0]).toContain("print_caption_table_parameters");
    expect(tableCaptions[2]).toContain("print_caption_table_risk_decomposition");
    expect(tableCaptions[3]).toContain("print_caption_table_cost_benefit_summary");
    expect(tableCaptions[4]).toContain("print_caption_table_provenance");

    const figureCaptions = screen
      .getAllByTestId("caption-figure")
      .map((el) => el.textContent ?? "");
    // 2 chart figures: waterfall, cost-benefit.
    expect(figureCaptions).toHaveLength(2);
    expect(figureCaptions[0]).toContain("figure_label|number=1");
    expect(figureCaptions[0]).toContain("print_caption_figure_waterfall");
    expect(figureCaptions[1]).toContain("figure_label|number=2");
    expect(figureCaptions[1]).toContain("print_caption_figure_cost_benefit");
  });

  it("renders Scenario-did-not-produce-results fallback when waterfall_data is missing", async () => {
    mockScenario({
      scenario: meta,
      results: { costben_data: JSON.stringify(costben) },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() =>
      expect(screen.getByTestId("print-summary-unavailable")).toBeInTheDocument()
    );
    expect(screen.getByTestId("print-impact-missing")).toBeInTheDocument();
    expect(screen.getByTestId("print-impact-missing").textContent).toBe("print_section_no_results");
    expect(screen.queryByTestId("waterfall-chart")).not.toBeInTheDocument();
    // Hazard / Exposure sections still render description + slot.
    expect(screen.getByTestId("print-section-hazard")).toBeInTheDocument();
    expect(screen.getByTestId("print-section-exposure")).toBeInTheDocument();
  });

  it("renders Scenario-did-not-produce-results fallback when costben_data is missing", async () => {
    mockScenario({
      scenario: meta,
      results: { waterfall_data: JSON.stringify(waterfall) },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("print-costben-missing")).toBeInTheDocument());
    expect(screen.getByTestId("print-costben-missing").textContent).toBe(
      "print_section_no_results"
    );
    expect(screen.queryByTestId("costben-chart")).not.toBeInTheDocument();
    expect(screen.queryByTestId("print-costben-table")).not.toBeInTheDocument();
  });

  it("renders both no-results fallbacks when both result tables are missing", async () => {
    mockScenario({ scenario: meta, results: {} });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() =>
      expect(screen.getByTestId("print-summary-unavailable")).toBeInTheDocument()
    );
    expect(screen.getByTestId("print-impact-missing")).toBeInTheDocument();
    expect(screen.getByTestId("print-costben-missing")).toBeInTheDocument();
    expect(screen.queryByTestId("waterfall-chart")).not.toBeInTheDocument();
    expect(screen.queryByTestId("costben-chart")).not.toBeInTheDocument();
  });

  it("removes the BibTeX block and the CLIMADA Version row from provenance", async () => {
    mockScenario({
      scenario: meta,
      results: {
        waterfall_data: JSON.stringify(waterfall),
        costben_data: JSON.stringify(costben),
      },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("print-methodology")).toBeInTheDocument());

    expect(screen.queryByTestId("bibtex-snippet")).not.toBeInTheDocument();
    const provenanceTable = screen.getByTestId("print-provenance-table");
    expect(provenanceTable.textContent).not.toContain("CLIMADA Version");
    // App Version and Engine Version rows survive.
    expect(provenanceTable.textContent).toContain("App Version");
    expect(provenanceTable.textContent).toContain("Engine Version");
  });

  it("en.json disclaimer body does not contain the CLIMADA license text", () => {
    const body = (enLocale as Record<string, string>).print_disclaimer_body;
    expect(body).toBeTruthy();
    expect(body).not.toMatch(/License for CLIMADA/i);
    expect(body).not.toMatch(/Copyright \(C\) 2017 ETH Zurich/i);
    // Sanity check: the disclaimer still contains the legacy starting phrase.
    expect(body).toMatch(/The user interface has been developed by GIZ and UNU-EHS\/MCII/);
  });

  it("renders the disclaimer without the License-for-CLIMADA paragraph", async () => {
    mockScenario({
      scenario: meta,
      results: {
        waterfall_data: JSON.stringify(waterfall),
        costben_data: JSON.stringify(costben),
      },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("print-disclaimer-body")).toBeInTheDocument());

    const disclaimerText = screen.getByTestId("print-disclaimer-body").textContent ?? "";
    // The disclaimer body is keyed by i18n; the mocked t() returns the key. The
    // *actual* string lives in locales/en.json and is asserted in the i18n
    // integration test below.
    expect(disclaimerText).toContain("print_disclaimer_body");
    // The legacy License paragraph must not appear anywhere in the disclaimer
    // section. The i18n keys for it don't exist; this guards against future
    // accidental reintroduction.
    expect(disclaimerText).not.toMatch(/License for CLIMADA/i);
    expect(disclaimerText).not.toMatch(/Copyright \(C\) 2017 ETH Zurich/i);
  });

  it("renders creation metadata with the mocked getCurrentUser result", async () => {
    mockScenario({
      scenario: meta,
      results: {
        waterfall_data: JSON.stringify(waterfall),
        costben_data: JSON.stringify(costben),
      },
    });
    mockElectron("bob");

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() =>
      expect(screen.getByTestId("print-creation-user").textContent).toContain("bob")
    );
    expect(screen.getByTestId("print-creation-date").textContent).toContain("2026-05-11");
    expect(screen.getByTestId("print-creation-time").textContent).toContain("12:34:56");
  });

  it("falls back to a dash when getCurrentUser resolves to null", async () => {
    mockScenario({
      scenario: meta,
      results: {
        waterfall_data: JSON.stringify(waterfall),
        costben_data: JSON.stringify(costben),
      },
    });
    mockElectron(null);

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() =>
      expect(screen.getByTestId("print-creation-user").textContent).toContain(
        "print_creation_user_fallback"
      )
    );
    // printReady must still flip even when the IPC returned null.
    await waitFor(() => expect(document.body.dataset.printReady).toBe("true"));
  });

  it("falls back to a dash when getCurrentUser throws", async () => {
    mockScenario({
      scenario: meta,
      results: { waterfall_data: JSON.stringify(waterfall) },
    });
    const failingGetUser = vi.fn().mockRejectedValue(new Error("ipc boom"));
    (window as unknown as { electron: unknown }).electron = { getCurrentUser: failingGetUser };

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() =>
      expect(screen.getByTestId("print-creation-user").textContent).toContain(
        "print_creation_user_fallback"
      )
    );
    await waitFor(() => expect(document.body.dataset.printReady).toBe("true"));
  });

  it("leaves the per-surface slots empty when snapshotIds is empty and scenario has none", async () => {
    mockScenario({
      scenario: meta,
      results: { waterfall_data: JSON.stringify(waterfall) },
    });
    mockSnapshots([]);

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("snapshots-slot-hazard")).toBeEmptyDOMElement());
    expect(screen.getByTestId("snapshots-slot-exposure")).toBeEmptyDOMElement();
    expect(screen.getByTestId("snapshots-slot-impact")).toBeEmptyDOMElement();
    expect(screen.getByTestId("snapshots-slot-cost-benefit")).toBeEmptyDOMElement();
  });

  it("routes a hazard snapshot into the hazard slot", async () => {
    mockScenario({
      scenario: meta,
      results: { waterfall_data: JSON.stringify(waterfall) },
    });
    mockSnapshots([
      { id: "snap-h", snapshot_type: "map", surface: "hazard", title: "Hazard map", caption: "h" },
    ]);

    render(<ScenarioPrintView scenarioId="scn-1" snapshotIds={["snap-h"]} />);

    await waitFor(() => expect(screen.getByTestId("snapshot-figure-snap-h")).toBeInTheDocument());
    const slot = screen.getByTestId("snapshots-slot-hazard");
    expect(within(slot).getByTestId("snapshot-figure-snap-h")).toBeInTheDocument();
    // Not in any other surface slot.
    expect(
      within(screen.getByTestId("snapshots-slot-impact")).queryByTestId("snapshot-figure-snap-h")
    ).not.toBeInTheDocument();
  });

  it("routes two impact snapshots into the impact slot and continues figure numbering", async () => {
    mockScenario({
      scenario: meta,
      results: { waterfall_data: JSON.stringify(waterfall) },
    });
    mockSnapshots([
      { id: "snap-i1", snapshot_type: "map", surface: "impact", title: "Impact 1", caption: "i1" },
      { id: "snap-i2", snapshot_type: "map", surface: "impact", title: "Impact 2", caption: "i2" },
    ]);

    render(<ScenarioPrintView scenarioId="scn-1" snapshotIds={["snap-i1", "snap-i2"]} />);

    await waitFor(() => expect(screen.getByTestId("snapshot-figure-snap-i1")).toBeInTheDocument());

    const slot = screen.getByTestId("snapshots-slot-impact");
    const figures = within(slot).getAllByTestId(/^snapshot-figure-/);
    expect(figures.map((f) => f.getAttribute("data-testid"))).toEqual([
      "snapshot-figure-snap-i1",
      "snapshot-figure-snap-i2",
    ]);

    // Waterfall chart is Figure 1; impact snapshots continue at 2 and 3.
    expect(within(figures[0]).getByText(/figure_label\|number=2.*Impact 1/)).toBeInTheDocument();
    expect(within(figures[1]).getByText(/figure_label\|number=3.*Impact 2/)).toBeInTheDocument();

    flushImageLoads();
    await waitFor(() => expect(document.body.dataset.printReady).toBe("true"));
  });

  it("removes the waterfall chart and its caption when waterfall toggle is off", async () => {
    mockScenario({
      scenario: meta,
      results: { waterfall_data: JSON.stringify(waterfall) },
    });
    mockSnapshots([]);

    render(<ScenarioPrintView scenarioId="scn-1" includeWaterfall={false} />);

    await waitFor(() => expect(screen.getByTestId("print-section-impact")).toBeInTheDocument());
    expect(screen.queryByTestId("waterfall-chart")).not.toBeInTheDocument();

    // The risk decomposition figure caption is gone; the only figure caption
    // left is the cost-benefit one.
    const figureCaptions = screen.queryAllByTestId("caption-figure");
    for (const caption of figureCaptions) {
      expect(caption.textContent).not.toContain("print_caption_figure_waterfall");
    }
    // Impact section still renders description + slot.
    expect(screen.getByTestId("snapshots-slot-impact")).toBeInTheDocument();
  });

  it("removes the cost-benefit chart and table when cost-benefit toggle is off", async () => {
    mockScenario({
      scenario: meta,
      results: {
        waterfall_data: JSON.stringify(waterfall),
        costben_data: JSON.stringify(costben),
      },
    });
    mockSnapshots([]);

    render(<ScenarioPrintView scenarioId="scn-1" includeCostBenefit={false} />);

    await waitFor(() =>
      expect(screen.getByTestId("print-section-cost-benefit")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("costben-chart")).not.toBeInTheDocument();
    expect(screen.queryByTestId("print-costben-table")).not.toBeInTheDocument();
    // Section still renders description + slot.
    expect(screen.getByTestId("snapshots-slot-cost-benefit")).toBeInTheDocument();
  });

  it("renders the available-but-not-selected notice in Exposure when snapshots exist but none picked", async () => {
    mockScenario({ scenario: meta, results: {} });
    mockSnapshots([
      { id: "snap-e", snapshot_type: "map", surface: "exposure", title: "Exposure", caption: "e" },
    ]);

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() =>
      expect(screen.getByTestId("snapshots-available-note-exposure")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("snapshots-available-note-hazard")).not.toBeInTheDocument();
  });

  it("does not render the notice when scenario has no snapshots in that surface at all", async () => {
    mockScenario({ scenario: meta, results: {} });
    mockSnapshots([]);

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("print-section-hazard")).toBeInTheDocument());
    expect(screen.queryByTestId("snapshots-available-note-hazard")).not.toBeInTheDocument();
    expect(screen.queryByTestId("snapshots-available-note-exposure")).not.toBeInTheDocument();
    expect(screen.queryByTestId("snapshots-available-note-impact")).not.toBeInTheDocument();
    expect(screen.queryByTestId("snapshots-available-note-adaptation")).not.toBeInTheDocument();
  });

  it("renders an uncategorized snapshot in the Other Visuals section", async () => {
    mockScenario({ scenario: meta, results: {} });
    mockSnapshots([
      { id: "snap-x", snapshot_type: "map", surface: null, title: "Uncategorized", caption: "x" },
    ]);

    render(<ScenarioPrintView scenarioId="scn-1" snapshotIds={["snap-x"]} />);

    await waitFor(() =>
      expect(screen.getByTestId("print-section-other-visuals")).toBeInTheDocument()
    );
    const slot = screen.getByTestId("snapshots-slot-other");
    expect(within(slot).getByTestId("snapshot-figure-snap-x")).toBeInTheDocument();
  });

  it("omits the Other Visuals section when no selected snapshot is uncategorized", async () => {
    mockScenario({ scenario: meta, results: {} });
    mockSnapshots([
      { id: "snap-h", snapshot_type: "map", surface: "hazard", title: "H", caption: "h" },
    ]);

    render(<ScenarioPrintView scenarioId="scn-1" snapshotIds={["snap-h"]} />);

    await waitFor(() => expect(screen.getByTestId("snapshot-figure-snap-h")).toBeInTheDocument());
    expect(screen.queryByTestId("print-section-other-visuals")).not.toBeInTheDocument();
  });

  it("falls back to the humanized snapshot type when title is missing", async () => {
    mockScenario({
      scenario: meta,
      results: { waterfall_data: JSON.stringify(waterfall) },
    });
    mockSnapshots([
      {
        id: "snap-1",
        snapshot_type: "map",
        surface: "impact",
        title: null,
        caption: "tagged caption",
      },
    ]);

    render(<ScenarioPrintView scenarioId="scn-1" snapshotIds={["snap-1"]} />);

    await waitFor(() => expect(screen.getByTestId("snapshot-figure-snap-1")).toBeInTheDocument());
    const fig = screen.getByTestId("snapshot-figure-snap-1");
    // Waterfall chart took Figure 1; this impact snapshot is Figure 2.
    expect(within(fig).getByText(/figure_label\|number=2.*snapshot_type_map/)).toBeInTheDocument();
    expect(within(fig).getByText("tagged caption")).toBeInTheDocument();
  });

  it("skips a failing snapshot fetch without blocking remaining figures", async () => {
    mockScenario({
      scenario: meta,
      results: { waterfall_data: JSON.stringify(waterfall) },
    });
    mockSnapshots(
      [
        {
          id: "snap-1",
          snapshot_type: "map",
          surface: "impact",
          title: "Kept first",
          caption: "k1",
        },
        {
          id: "snap-broken",
          snapshot_type: "map",
          surface: "impact",
          title: "Broken middle",
          caption: "x",
        },
        {
          id: "snap-2",
          snapshot_type: "map",
          surface: "impact",
          title: "Kept second",
          caption: "k2",
        },
      ],
      ["snap-broken"]
    );

    render(
      <ScenarioPrintView scenarioId="scn-1" snapshotIds={["snap-1", "snap-broken", "snap-2"]} />
    );

    await waitFor(() => expect(screen.getByTestId("snapshot-figure-snap-1")).toBeInTheDocument());
    expect(screen.getByTestId("snapshot-figure-snap-2")).toBeInTheDocument();
    expect(screen.queryByTestId("snapshot-figure-snap-broken")).not.toBeInTheDocument();

    // Renumbering continues without gaps after the waterfall chart's Figure 1.
    const slot = screen.getByTestId("snapshots-slot-impact");
    const figures = within(slot).getAllByTestId(/^snapshot-figure-/);
    expect(figures).toHaveLength(2);
    expect(within(figures[0]).getByText(/figure_label\|number=2.*Kept first/)).toBeInTheDocument();
    expect(within(figures[1]).getByText(/figure_label\|number=3.*Kept second/)).toBeInTheDocument();

    flushImageLoads();
    await waitFor(() => expect(document.body.dataset.printReady).toBe("true"));
  });
});
