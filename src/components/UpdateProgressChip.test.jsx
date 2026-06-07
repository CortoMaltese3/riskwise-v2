import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import UpdateProgressChip from "./UpdateProgressChip";
import useUpdateStore from "../store/useUpdateStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key, opts) => opts?.defaultValue ?? _key }),
}));

let progressCallback;
let downloadedCallback;

beforeEach(() => {
  progressCallback = null;
  downloadedCallback = null;
  window.electron = {
    updates: {
      onDownloadProgress: vi.fn((cb) => {
        progressCallback = cb;
        return vi.fn();
      }),
      onDownloaded: vi.fn((cb) => {
        downloadedCallback = cb;
        return vi.fn();
      }),
      quitAndInstallNow: vi.fn().mockResolvedValue({ ok: true }),
      installOnNextRestart: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
});

afterEach(() => {
  cleanup();
  act(() => useUpdateStore.getState().reset());
  delete window.electron;
});

describe("UpdateProgressChip", () => {
  it("renders nothing while idle", () => {
    render(<UpdateProgressChip />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows download progress driven by the store and IPC", async () => {
    render(<UpdateProgressChip />);
    act(() => useUpdateStore.getState().startDownloading("2.1.5"));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByText(/Downloading update v2\.1\.5/)).toBeInTheDocument();

    act(() =>
      progressCallback({ percent: 47, transferred: 58 * 1024 * 1024, total: 125 * 1024 * 1024 })
    );
    await waitFor(() =>
      expect(screen.getByTestId("update-progress-message").textContent).toContain("58 / 125 MB")
    );
  });

  it("animates indeterminately until the first progress byte arrives", async () => {
    render(<UpdateProgressChip />);
    act(() => useUpdateStore.getState().startDownloading("2.1.6"));
    await waitFor(() => screen.getByRole("status"));

    // No numeric value yet → indeterminate bar (no aria-valuenow).
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");

    act(() => progressCallback({ percent: 30, transferred: 1, total: 3 }));
    await waitFor(() =>
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30")
    );
  });

  it("transitions to the ready state on update:downloaded and restarts on click", async () => {
    render(<UpdateProgressChip />);
    act(() => useUpdateStore.getState().startDownloading("2.1.5"));
    act(() => downloadedCallback({ version: "2.1.5" }));

    await waitFor(() => expect(screen.getByText(/Update v2\.1\.5 ready/)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("update-progress-restart"));
    expect(window.electron.updates.quitAndInstallNow).toHaveBeenCalledTimes(1);
  });

  it("invokes quitAndInstallNow only once even if Restart is clicked twice", async () => {
    render(<UpdateProgressChip />);
    act(() => useUpdateStore.getState().setReady("2.1.5"));
    await waitFor(() => screen.getByTestId("update-progress-restart"));

    const button = screen.getByTestId("update-progress-restart");
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(window.electron.updates.quitAndInstallNow).toHaveBeenCalledTimes(1));
  });

  it("shows a retry action on failure that re-triggers the download", async () => {
    render(<UpdateProgressChip />);
    act(() => useUpdateStore.getState().setFailed());

    await waitFor(() => expect(screen.getByText("Update download failed")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("update-progress-retry"));
    await waitFor(() =>
      expect(window.electron.updates.installOnNextRestart).toHaveBeenCalledTimes(1)
    );
  });

  it("dismisses a terminal chip via the close button", async () => {
    render(<UpdateProgressChip />);
    act(() => useUpdateStore.getState().setReady("2.1.5"));
    await waitFor(() => screen.getByRole("status"));

    fireEvent.click(screen.getByLabelText("Dismiss update"));
    await waitFor(() => expect(useUpdateStore.getState().phase).toBeNull());
  });
});
