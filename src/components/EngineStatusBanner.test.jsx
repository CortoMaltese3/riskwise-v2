import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import EngineStatusBanner from "./EngineStatusBanner";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key, opts) => opts?.defaultValue ?? _key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

beforeEach(() => {
  window.electron = {
    engine: {
      checkBlocked: vi.fn(),
      downloadUpdate: vi.fn(),
    },
  };
});

afterEach(() => {
  cleanup();
  delete window.electron;
});

describe("EngineStatusBanner", () => {
  it("renders nothing when the engine is in range", async () => {
    window.electron.engine.checkBlocked.mockResolvedValue({ ok: true, blocked: false });
    render(<EngineStatusBanner />);
    await waitFor(() => expect(window.electron.engine.checkBlocked).toHaveBeenCalled());
    expect(screen.queryByText(/Engine update required/)).toBeNull();
  });

  it("shows the blocker when the cached engine is out of range", async () => {
    window.electron.engine.checkBlocked.mockResolvedValue({
      ok: true,
      blocked: true,
      manifestVersion: "2.1.0",
      cachedEngineVersion: "1.9.0",
    });
    render(<EngineStatusBanner />);
    await waitFor(() => screen.getByText(/Engine update required/));
  });

  it("surfaces manifest verification errors as a blocker", async () => {
    window.electron.engine.checkBlocked.mockResolvedValue({
      error: "Manifest signature did not verify",
    });
    render(<EngineStatusBanner />);
    await waitFor(() => screen.getByText(/Manifest signature did not verify/));
  });

  it("invokes downloadUpdate when the user clicks Download update", async () => {
    window.electron.engine.checkBlocked.mockResolvedValue({ ok: true, blocked: true });
    window.electron.engine.downloadUpdate.mockResolvedValue({ ok: true, version: "2.1.0" });
    render(<EngineStatusBanner />);
    await waitFor(() => screen.getByText("Download update"));
    fireEvent.click(screen.getByText("Download update"));
    await waitFor(() => expect(window.electron.engine.downloadUpdate).toHaveBeenCalled());
  });
});
