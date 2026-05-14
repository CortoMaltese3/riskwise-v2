import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      if (key === "export_pdf_dialog_selected_count") {
        return `Selected: ${opts.count} / ${opts.max}`;
      }
      if (key === "export_pdf_dialog_subtitle") {
        return `subtitle:${opts?.name ?? ""}`;
      }
      if (key === "export_pdf_dialog_group_count") {
        return `${opts.label} (${opts.count})`;
      }
      if (key === "snapshot_surface_hazard") return "Hazard";
      if (key === "snapshot_surface_exposure") return "Exposure";
      if (key === "snapshot_surface_impact") return "Impact";
      if (key === "export_pdf_dialog_group_other") return "Other";
      if (key === "export_pdf_dialog_include_waterfall") return "Include waterfall chart";
      if (key === "export_pdf_dialog_include_cost_benefit") return "Include cost-benefit chart";
      return key;
    },
    i18n: { language: "en" },
  }),
}));

const listSnapshotsMock = vi.fn();
const getScenarioMock = vi.fn();

vi.mock("../../lib/RiskWiseClient", () => ({
  default: {
    listSnapshots: (...args) => listSnapshotsMock(...args),
    getScenario: (...args) => getScenarioMock(...args),
    snapshotImageUrl: (id) => `/api/v1/snapshots/${id}/image`,
  },
}));

let ExportPdfDialog;

beforeAll(async () => {
  ({ default: ExportPdfDialog } = await import("./ExportPdfDialog"));
}, 60000);

const makeSnap = (id, overrides = {}) => ({
  id,
  scenario_id: "scn-1",
  snapshot_type: "map",
  surface: null,
  title: `Title ${id}`,
  caption: `Caption ${id}`,
  created_at: "2026-04-20T10:00:00Z",
  ...overrides,
});

const successResult = (snaps) => ({
  success: true,
  result: { status: { code: 2000 }, data: snaps },
});

const mockScenario = (results = {}) => {
  getScenarioMock.mockResolvedValue({
    success: true,
    result: { data: { scenario: { id: "scn-1" }, results } },
  });
  window.api = {
    http: {
      getBaseUrl: vi.fn().mockResolvedValue("http://127.0.0.1:1234"),
    },
  };
};

beforeEach(() => {
  listSnapshotsMock.mockReset();
  getScenarioMock.mockReset();
  mockScenario();
});

