import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import UpdateDialog from "./UpdateDialog";
import useUpdateStore from "../store/useUpdateStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key, opts) => opts?.defaultValue ?? _key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

const INSTALL_LABEL = "Download & install on restart";

let availableCallback;
let releaseNotesResolver;

beforeEach(() => {
  availableCallback = null;
  releaseNotesResolver = null;
  window.electron = {
    updates: {
      onAvailable: vi.fn((cb) => {
        availableCallback = cb;
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
  useUpdateStore.getState().reset();
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

  it("starts the download and closes when the user clicks install", async () => {
    render(<UpdateDialog />);
    availableCallback({ version: "2.3.4" });
    await waitFor(() => screen.getByRole("dialog"));

    fireEvent.click(screen.getByText(INSTALL_LABEL));

    await waitFor(() => expect(window.electron.updates.installOnNextRestart).toHaveBeenCalled());
    // Hands off to the (non-modal) progress chip and closes the dialog.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
    expect(screen.getByText(INSTALL_LABEL)).not.toBeDisabled();
  });

  it("never starts a download implicitly on mount (no auto-restart)", async () => {
    render(<UpdateDialog />);
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
});
