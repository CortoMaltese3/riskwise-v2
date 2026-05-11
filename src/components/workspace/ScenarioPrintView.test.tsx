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

interface SnapshotFixture {
  id: string;
  snapshot_type: string;
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

describe("ScenarioPrintView", () => {
  it("renders all six sections with a fully populated fixture", async () => {
    mockScenario({
      scenario: meta,
      results: {
        waterfall_data: JSON.stringify(waterfall),
        costben_data: JSON.stringify(costben),
      },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("print-cover")).toBeInTheDocument());

    expect(screen.getByTestId("print-cover")).toBeInTheDocument();
    expect(screen.getByTestId("print-executive-summary")).toBeInTheDocument();
    expect(screen.getByTestId("print-scenario-inputs")).toBeInTheDocument();
    expect(screen.getByTestId("print-key-results")).toBeInTheDocument();
    expect(screen.getByTestId("print-visuals")).toBeInTheDocument();
    expect(screen.getByTestId("print-methodology")).toBeInTheDocument();

    expect(screen.getByTestId("snapshots-slot")).toBeInTheDocument();
    expect(screen.getByTestId("waterfall-chart")).toBeInTheDocument();
    expect(screen.getByTestId("costben-chart")).toBeInTheDocument();
    expect(screen.getByTestId("print-risk-table")).toBeInTheDocument();
    expect(screen.getByTestId("print-costben-table")).toBeInTheDocument();
    expect(screen.getByTestId("print-cover-logos")).toBeInTheDocument();
    expect(screen.getByTestId("bibtex-snippet")).toBeInTheDocument();
    expect(screen.getByTestId("reproducibility-note")).toBeInTheDocument();
    expect(screen.getByTestId("print-methodology-body")).toBeInTheDocument();

    // Cost-benefit rows render sorted by BCR descending; "Retrofit" (5.0) > "Sea wall" (3.0).
    const costbenTable = screen.getByTestId("print-costben-table");
    const rowNames = Array.from(costbenTable.querySelectorAll("tbody tr td:first-child")).map(
      (n) => n.textContent
    );
    expect(rowNames).toEqual(["Retrofit", "Sea wall"]);

    await waitFor(() => expect(document.body.dataset.printReady).toBe("true"));
  });

  it("renders summary-unavailable branch when waterfall_data is missing", async () => {
    mockScenario({
      scenario: meta,
      results: { costben_data: JSON.stringify(costben) },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() =>
      expect(screen.getByTestId("print-summary-unavailable")).toBeInTheDocument()
    );
    expect(screen.getByTestId("print-risk-table-missing")).toBeInTheDocument();
  });

  it("renders not-available branches when both result tables are missing", async () => {
    mockScenario({
      scenario: meta,
      results: {},
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() =>
      expect(screen.getByTestId("print-summary-unavailable")).toBeInTheDocument()
    );
    expect(screen.getByTestId("print-risk-table-missing")).toBeInTheDocument();
    expect(screen.getByTestId("print-costben-table-missing")).toBeInTheDocument();
    expect(screen.queryByTestId("waterfall-chart")).not.toBeInTheDocument();
    expect(screen.queryByTestId("costben-chart")).not.toBeInTheDocument();
  });

  it("leaves snapshots-slot empty when snapshotIds is empty", async () => {
    mockScenario({
      scenario: meta,
      results: { waterfall_data: JSON.stringify(waterfall) },
    });

    render(<ScenarioPrintView scenarioId="scn-1" />);

    await waitFor(() => expect(screen.getByTestId("snapshots-slot")).toBeInTheDocument());
    expect(screen.getByTestId("snapshots-slot")).toBeEmptyDOMElement();
    expect(listSnapshotsMock).not.toHaveBeenCalled();
  });

  it("renders the requested snapshots in URL order with auto-numbered figures", async () => {
    mockScenario({
      scenario: meta,
      results: { waterfall_data: JSON.stringify(waterfall) },
    });
    mockSnapshots([
      { id: "snap-3", snapshot_type: "map", title: "Third pick", caption: "third caption" },
      { id: "snap-1", snapshot_type: "waterfall", title: "First pick", caption: "first caption" },
      {
        id: "snap-2",
        snapshot_type: "cost_benefit",
        title: "Second pick",
        caption: "second caption",
      },
    ]);

    render(<ScenarioPrintView scenarioId="scn-1" snapshotIds={["snap-1", "snap-2", "snap-3"]} />);

    await waitFor(() => expect(screen.getByTestId("snapshot-figure-snap-1")).toBeInTheDocument());
    expect(screen.getByTestId("snapshot-figure-snap-2")).toBeInTheDocument();
    expect(screen.getByTestId("snapshot-figure-snap-3")).toBeInTheDocument();

    const slot = screen.getByTestId("snapshots-slot");
    const figures = within(slot).getAllByTestId(/^snapshot-figure-/);
    expect(figures.map((f) => f.getAttribute("data-testid"))).toEqual([
      "snapshot-figure-snap-1",
      "snapshot-figure-snap-2",
      "snapshot-figure-snap-3",
    ]);

    // Figure numbers follow URL order, not the list-response order.
    expect(within(figures[0]).getByText(/figure_label\|number=1.*First pick/)).toBeInTheDocument();
    expect(within(figures[1]).getByText(/figure_label\|number=2.*Second pick/)).toBeInTheDocument();
    expect(within(figures[2]).getByText(/figure_label\|number=3.*Third pick/)).toBeInTheDocument();

    expect(within(figures[0]).getByText("first caption")).toBeInTheDocument();
    expect(within(figures[1]).getByText("second caption")).toBeInTheDocument();
    expect(within(figures[2]).getByText("third caption")).toBeInTheDocument();

    flushImageLoads();
    await waitFor(() => expect(document.body.dataset.printReady).toBe("true"));
  });

  it("falls back to the humanized snapshot type when title is missing", async () => {
    mockScenario({
      scenario: meta,
      results: { waterfall_data: JSON.stringify(waterfall) },
    });
    mockSnapshots([{ id: "snap-1", snapshot_type: "map", title: null, caption: "tagged caption" }]);

    render(<ScenarioPrintView scenarioId="scn-1" snapshotIds={["snap-1"]} />);

    await waitFor(() => expect(screen.getByTestId("snapshot-figure-snap-1")).toBeInTheDocument());
    const fig = screen.getByTestId("snapshot-figure-snap-1");
    expect(within(fig).getByText(/figure_label\|number=1.*snapshot_type_map/)).toBeInTheDocument();
    expect(within(fig).getByText("tagged caption")).toBeInTheDocument();
  });

  it("omits the caption line when caption is missing (title present)", async () => {
    mockScenario({
      scenario: meta,
      results: { waterfall_data: JSON.stringify(waterfall) },
    });
    mockSnapshots([{ id: "snap-1", snapshot_type: "map", title: "Just a title", caption: null }]);

    render(<ScenarioPrintView scenarioId="scn-1" snapshotIds={["snap-1"]} />);

    await waitFor(() => expect(screen.getByTestId("snapshot-figure-snap-1")).toBeInTheDocument());
    const fig = screen.getByTestId("snapshot-figure-snap-1");
    expect(within(fig).getByText(/figure_label\|number=1.*Just a title/)).toBeInTheDocument();
    // No caption paragraph rendered: figure has only the heading + the img.
    expect(within(fig).queryByText(/caption/i)).not.toBeInTheDocument();
    expect(within(fig).getAllByRole("img")).toHaveLength(1);
  });

  it("falls back to humanized type and skips caption when both are missing", async () => {
    mockScenario({
      scenario: meta,
      results: { waterfall_data: JSON.stringify(waterfall) },
    });
    mockSnapshots([{ id: "snap-1", snapshot_type: "waterfall", title: null, caption: null }]);

    render(<ScenarioPrintView scenarioId="scn-1" snapshotIds={["snap-1"]} />);

    await waitFor(() => expect(screen.getByTestId("snapshot-figure-snap-1")).toBeInTheDocument());
    const fig = screen.getByTestId("snapshot-figure-snap-1");
    expect(
      within(fig).getByText(/figure_label\|number=1.*snapshot_type_waterfall/)
    ).toBeInTheDocument();
    // Only heading + image — no caption block.
    expect(fig.querySelectorAll("p").length).toBeLessThanOrEqual(1);
  });

  it("skips a failing snapshot fetch without blocking remaining figures", async () => {
    mockScenario({
      scenario: meta,
      results: { waterfall_data: JSON.stringify(waterfall) },
    });
    mockSnapshots(
      [
        { id: "snap-1", snapshot_type: "map", title: "Kept first", caption: "k1" },
        { id: "snap-broken", snapshot_type: "map", title: "Broken middle", caption: "x" },
        { id: "snap-2", snapshot_type: "waterfall", title: "Kept second", caption: "k2" },
      ],
      ["snap-broken"]
    );

    render(
      <ScenarioPrintView scenarioId="scn-1" snapshotIds={["snap-1", "snap-broken", "snap-2"]} />
    );

    await waitFor(() => expect(screen.getByTestId("snapshot-figure-snap-1")).toBeInTheDocument());
    expect(screen.getByTestId("snapshot-figure-snap-2")).toBeInTheDocument();
    expect(screen.queryByTestId("snapshot-figure-snap-broken")).not.toBeInTheDocument();

    // Renumbering continues without gaps: kept #1 → "Figure 1", kept #2 → "Figure 2".
    const slot = screen.getByTestId("snapshots-slot");
    const figures = within(slot).getAllByTestId(/^snapshot-figure-/);
    expect(figures).toHaveLength(2);
    expect(within(figures[0]).getByText(/figure_label\|number=1.*Kept first/)).toBeInTheDocument();
    expect(within(figures[1]).getByText(/figure_label\|number=2.*Kept second/)).toBeInTheDocument();

    flushImageLoads();
    await waitFor(() => expect(document.body.dataset.printReady).toBe("true"));
  });
});
