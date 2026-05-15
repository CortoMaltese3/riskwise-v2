import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import theme from "../theme/theme";

// Resolve i18n keys against the real English bundle so tests can assert on
// human-readable text (and catch any key drift). Interpolation handled
// inline — react-i18next is not in the loop.
import enLocale from "../locales/en.json";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const base = enLocale[key] ?? key;
      if (opts && typeof opts === "object") {
        return Object.entries(opts).reduce(
          (out, [k, v]) => out.replaceAll(`{{${k}}}`, String(v)),
          base
        );
      }
      return base;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

// Stub the canvas-backed Line chart — assert the data props are wired through
// instead of relying on jsdom for canvas.
const lineSpy = vi.fn();
vi.mock("react-chartjs-2", () => ({
  Line: (props) => {
    lineSpy(props);
    return <div data-testid="impact-function-line-chart" />;
  },
}));
vi.mock("chart.js", () => ({
  Chart: { register: vi.fn() },
  CategoryScale: {},
  LinearScale: {},
  LineElement: {},
  PointElement: {},
  Title: {},
  Tooltip: {},
  Legend: {},
}));

const validateImpactFunctionMock = vi.fn();
vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    validateImpactFunction: (...args) => validateImpactFunctionMock(...args),
  },
}));

import ImpactFunctionDialog from "../components/dialogs/ImpactFunctionDialog";

const SPEC = {
  id: 101,
  name: "Buddhist monks",
  haz_type: "FL",
  exp_type: "Buddhist monks",
  intensity_unit: "m",
  intensity: [0.0, 0.5, 1.0, 2.0],
  mdd: [0.0, 0.2, 0.5, 1.0],
  paa: [1.0, 1.0, 1.0, 1.0],
};

const renderDialog = (props = {}) =>
  render(
    <ThemeProvider theme={theme}>
      <ImpactFunctionDialog open onClose={() => {}} impactFunction={SPEC} {...props} />
    </ThemeProvider>
  );

afterEach(() => {
  cleanup();
  lineSpy.mockClear();
});

describe("ImpactFunctionDialog", () => {
  it("renders the header with id, name, and intensity unit", () => {
    renderDialog();
    expect(screen.getByText("Impact function 101 — Buddhist monks")).toBeInTheDocument();
    expect(screen.getByText("Intensity unit: m")).toBeInTheDocument();
  });

  it("renders the 3-column intensity/mdd/paa table", () => {
    renderDialog();
    const table = screen.getByTestId("impact-function-table");
    expect(table).toBeInTheDocument();
    const rows = table.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(SPEC.intensity.length);
    // First data row reflects the first entry verbatim — no rounding/formatting.
    const firstCells = rows[0].querySelectorAll("td");
    expect(firstCells[0].textContent).toBe(String(SPEC.intensity[0]));
    expect(firstCells[1].textContent).toBe(String(SPEC.mdd[0]));
    expect(firstCells[2].textContent).toBe(String(SPEC.paa[0]));
  });

  it("hands MDD and PAA curves to the chart on a single x-axis", () => {
    renderDialog();
    expect(lineSpy).toHaveBeenCalled();
    const props = lineSpy.mock.calls[lineSpy.mock.calls.length - 1][0];
    expect(props.data.datasets).toHaveLength(2);
    expect(props.data.datasets[0].data).toEqual(SPEC.mdd);
    expect(props.data.datasets[1].data).toEqual(SPEC.paa);
    // Two-line single chart over (intensity, fraction): the chart options use
    // a linear x-axis with the intensity unit, not stacked subplots.
    expect(props.options.scales.x.type).toBe("linear");
  });

  it("renders no Edit affordance in ERA mode — canonical IFs are read-only", () => {
    renderDialog();
    expect(screen.queryByTestId("impact-function-editor-enter")).toBeNull();
  });

  it("invokes onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole("button", { name: enLocale.close }));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when no spec is supplied", () => {
    render(
      <ThemeProvider theme={theme}>
        <ImpactFunctionDialog open onClose={() => {}} impactFunction={null} />
      </ThemeProvider>
    );
    expect(screen.queryByTestId("impact-function-line-chart")).toBeNull();
  });
});

