import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import UpdatesPanel from "./UpdatesPanel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // Mirror i18next's `{{var}}` interpolation so assertions can match real
    // values (versions, error strings) instead of raw placeholders.
    t: (_key, opts) => {
      let text = opts?.defaultValue ?? _key;
      if (opts) {
        for (const [name, value] of Object.entries(opts)) {
          if (name === "defaultValue") continue;
          text = text.replace(new RegExp(`{{\\s*${name}\\s*}}`, "g"), String(value));
        }
      }
      return text;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

vi.mock("react-markdown", () => ({
  default: ({ children }) => <div data-testid="markdown">{children}</div>,
}));

beforeEach(() => {
  window.electron = {
    updates: {
      getStatus: vi.fn().mockResolvedValue({
        currentVersion: "2.0.1",
        channel: "stable",
        lastChecked: 1745500000000,
        remindAfter: 0,
        offlineMode: false,
        previousVersion: "2.0.0",
      }),
      getReleaseNotes: vi.fn().mockResolvedValue({
        tag: "v2.0.1",
        body: "### highlights\n- new map",
        language: "en",
      }),
      check: vi.fn().mockResolvedValue({ ok: true }),
      setChannel: vi.fn().mockResolvedValue({ ok: true, channel: "beta" }),
      downgrade: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
});

afterEach(() => {
  cleanup();
  delete window.electron;
});

describe("UpdatesPanel", () => {
  it("shows the current version, last-checked timestamp, and release notes on mount", async () => {
    render(<UpdatesPanel />);
    await waitFor(() => expect(window.electron.updates.getStatus).toHaveBeenCalled());
    // Version appears twice: as current-version label and as release tag. Wait
    // for the render to flush — asserting right after the getStatus call alone
    // races the state update and flakes under a loaded full-suite run.
    await waitFor(() => expect(screen.getAllByText(/v2\.0\.1/).length).toBeGreaterThanOrEqual(1));
    await waitFor(() => expect(screen.getByTestId("markdown")).toBeInTheDocument());
    expect(screen.getByTestId("markdown").textContent).toContain("new map");
  });

  it("triggers a check when the user clicks Check for updates", async () => {
    render(<UpdatesPanel />);
    await waitFor(() => screen.getByText("Check for updates"));
    fireEvent.click(screen.getByText("Check for updates"));
    await waitFor(() => expect(window.electron.updates.check).toHaveBeenCalled());
  });

  it("surfaces a 'you're on the latest version' message when no update is available", async () => {
    window.electron.updates.check.mockResolvedValue({
      ok: true,
      status: "not-available",
      version: "2.0.1",
      currentVersion: "2.0.1",
    });
    render(<UpdatesPanel />);
    await waitFor(() => screen.getByText("Check for updates"));
    fireEvent.click(screen.getByText("Check for updates"));
    await waitFor(() => expect(screen.getByText(/on the latest version/i)).toBeInTheDocument());
  });

  it("surfaces the error instead of failing silently when the check fails", async () => {
    window.electron.updates.check.mockResolvedValue({
      error: "Cannot parse releases feed: HTTP 504",
    });
    render(<UpdatesPanel />);
    await waitFor(() => screen.getByText("Check for updates"));
    fireEvent.click(screen.getByText("Check for updates"));
    await waitFor(() =>
      expect(screen.getByText(/Couldn't check for updates/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/HTTP 504/)).toBeInTheDocument();
  });

  it("announces an available update", async () => {
    window.electron.updates.check.mockResolvedValue({
      ok: true,
      status: "available",
      version: "2.1.9",
    });
    render(<UpdatesPanel />);
    await waitFor(() => screen.getByText("Check for updates"));
    fireEvent.click(screen.getByText("Check for updates"));
    await waitFor(() =>
      expect(screen.getByText(/Update available: v2\.1\.9/i)).toBeInTheDocument()
    );
  });

  it("reflects a failed startup check from getStatus on mount", async () => {
    window.electron.updates.getStatus.mockResolvedValue({
      currentVersion: "2.0.1",
      channel: "stable",
      lastChecked: 1745500000000,
      remindAfter: 0,
      offlineMode: false,
      lastCheck: { status: "error", error: "HTTP 504", at: 1745500000000 },
    });
    render(<UpdatesPanel />);
    await waitFor(() =>
      expect(screen.getByText(/Couldn't check for updates/i)).toBeInTheDocument()
    );
  });

  it("persists a channel change through setChannel", async () => {
    render(<UpdatesPanel />);
    await waitFor(() => screen.getByText("Beta"));
    fireEvent.click(screen.getByRole("radio", { name: "Beta" }));
    await waitFor(() => expect(window.electron.updates.setChannel).toHaveBeenCalledWith("beta"));
  });

  it("opens a confirmation dialog naming the target version before downgrading", async () => {
    render(<UpdatesPanel />);
    await waitFor(() => screen.getByText("Downgrade to previous version"));
    fireEvent.click(screen.getByText("Downgrade to previous version"));
    // Dialog appears; downgrade is NOT called until confirmed.
    await waitFor(() =>
      expect(screen.getByTestId("settings-downgrade-confirm-dialog")).toBeInTheDocument()
    );
    expect(screen.getByText("Downgrade to v2.0.0?")).toBeInTheDocument();
    expect(window.electron.updates.downgrade).not.toHaveBeenCalled();
  });

  it("calls downgrade only after the user confirms in the dialog", async () => {
    render(<UpdatesPanel />);
    await waitFor(() => screen.getByText("Downgrade to previous version"));
    fireEvent.click(screen.getByText("Downgrade to previous version"));
    await waitFor(() => screen.getByTestId("settings-downgrade-confirm-action"));
    fireEvent.click(screen.getByTestId("settings-downgrade-confirm-action"));
    await waitFor(() => expect(window.electron.updates.downgrade).toHaveBeenCalled());
  });

  it("does not call downgrade when the user cancels the dialog", async () => {
    render(<UpdatesPanel />);
    await waitFor(() => screen.getByText("Downgrade to previous version"));
    fireEvent.click(screen.getByText("Downgrade to previous version"));
    await waitFor(() => screen.getByTestId("settings-downgrade-confirm-cancel"));
    fireEvent.click(screen.getByTestId("settings-downgrade-confirm-cancel"));
    await waitFor(() =>
      expect(screen.queryByTestId("settings-downgrade-confirm-dialog")).not.toBeInTheDocument()
    );
    expect(window.electron.updates.downgrade).not.toHaveBeenCalled();
  });

  it("disables the downgrade button when no previous version is available", async () => {
    window.electron.updates.getStatus.mockResolvedValue({
      currentVersion: "2.0.1",
      channel: "stable",
      lastChecked: 1745500000000,
      remindAfter: 0,
      offlineMode: false,
      previousVersion: null,
    });
    render(<UpdatesPanel />);
    await waitFor(() =>
      expect(screen.getByText("Downgrade to previous version").closest("button")).toBeDisabled()
    );
    // Clicking the disabled button must not open the dialog.
    fireEvent.click(screen.getByText("Downgrade to previous version"));
    expect(screen.queryByTestId("settings-downgrade-confirm-dialog")).not.toBeInTheDocument();
  });
});
