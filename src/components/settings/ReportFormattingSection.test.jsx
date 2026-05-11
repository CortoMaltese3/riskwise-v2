import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import ReportFormattingSection from "./ReportFormattingSection";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

const setupBridge = (initial = { report_locale: "en-US", report_currency: "EUR" }) => {
  const requests = [];
  const request = vi.fn(async (method, path, body) => {
    requests.push({ method, path, body });
    if (method === "GET" && path === "/api/v1/settings") {
      return { success: true, result: { data: initial, status: { code: 2000, message: "ok" } } };
    }
    if (method === "PATCH" && path === "/api/v1/settings") {
      return {
        success: true,
        result: {
          data: { ...initial, ...body },
          status: { code: 2000, message: "ok" },
        },
      };
    }
    return { success: false, error: { code: "unknown", message: "unhandled" } };
  });
  window.api = { http: { request }, onBackendError: vi.fn(() => () => {}) };
  return { request, requests };
};

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  delete window.api;
});

describe("ReportFormattingSection", () => {
  it("hydrates from GET /api/v1/settings on mount", async () => {
    const { request } = setupBridge({ report_locale: "de-DE", report_currency: "USD" });
    render(<ReportFormattingSection />);
    await waitFor(() => expect(request).toHaveBeenCalledWith("GET", "/api/v1/settings", null));
    const localeInput = await screen.findByTestId("report-locale-select");
    const currencyInput = screen.getByTestId("report-currency-select");
    expect(localeInput.value).toBe("de-DE");
    expect(currencyInput.value).toBe("USD");
  });

  it("PATCHes only the changed field when locale is updated", async () => {
    const { request, requests } = setupBridge();
    render(<ReportFormattingSection />);
    await waitFor(() => expect(request).toHaveBeenCalled());

    // Open the locale Select and pick `de-DE`. MUI renders options into a
    // portal so we query by role.
    fireEvent.mouseDown(screen.getByLabelText("settings_report_formatting_locale_label"));
    const option = await screen.findByRole("option", { name: "de-DE" });
    fireEvent.click(option);

    await waitFor(() => {
      const patch = requests.find((r) => r.method === "PATCH");
      expect(patch).toBeTruthy();
      expect(patch.path).toBe("/api/v1/settings");
      expect(patch.body).toEqual({ report_locale: "de-DE" });
    });

    // The store reflects the persisted value after the PATCH echoes back.
    await waitFor(() => {
      expect(screen.getByTestId("report-locale-select").value).toBe("de-DE");
    });
  });

  it("PATCHes only the changed field when currency is updated", async () => {
    const { request, requests } = setupBridge();
    render(<ReportFormattingSection />);
    await waitFor(() => expect(request).toHaveBeenCalled());

    fireEvent.mouseDown(screen.getByLabelText("settings_report_formatting_currency_label"));
    const option = await screen.findByRole("option", { name: "THB" });
    fireEvent.click(option);

    await waitFor(() => {
      const patch = requests.find((r) => r.method === "PATCH");
      expect(patch).toBeTruthy();
      expect(patch.body).toEqual({ report_currency: "THB" });
    });
  });
});
