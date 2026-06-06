import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const listSnapshotsMock = vi.fn();
const updateSnapshotMock = vi.fn();
const deleteSnapshotMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    listSnapshots: (...args) => listSnapshotsMock(...args),
    updateSnapshot: (...args) => updateSnapshotMock(...args),
    deleteSnapshot: (...args) => deleteSnapshotMock(...args),
    snapshotImageUrl: (id) => `/api/v1/snapshots/${id}/image`,
  },
}));

let SnapshotDrawer;

beforeAll(async () => {
  ({ default: SnapshotDrawer } = await import("../components/workspace/SnapshotDrawer"));
}, 30000); // MUI-heavy import is slow on a cold cache; default hook timeout flaked in CI/local.

beforeEach(() => {
  listSnapshotsMock.mockReset();
  updateSnapshotMock.mockReset();
  deleteSnapshotMock.mockReset();
  // Stub the preload bridge so the drawer can resolve thumbnails to a URL.
  globalThis.window.api = {
    http: {
      getBaseUrl: vi.fn().mockResolvedValue("http://127.0.0.1:8000"),
    },
  };
});

const SNAP_FIXTURE = {
  id: "snap-1",
  scenario_id: "scen-1",
  snapshot_type: "map",
  title: "initial title",
  caption: "initial",
  created_at: "2026-04-20T10:00:00Z",
};

describe("SnapshotDrawer", () => {
  it("renders snapshot rows with thumbnails and captions", async () => {
    listSnapshotsMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: [SNAP_FIXTURE] },
    });

    render(<SnapshotDrawer scenarioId="scen-1" />);

    await waitFor(() => expect(screen.getByTestId("snapshot-drawer")).toBeInTheDocument());
    const img = await screen.findByRole("img");
    expect(img.getAttribute("src")).toBe("http://127.0.0.1:8000/api/v1/snapshots/snap-1/image");
    const title = screen.getByLabelText("title-snap-1");
    expect(title).toHaveValue("initial title");
    const caption = screen.getByLabelText("caption-snap-1");
    expect(caption).toHaveValue("initial");
  });

  it("renders the title input with its label and 120-char cap (#350)", async () => {
    listSnapshotsMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: [SNAP_FIXTURE] },
    });

    render(<SnapshotDrawer scenarioId="scen-1" />);
    const title = await screen.findByLabelText("title-snap-1");
    expect(title).toBeInTheDocument();
    expect(title.getAttribute("maxlength")).toBe("120");
  });

  it("commits title changes via PATCH on blur with title-only body (#350)", async () => {
    listSnapshotsMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: [SNAP_FIXTURE] },
    });
    updateSnapshotMock.mockResolvedValue({
      success: true,
      result: {
        status: { code: 2000 },
        data: { ...SNAP_FIXTURE, title: "Figure 1: Annual loss" },
      },
    });

    render(<SnapshotDrawer scenarioId="scen-1" />);
    const title = await screen.findByLabelText("title-snap-1");
    fireEvent.change(title, { target: { value: "Figure 1: Annual loss" } });
    // Let the controlled input commit the typed value before blur, otherwise
    // onBlur can read the unchanged value and the commit guard skips the PATCH.
    await waitFor(() => expect(title).toHaveValue("Figure 1: Annual loss"));
    fireEvent.blur(title);

    await waitFor(() => expect(updateSnapshotMock).toHaveBeenCalledTimes(1));
    // Only the changed field is sent so the caption column is not touched.
    expect(updateSnapshotMock).toHaveBeenCalledWith("snap-1", {
      title: "Figure 1: Annual loss",
    });
  });

  it("commits caption changes via PATCH on blur", async () => {
    listSnapshotsMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: [SNAP_FIXTURE] },
    });
    updateSnapshotMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: { ...SNAP_FIXTURE, caption: "renamed" } },
    });

    render(<SnapshotDrawer scenarioId="scen-1" />);
    const caption = await screen.findByLabelText("caption-snap-1");
    fireEvent.change(caption, { target: { value: "renamed" } });
    // Let the controlled input commit the typed value before blur, otherwise
    // onBlur can read the unchanged value and the commit guard skips the PATCH.
    await waitFor(() => expect(caption).toHaveValue("renamed"));
    fireEvent.blur(caption);

    await waitFor(() => expect(updateSnapshotMock).toHaveBeenCalledTimes(1));
    expect(updateSnapshotMock).toHaveBeenCalledWith("snap-1", { caption: "renamed" });
  });

  it("deletes a snapshot optimistically", async () => {
    listSnapshotsMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: [SNAP_FIXTURE] },
    });
    deleteSnapshotMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: { id: "snap-1" } },
    });

    render(<SnapshotDrawer scenarioId="scen-1" />);
    const deleteButton = await screen.findByLabelText("delete-snapshot-snap-1");
    fireEvent.click(deleteButton);

    await waitFor(() => expect(deleteSnapshotMock).toHaveBeenCalledWith("snap-1"));
  });

  it("renders the empty state when no snapshots exist", async () => {
    listSnapshotsMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: [] },
    });

    render(<SnapshotDrawer scenarioId="scen-1" />);
    expect(await screen.findByText("workspace_snapshots_empty")).toBeInTheDocument();
  });
});
