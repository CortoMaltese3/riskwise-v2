import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import UpdateDialog from "./UpdateDialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key, opts) => opts?.defaultValue ?? _key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

let availableCallback;
let progressCallback;
let releaseNotesResolver;

beforeEach(() => {
  availableCallback = null;
  progressCallback = null;
  releaseNotesResolver = null;
  window.electron = {
    updates: {
      onAvailable: vi.fn((cb) => {
        availableCallback = cb;
        return vi.fn();
      }),
      onDownloadProgress: vi.fn((cb) => {
        progressCallback = cb;
        return vi.fn();
      }),
      installOnNextRestart: vi.fn().mockResolvedValue({ ok: true }),
      remindLater: vi.fn().mockResolvedValue({ ok: true }),
      skipVersion: vi.fn().mockResolvedValue({ ok: true }),
      getReleaseNotes: vi.fn(
        () =>
          new Promise((resolve) => {
            releaseNotesResolver = resolve;
          })
      ),
    },
  };
});

afterEach(() => {
  cleanup();
  delete window.electron;
});

describe("UpdateDialog", () => {
  it("stays hidden until the main process dispatches update:available", () => {
    render(<UpdateDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the version from the event payload", async () => {
    render(<UpdateDialog />);
    availableCallback({ version: "2.3.4" });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByText(/2\.3\.4/)).toBeInTheDocument();
  });

  it("calls installOnNextRestart when the user clicks Install", async () => {
    render(<UpdateDialog />);
    availableCallback({ version: "2.3.4" });
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByText("Install on next restart"));
    await waitFor(() => expect(window.electron.updates.installOnNextRestart).toHaveBeenCalled());
  });

  it("calls remindLater when the user clicks Remind me later", async () => {
    render(<UpdateDialog />);
    availableCallback({ version: "2.3.4" });
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByText("Remind me later"));
    await waitFor(() => expect(window.electron.updates.remindLater).toHaveBeenCalled());
  });

  it("calls skipVersion with the dispatched version when the user clicks Skip this version", async () => {
    render(<UpdateDialog />);
    availableCallback({ version: "2.3.4" });
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByText("Skip this version"));
    await waitFor(() => expect(window.electron.updates.skipVersion).toHaveBeenCalledWith("2.3.4"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows a loading hint while release notes are being fetched, then renders them", async () => {
    render(<UpdateDialog />);
    availableCallback({ version: "2.3.4" });
    await waitFor(() => screen.getByRole("dialog"));
    expect(screen.getByTestId("update-dialog-notes-loading")).toBeInTheDocument();

    releaseNotesResolver({
      body: "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8",
      language: "en",
    });
    await waitFor(() => expect(screen.getByTestId("update-dialog-notes")).toBeInTheDocument());
    expect(window.electron.updates.getReleaseNotes).toHaveBeenCalledWith({ language: "en" });
    const notesBlock = screen.getByTestId("update-dialog-notes");
    expect(notesBlock.textContent).toContain("Line 1");
    expect(notesBlock.textContent).toContain("Line 6");
    expect(notesBlock.textContent).not.toContain("Line 7");
  });

  it("falls back silently when release-notes fetch returns an error", async () => {
    render(<UpdateDialog />);
    availableCallback({ version: "2.3.4" });
    await waitFor(() => screen.getByRole("dialog"));
    releaseNotesResolver({ error: "offline" });
    await waitFor(() => expect(screen.queryByTestId("update-dialog-notes-loading")).toBeNull());
    expect(screen.queryByTestId("update-dialog-notes")).toBeNull();
    // The actions remain interactive even without notes.
    expect(screen.getByText("Install on next restart")).not.toBeDisabled();
  });

  it("never calls installOnNextRestart implicitly on mount (no auto-restart)", async () => {
    render(<UpdateDialog />);
    // Simulate no event coming in.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.electron.updates.installOnNextRestart).not.toHaveBeenCalled();
  });

  it("closes without snoozing when dismissed via the backdrop", async () => {
    render(<UpdateDialog />);
    availableCallback({ version: "2.3.4" });
    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.click(document.querySelector(".MuiBackdrop-root"));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The 24h snooze is reserved for the explicit "Remind me later" button.
    expect(window.electron.updates.remindLater).not.toHaveBeenCalled();
  });

  it("blocks dismissal (and does not snooze) while a download is in progress", async () => {
    // installOnNextRestart resolves only when the download finishes, so keep
    // it pending to hold the dialog in its downloading state.
    let resolveInstall;
    window.electron.updates.installOnNextRestart = vi.fn(
      () => new Promise((resolve) => (resolveInstall = resolve))
    );

    render(<UpdateDialog />);
    availableCallback({ version: "2.3.4" });
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByText("Install on next restart"));
    await waitFor(() =>
      expect(screen.getByTestId("update-dialog-downloading")).toBeInTheDocument()
    );

    fireEvent.click(document.querySelector(".MuiBackdrop-root"));

    // Still open, still no snooze.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(window.electron.updates.remindLater).not.toHaveBeenCalled();

    resolveInstall({ ok: true });
  });

  it("shows download progress forwarded from the main process", async () => {
    window.electron.updates.installOnNextRestart = vi.fn(() => new Promise(() => {}));

    render(<UpdateDialog />);
    availableCallback({ version: "2.3.4" });
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByText("Install on next restart"));
    await waitFor(() =>
      expect(screen.getByTestId("update-dialog-downloading")).toBeInTheDocument()
    );

    progressCallback({ percent: 42.6 });

    await waitFor(() =>
      expect(screen.getByTestId("update-dialog-downloading").textContent).toContain("43%")
    );
  });

  it("surfaces an error and re-enables actions when the download fails", async () => {
    window.electron.updates.installOnNextRestart = vi.fn().mockResolvedValue({ error: "network" });

    render(<UpdateDialog />);
    availableCallback({ version: "2.3.4" });
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByText("Install on next restart"));

    await waitFor(() =>
      expect(screen.getByTestId("update-dialog-download-error")).toBeInTheDocument()
    );
    // Dialog stays open so the user can retry.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Install on next restart")).not.toBeDisabled();
  });
});
