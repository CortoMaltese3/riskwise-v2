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

beforeEach(() => {
  availableCallback = null;
  window.electron = {
    updates: {
      onAvailable: vi.fn((cb) => {
        availableCallback = cb;
        return vi.fn();
      }),
      installOnNextRestart: vi.fn().mockResolvedValue({ ok: true }),
      remindLater: vi.fn().mockResolvedValue({ ok: true }),
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

  it("never calls installOnNextRestart implicitly on mount (no auto-restart)", async () => {
    render(<UpdateDialog />);
    // Simulate no event coming in.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.electron.updates.installOnNextRestart).not.toHaveBeenCalled();
  });
});
