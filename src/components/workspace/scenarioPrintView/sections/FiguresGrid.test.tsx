import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts === "object") {
        const parts = Object.entries(opts).map(([k, v]) => `${k}=${String(v)}`);
        return parts.length ? `${key}|${parts.join(",")}` : key;
      }
      return key;
    },
  }),
}));

vi.mock("../../../charts/WaterfallChart", () => ({
  default: () => <div data-testid="waterfall-chart" />,
}));

vi.mock("../../../charts/CostBenefitChart", () => ({
  default: () => <div data-testid="costben-chart" />,
}));

import { FiguresGrid } from "./FiguresGrid";
import type { SnapshotFigure } from "../hooks/useSnapshotFigures";
import { EMPTY_SURFACE_COUNTS, type SurfaceKey } from "../utils/surfaceGrouping";

const emptyBuckets = (): Record<SurfaceKey, SnapshotFigure[]> => ({
  hazard: [],
  exposure: [],
  impact: [],
  adaptation: [],
  other: [],
});

const baseProps = () => {
  let figureN = 0;
  return {
    figuresBySurface: emptyBuckets(),
    availableSurfaceCounts: { ...EMPTY_SURFACE_COUNTS },
    waterfallData: null,
    costbenData: null,
    showWaterfall: false,
    showCostBenefit: false,
    hasCostbenMeasures: false,
    hasOtherVisuals: false,
    formatNumberLocale: (v: number) => String(v),
    nextFigureNumber: () => ++figureN,
    renderFigureCaption: (key: string) => <span data-testid="caption-figure">{key}</span>,
    renderTableCaption: (key: string) => <span data-testid="caption-table">{key}</span>,
    onImageSettled: () => {},
  };
};

describe("FiguresGrid", () => {
  it("renders the four per-surface sections with the no-results fallback when no data", () => {
    render(<FiguresGrid {...baseProps()} />);
    expect(screen.getByTestId("print-section-hazard")).toBeInTheDocument();
    expect(screen.getByTestId("print-section-exposure")).toBeInTheDocument();
    expect(screen.getByTestId("print-section-impact")).toBeInTheDocument();
    expect(screen.getByTestId("print-section-cost-benefit")).toBeInTheDocument();
    expect(screen.getByTestId("print-impact-missing")).toBeInTheDocument();
    expect(screen.getByTestId("print-costben-missing")).toBeInTheDocument();
    expect(screen.queryByTestId("print-section-other-visuals")).toBeNull();
  });

  it("routes a hazard snapshot into the hazard slot and not into other slots", () => {
    const props = baseProps();
    const hazardFig: SnapshotFigure = {
      id: "h1",
      title: "Hazard map",
      caption: "caption-h",
      snapshotType: "map",
      surface: "hazard",
      imageUrl: "blob:fake-1",
    };
    props.figuresBySurface = { ...emptyBuckets(), hazard: [hazardFig] };

    render(<FiguresGrid {...props} />);

    const hazardSlot = screen.getByTestId("snapshots-slot-hazard");
    expect(within(hazardSlot).getByTestId("snapshot-figure-h1")).toBeInTheDocument();
    const exposureSlot = screen.getByTestId("snapshots-slot-exposure");
    expect(within(exposureSlot).queryByTestId("snapshot-figure-h1")).toBeNull();
  });

  it("renders the Other Visuals section when hasOtherVisuals is true", () => {
    const props = baseProps();
    const otherFig: SnapshotFigure = {
      id: "o1",
      title: null,
      caption: null,
      snapshotType: "map",
      surface: "other",
      imageUrl: "blob:fake-2",
    };
    props.figuresBySurface = { ...emptyBuckets(), other: [otherFig] };
    props.hasOtherVisuals = true;

    render(<FiguresGrid {...props} />);
    expect(screen.getByTestId("print-section-other-visuals")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("snapshots-slot-other")).getByTestId("snapshot-figure-o1")
    ).toBeInTheDocument();
  });
});