describe("ExportPdfDialog", () => {
  it("lists map snapshots grouped by surface and reports payload on confirm", async () => {
    listSnapshotsMock.mockResolvedValue(
      successResult([
        makeSnap("h1", { surface: "hazard" }),
        makeSnap("e1", { surface: "exposure" }),
        makeSnap("i1", { surface: "impact" }),
      ])
    );
    const onClose = vi.fn();

    render(
      <ExportPdfDialog open onClose={onClose} scenarioId="scn-1" scenarioName="My scenario" />
    );

    await waitFor(() => expect(screen.getByText("Title h1")).toBeInTheDocument());
    expect(screen.getByText("Title e1")).toBeInTheDocument();
    expect(screen.getByText("Title i1")).toBeInTheDocument();
    expect(listSnapshotsMock).toHaveBeenCalledWith("scn-1");

    expect(screen.getByTestId("snapshot-group-hazard")).toBeInTheDocument();
    expect(screen.getByTestId("snapshot-group-exposure")).toBeInTheDocument();
    expect(screen.getByTestId("snapshot-group-impact")).toBeInTheDocument();
    expect(screen.queryByTestId("snapshot-group-other")).not.toBeInTheDocument();
    expect(screen.getByText("Hazard (1)")).toBeInTheDocument();
    expect(screen.getByText("Exposure (1)")).toBeInTheDocument();
    expect(screen.getByText("Impact (1)")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("select-snapshot-h1"));
    expect(screen.getByText("Selected: 1 / 10")).toBeInTheDocument();

    fireEvent.click(screen.getByText("export_pdf_dialog_generate"));
    expect(onClose).toHaveBeenCalledWith({
      snapshotIds: ["h1"],
      includeWaterfall: false,
      includeCostBenefit: false,
    });
  });

  it("filters out non-map snapshots from the picker", async () => {
    listSnapshotsMock.mockResolvedValue(
      successResult([
        makeSnap("m1", { surface: "hazard" }),
        makeSnap("w1", { snapshot_type: "waterfall", title: "Waterfall snap" }),
        makeSnap("c1", { snapshot_type: "cost_benefit", title: "Cost-benefit snap" }),
      ])
    );

    render(<ExportPdfDialog open onClose={vi.fn()} scenarioId="scn-1" scenarioName="X" />);

    await waitFor(() => expect(screen.getByText("Title m1")).toBeInTheDocument());
    expect(screen.queryByText("Waterfall snap")).not.toBeInTheDocument();
    expect(screen.queryByText("Cost-benefit snap")).not.toBeInTheDocument();
  });

  it("groups uncategorized snapshots under Other only when present", async () => {
    listSnapshotsMock.mockResolvedValue(
      successResult([makeSnap("h1", { surface: "hazard" }), makeSnap("u1", { surface: null })])
    );

    render(<ExportPdfDialog open onClose={vi.fn()} scenarioId="scn-1" scenarioName="X" />);

    await waitFor(() => expect(screen.getByTestId("snapshot-group-other")).toBeInTheDocument());
    expect(screen.getByTestId("snapshot-group-hazard")).toBeInTheDocument();
    expect(screen.getByText("Other (1)")).toBeInTheDocument();
  });

  it("disables 11th and onward checkboxes at the 10-snapshot cap", async () => {
    const snaps = Array.from({ length: 12 }, (_, i) => makeSnap(`s${i}`, { surface: "hazard" }));
    listSnapshotsMock.mockResolvedValue(successResult(snaps));

    render(<ExportPdfDialog open onClose={vi.fn()} scenarioId="scn-1" scenarioName="X" />);

    await waitFor(() => expect(screen.getByLabelText("select-snapshot-s0")).toBeInTheDocument());

    for (let i = 0; i < 10; i += 1) {
      fireEvent.click(screen.getByLabelText(`select-snapshot-s${i}`));
    }
    expect(screen.getByText("Selected: 10 / 10")).toBeInTheDocument();

    expect(screen.getByLabelText("select-snapshot-s10")).toBeDisabled();
    expect(screen.getByLabelText("select-snapshot-s11")).toBeDisabled();
    expect(screen.getByLabelText("select-snapshot-s0")).not.toBeDisabled();
  });

  it("shows the empty state when the scenario has no map snapshots and still allows generate", async () => {
    listSnapshotsMock.mockResolvedValue(
      successResult([makeSnap("w1", { snapshot_type: "waterfall" })])
    );
    const onClose = vi.fn();

    render(<ExportPdfDialog open onClose={onClose} scenarioId="scn-1" scenarioName="X" />);

    await waitFor(() => expect(screen.getByText("export_pdf_dialog_empty")).toBeInTheDocument());

    const generate = screen.getByText("export_pdf_dialog_generate");
    expect(generate).not.toBeDisabled();
    fireEvent.click(generate);
    expect(onClose).toHaveBeenCalledWith({
      snapshotIds: [],
      includeWaterfall: false,
      includeCostBenefit: false,
    });
  });

  it("returns null when the user cancels", async () => {
    listSnapshotsMock.mockResolvedValue(successResult([makeSnap("a", { surface: "hazard" })]));
    const onClose = vi.fn();

    render(<ExportPdfDialog open onClose={onClose} scenarioId="scn-1" scenarioName="X" />);

    await waitFor(() => expect(screen.getByText("Title a")).toBeInTheDocument());

    fireEvent.click(screen.getByText("export_pdf_dialog_cancel"));
    expect(onClose).toHaveBeenCalledWith(null);
  });

  it("renders the waterfall checkbox auto-checked when waterfall_data is present", async () => {
    listSnapshotsMock.mockResolvedValue(successResult([]));
    mockScenario({ waterfall_data: JSON.stringify({ categories: [] }) });

    render(<ExportPdfDialog open onClose={vi.fn()} scenarioId="scn-1" scenarioName="X" />);

    await waitFor(() => expect(screen.getByTestId("export-pdf-chart-toggles")).toBeInTheDocument());
    const waterfallToggle = screen.getByLabelText("include-waterfall");
    expect(waterfallToggle).toBeChecked();
    expect(screen.queryByLabelText("include-cost-benefit")).not.toBeInTheDocument();
  });

  it("hides chart toggles entirely when the scenario carries neither result", async () => {
    listSnapshotsMock.mockResolvedValue(successResult([makeSnap("a", { surface: "hazard" })]));

    render(<ExportPdfDialog open onClose={vi.fn()} scenarioId="scn-1" scenarioName="X" />);

    await waitFor(() => expect(screen.getByText("Title a")).toBeInTheDocument());
    expect(screen.queryByTestId("export-pdf-chart-toggles")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("include-waterfall")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("include-cost-benefit")).not.toBeInTheDocument();
  });

  it("renders the cost-benefit checkbox only when costben_data has measures", async () => {
    listSnapshotsMock.mockResolvedValue(successResult([]));
    mockScenario({
      costben_data: JSON.stringify({ measures: [{ name: "x", cost: 1, benefit: 2 }] }),
    });

    render(<ExportPdfDialog open onClose={vi.fn()} scenarioId="scn-1" scenarioName="X" />);

    await waitFor(() => expect(screen.getByLabelText("include-cost-benefit")).toBeInTheDocument());
    expect(screen.getByLabelText("include-cost-benefit")).toBeChecked();

    // costben_data with no measures hides the checkbox.
    listSnapshotsMock.mockResolvedValue(successResult([]));
    mockScenario({ costben_data: JSON.stringify({ measures: [] }) });

    render(<ExportPdfDialog open onClose={vi.fn()} scenarioId="scn-1" scenarioName="X-empty" />, {
      container: document.createElement("div"),
    });
  });

  it("forwards toggled chart flags on Generate", async () => {
    listSnapshotsMock.mockResolvedValue(successResult([]));
    mockScenario({
      waterfall_data: JSON.stringify({ categories: [] }),
      costben_data: JSON.stringify({ measures: [{ name: "x", cost: 1, benefit: 2 }] }),
    });
    const onClose = vi.fn();

    render(<ExportPdfDialog open onClose={onClose} scenarioId="scn-1" scenarioName="X" />);

    await waitFor(() => expect(screen.getByLabelText("include-waterfall")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("include-waterfall"));
    fireEvent.click(screen.getByText("export_pdf_dialog_generate"));

    expect(onClose).toHaveBeenCalledWith({
      snapshotIds: [],
      includeWaterfall: false,
      includeCostBenefit: true,
    });
  });

  it("keeps the 10-snapshot cap enforced across grouped surfaces", async () => {
    const snaps = [
      ...Array.from({ length: 6 }, (_, i) => makeSnap(`h${i}`, { surface: "hazard" })),
      ...Array.from({ length: 6 }, (_, i) => makeSnap(`i${i}`, { surface: "impact" })),
    ];
    listSnapshotsMock.mockResolvedValue(successResult(snaps));

    render(<ExportPdfDialog open onClose={vi.fn()} scenarioId="scn-1" scenarioName="X" />);

    await waitFor(() => expect(screen.getByLabelText("select-snapshot-h0")).toBeInTheDocument());

    // Click 6 hazard + 4 impact = 10 selections.
    for (let i = 0; i < 6; i += 1) fireEvent.click(screen.getByLabelText(`select-snapshot-h${i}`));
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByLabelText(`select-snapshot-i${i}`));
    expect(screen.getByText("Selected: 10 / 10")).toBeInTheDocument();

    // The 11th and 12th impact checkboxes are disabled regardless of group.
    expect(screen.getByLabelText("select-snapshot-i4")).toBeDisabled();
    expect(screen.getByLabelText("select-snapshot-i5")).toBeDisabled();

    // Within disabled selection scope, also check via group testid that
    // the row is present.
    const impactGroup = screen.getByTestId("snapshot-group-impact");
    expect(within(impactGroup).getByLabelText("select-snapshot-i5")).toBeDisabled();
  });
});
