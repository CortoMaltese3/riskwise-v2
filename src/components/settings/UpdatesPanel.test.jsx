import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import UpdatesPanel from "./UpdatesPanel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key, opts) => opts?.defaultValue ?? _key,
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
    // Version appears twice: as current-version label and as release tag.
    expect(screen.getAllByText(/v2\.0\.1/).length).toBeGreaterThanOrEqual(1);
    await waitFor(() => expect(screen.getByTestId("markdown")).toBeInTheDocument());
    expect(screen.getByTestId("markdown").textContent).toContain("new map");
  });

  it("triggers a check when the user clicks Check for updates", async () => {
    render(<UpdatesPanel />);
    await waitFor(() => screen.getByText("Check for updates"));
    fireEvent.click(screen.getByText("Check for updates"));
    await waitFor(() => expect(window.electron.updates.check).toHaveBeenCalled());
  });

  it("persists a channel change through setChannel", async () => {
    render(<UpdatesPanel />);
    await waitFor(() => screen.getByText("Beta"));
    fireEvent.click(screen.getByRole("radio", { name: "Beta" }));
    await waitFor(() => expect(window.electron.updates.setChannel).toHaveBeenCalledWith("beta"));
  });

  it("calls downgrade when the user clicks Downgrade to previous version", async () => {
    render(<UpdatesPanel />);
    await waitFor(() => screen.getByText("Downgrade to previous version"));
    fireEvent.click(screen.getByText("Downgrade to previous version"));
    await waitFor(() => expect(window.electron.updates.downgrade).toHaveBeenCalled());
  });
});
