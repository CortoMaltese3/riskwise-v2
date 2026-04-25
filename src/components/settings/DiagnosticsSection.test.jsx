import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import DiagnosticsSection from "./DiagnosticsSection";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key, opts) => {
      if (opts && typeof opts === "object" && opts.defaultValue) {
        let out = opts.defaultValue;
        for (const [k, v] of Object.entries(opts)) {
          if (k === "defaultValue") continue;
          out = out.replace(`{{${k}}}`, String(v));
        }
        return out;
      }
      return _key;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

const baseSentryStatus = {
  initialized: false,
  reason: "no_consent",
  dsnConfigured: true,
  consent: null,
  offline: false,
  shouldPromptConsent: false,
};

const setupBridge = (overrides = {}) => {
  const exportZip = vi.fn().mockResolvedValue({
    ok: true,
    filePath: "C:/Users/test/Desktop/riskwise-diagnostics-2026.zip",
    entryCount: 5,
  });
  const getSentryStatus = vi.fn().mockResolvedValue({ ...baseSentryStatus, ...overrides });
  const setSentryConsent = vi.fn().mockResolvedValue({ ...baseSentryStatus, consent: "opted_in" });
  window.electron = {
    diagnostics: { exportZip, getSentryStatus, setSentryConsent },
  };
  return { exportZip, getSentryStatus, setSentryConsent };
};

afterEach(() => {
  cleanup();
  delete window.electron;
});

describe("DiagnosticsSection", () => {
  it("calls diagnostics.exportZip and shows the saved path on success", async () => {
    const { exportZip } = setupBridge();
    render(<DiagnosticsSection />);
    const button = await screen.findByTestId("diagnostics-export");
    fireEvent.click(button);
    await waitFor(() => expect(exportZip).toHaveBeenCalled());
    expect(
      await screen.findByText(/Diagnostics saved to .*riskwise-diagnostics-2026\.zip/i)
    ).toBeInTheDocument();
  });

  it("does not show success toast when the user cancels the save dialog", async () => {
    const { exportZip } = setupBridge();
    exportZip.mockResolvedValueOnce({ canceled: true });
    render(<DiagnosticsSection />);
    fireEvent.click(await screen.findByTestId("diagnostics-export"));
    await waitFor(() => expect(exportZip).toHaveBeenCalled());
    expect(screen.queryByText(/Diagnostics saved to/i)).not.toBeInTheDocument();
  });

  it("shows the offline-mode banner when crash reporting is disabled by offline", async () => {
    setupBridge({ offline: true, dsnConfigured: true });
    render(<DiagnosticsSection />);
    expect(
      await screen.findByText(/Crash reporting disabled in offline mode/i)
    ).toBeInTheDocument();
  });

  it("shows 'no DSN' message when the build has no Sentry DSN configured", async () => {
    setupBridge({ dsnConfigured: false, offline: false });
    render(<DiagnosticsSection />);
    expect(
      await screen.findByText(/Crash reporting is not available in this build/i)
    ).toBeInTheDocument();
  });

  it("opens the consent dialog on first launch and persists opt-in", async () => {
    const { setSentryConsent } = setupBridge({ shouldPromptConsent: true });
    render(<DiagnosticsSection />);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /Yes, opt in/i }));
    await waitFor(() => expect(setSentryConsent).toHaveBeenCalledWith(true));
  });

  it("lets a user toggle opt-in / opt-out from the buttons when DSN is configured", async () => {
    const { setSentryConsent } = setupBridge({
      dsnConfigured: true,
      offline: false,
      consent: "opted_out",
      shouldPromptConsent: false,
    });
    render(<DiagnosticsSection />);
    const optIn = await screen.findByRole("button", { name: /^Opt in$/i });
    fireEvent.click(optIn);
    await waitFor(() => expect(setSentryConsent).toHaveBeenCalledWith(true));
  });
});
