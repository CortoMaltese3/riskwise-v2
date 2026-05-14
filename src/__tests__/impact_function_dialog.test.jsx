import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
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

  it("renders no Edit affordance — viewer is strictly read-only", () => {
    renderDialog();
    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
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