describe("ImpactFunctionDialog edit mode (#453)", () => {
  beforeEach(() => {
    validateImpactFunctionMock.mockReset();
  });

  const renderCustom = (props = {}) =>
    render(
      <ThemeProvider theme={theme}>
        <ImpactFunctionDialog
          open
          onClose={() => {}}
          impactFunction={SPEC}
          mode="custom"
          {...props}
        />
      </ThemeProvider>
    );

  it("shows the Edit affordance in custom mode", () => {
    renderCustom();
    expect(screen.getByTestId("impact-function-editor-enter")).toBeInTheDocument();
  });

  it("renders editable inputs after entering edit mode and updates the chart live", () => {
    renderCustom();
    fireEvent.click(screen.getByTestId("impact-function-editor-enter"));
    const mddInput = screen.getByTestId("impact-function-editor-mdd-2");
    fireEvent.change(mddInput, { target: { value: "0.9" } });
    // The chart sees the modified series on the next render — live preview.
    const props = lineSpy.mock.calls[lineSpy.mock.calls.length - 1][0];
    expect(props.data.datasets[0].data[2]).toBeCloseTo(0.9);
  });

  it("posts the candidate to the validator on save and writes the override back on success", async () => {
    validateImpactFunctionMock.mockResolvedValue({
      success: true,
      result: { data: { valid: true, errors: [] }, status: { code: 2000, message: "ok" } },
    });
    const onSaveOverride = vi.fn();
    renderCustom({ onSaveOverride });

    fireEvent.click(screen.getByTestId("impact-function-editor-enter"));
    fireEvent.change(screen.getByTestId("impact-function-editor-mdd-2"), {
      target: { value: "0.6" },
    });
    fireEvent.click(screen.getByTestId("impact-function-editor-save"));

    await waitFor(() => expect(onSaveOverride).toHaveBeenCalled());
    const saved = onSaveOverride.mock.calls[0][0];
    expect(saved.mdd[2]).toBeCloseTo(0.6);
    expect(validateImpactFunctionMock).toHaveBeenCalled();
  });

  it("renders per-field errors when validation fails and does not save", async () => {
    validateImpactFunctionMock.mockResolvedValue({
      success: true,
      result: {
        data: {
          valid: false,
          errors: [
            { field: "intensity[2]", code: "not_non_decreasing", message: "intensity must climb" },
          ],
        },
        status: { code: 2000, message: "ok" },
      },
    });
    const onSaveOverride = vi.fn();
    renderCustom({ onSaveOverride });

    fireEvent.click(screen.getByTestId("impact-function-editor-enter"));
    fireEvent.click(screen.getByTestId("impact-function-editor-save"));

    await waitFor(() =>
      expect(screen.getByTestId("impact-function-editor-errors")).toBeInTheDocument()
    );
    expect(onSaveOverride).not.toHaveBeenCalled();
  });

  it("Cancel discards edits and exits edit mode without saving", () => {
    const onSaveOverride = vi.fn();
    renderCustom({ onSaveOverride });

    fireEvent.click(screen.getByTestId("impact-function-editor-enter"));
    fireEvent.change(screen.getByTestId("impact-function-editor-mdd-2"), {
      target: { value: "0.99" },
    });
    fireEvent.click(screen.getByTestId("impact-function-editor-cancel"));

    // Back to read-only — the Edit button reappears, no MDD-2 input.
    expect(screen.getByTestId("impact-function-editor-enter")).toBeInTheDocument();
    expect(screen.queryByTestId("impact-function-editor-mdd-2")).toBeNull();
    expect(onSaveOverride).not.toHaveBeenCalled();
  });

  it("shows the Modified badge when a pending override is supplied", () => {
    renderCustom({ pendingOverride: { ...SPEC, mdd: [0.0, 0.4, 0.7, 1.0] } });
    expect(screen.getByTestId("impact-function-modified-badge")).toBeInTheDocument();
  });
});
