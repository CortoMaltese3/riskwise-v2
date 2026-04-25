import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import ImportScenarioSection from "./ImportScenarioSection";

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

const enqueueMock = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  enqueueToast: (...args) => enqueueMock(...args),
}));

const setupBridge = (importResult) => {
  const importScenario = vi.fn().mockResolvedValue(importResult);
  window.electron = { importScenario };
  return { importScenario };
};

afterEach(() => {
  cleanup();
  enqueueMock.mockReset();
  delete window.electron;
});

describe("ImportScenarioSection", () => {
  it("calls electron.importScenario when Import button is clicked", async () => {
    const { importScenario } = setupBridge({
      success: true,
      scenarioId: "abc-123",
      name: "Egypt flood",
    });

    render(<ImportScenarioSection />);
    const btn = await screen.findByLabelText("import-scenario-bundle");
    fireEvent.click(btn);

    await waitFor(() => expect(importScenario).toHaveBeenCalled());
    await waitFor(() =>
      expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ severity: "success" }))
    );
    expect(await screen.findByText(/Last imported: Egypt flood/i)).toBeInTheDocument();
  });

  it("surfaces an error toast on backend failure", async () => {
    setupBridge({ success: false, reason: "Archive is missing provenance.json" });
    render(<ImportScenarioSection />);
    fireEvent.click(await screen.findByLabelText("import-scenario-bundle"));

    await waitFor(() =>
      expect(enqueueMock).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: expect.stringContaining("provenance.json"),
        })
      )
    );
  });

  it("does not toast when the user cancels the open dialog", async () => {
    setupBridge({ success: false, reason: "cancelled" });
    render(<ImportScenarioSection />);
    fireEvent.click(await screen.findByLabelText("import-scenario-bundle"));

    await waitFor(() => expect(enqueueMock).not.toHaveBeenCalled());
  });
});
