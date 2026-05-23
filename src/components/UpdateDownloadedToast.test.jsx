import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import UpdateDownloadedToast from "./UpdateDownloadedToast";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const tpl = opts?.defaultValue ?? key;
      if (opts?.version !== undefined) {
        return tpl.replace(/\{\{version\}\}/g, opts.version);
      }
      return tpl;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

let downloadedCallback;

beforeEach(() => {
  downloadedCallback = null;
  window.electron = {
    updates: {
      onDownloaded: vi.fn((cb) => {
        downloadedCallback = cb;
        return vi.fn();
      }),
      quitAndInstallNow: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
});

afterEach(() => {
  cleanup();
  delete window.electron;
});

describe("UpdateDownloadedToast", () => {
  it("stays hidden until the main process dispatches update:downloaded", () => {
    render(<UpdateDownloadedToast />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the version in the title and shows both actions", async () => {
    render(<UpdateDownloadedToast />);
    downloadedCallback({ version: "2.3.4" });
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/Update v2\.3\.4 ready/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart now" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("invokes quitAndInstallNow exactly once when the user clicks Restart now", async () => {
    render(<UpdateDownloadedToast />);
    downloadedCallback({ version: "2.3.4" });
    await waitFor(() => screen.getByRole("alert"));
    fireEvent.click(screen.getByRole("button", { name: "Restart now" }));
    await waitFor(() => expect(window.electron.updates.quitAndInstallNow).toHaveBeenCalledTimes(1));
  });

  it("closes the toast on Dismiss without invoking quitAndInstallNow", async () => {
    render(<UpdateDownloadedToast />);
    downloadedCallback({ version: "2.3.4" });
    await waitFor(() => screen.getByRole("alert"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(window.electron.updates.quitAndInstallNow).not.toHaveBeenCalled();
  });

  it("does not auto-dismiss on a timer (autoHideDuration is null)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<UpdateDownloadedToast />);
      await act(async () => {
        downloadedCallback({ version: "2.3.4" });
      });
      expect(screen.getByRole("alert")).toBeInTheDocument();
      // Simulate 10 minutes of wall-clock; the toast must still be open
      // because MUI's Snackbar has no auto-hide timer scheduled.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      });
      expect(screen.getByRole("alert")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never invokes quitAndInstallNow implicitly on mount", async () => {
    render(<UpdateDownloadedToast />);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(window.electron.updates.quitAndInstallNow).not.toHaveBeenCalled();
  });
});
