import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      if (key === "export_pdf_dialog_selected_count") {
        return `Selected: ${opts.count} / ${opts.max}`;
      }
      if (key === "export_pdf_dialog_subtitle") {
        return `subtitle:${opts?.name ?? ""}`;
      }
      return key;
    },
    i18n: { language: "en" },
  }),
}));

const listSnapshotsMock = vi.fn();

vi.mock("../../lib/RiskWiseClient", () => ({
  default: {
    listSnapshots: (...args) => listSnapshotsMock(...args),
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
  snapshot_type: "risk",
  title: `Title ${id}`,
  caption: `Caption ${id}`,
  created_at: "2026-04-20T10:00:00Z",
  ...overrides,
});

const successResult = (snaps) => ({
  success: true,
  result: { status: { code: 2000 }, data: snaps },
});

beforeEach(() => {
  listSnapshotsMock.mockReset();
  if (!window.api) {
    window.api = { http: { getBaseUrl: vi.fn().mockResolvedValue("http://127.0.0.1:1234") } };
  }
});

describe("ExportPdfDialog", () => {
  it("lists snapshots and reports them on confirm", async () => {
    listSnapshotsMock.mockResolvedValue(successResult([makeSnap("a"), makeSnap("b")]));
    const onClose = vi.fn();

    render(
      <ExportPdfDialog open onClose={onClose} scenarioId="scn-1" scenarioName="My scenario" />
    );

    await waitFor(() => expect(screen.getByText("Title a")).toBeInTheDocument());
    expect(screen.getByText("Title b")).toBeInTheDocument();
    expect(listSnapshotsMock).toHaveBeenCalledWith("scn-1");

    fireEvent.click(screen.getByLabelText("select-snapshot-a"));
    expect(screen.getByText("Selected: 1 / 10")).toBeInTheDocument();

    fireEvent.click(screen.getByText("export_pdf_dialog_generate"));
    expect(onClose).toHaveBeenCalledWith(["a"]);
  });

  it("disables 11th and onward checkboxes at the 10-snapshot cap", async () => {
    const snaps = Array.from({ length: 12 }, (_, i) => makeSnap(`s${i}`));
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

  it("shows the empty state when the scenario has no snapshots and still allows generate", async () => {
    listSnapshotsMock.mockResolvedValue(successResult([]));
    const onClose = vi.fn();

    render(<ExportPdfDialog open onClose={onClose} scenarioId="scn-1" scenarioName="X" />);

    await waitFor(() => expect(screen.getByText("export_pdf_dialog_empty")).toBeInTheDocument());

    const generate = screen.getByText("export_pdf_dialog_generate");
    expect(generate).not.toBeDisabled();
    fireEvent.click(generate);
    expect(onClose).toHaveBeenCalledWith([]);
  });

  it("returns null when the user cancels", async () => {
    listSnapshotsMock.mockResolvedValue(successResult([makeSnap("a")]));
    const onClose = vi.fn();

    render(<ExportPdfDialog open onClose={onClose} scenarioId="scn-1" scenarioName="X" />);

    await waitFor(() => expect(screen.getByText("Title a")).toBeInTheDocument());

    fireEvent.click(screen.getByText("export_pdf_dialog_cancel"));
    expect(onClose).toHaveBeenCalledWith(null);
  });
});
