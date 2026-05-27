import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import "../../i18nConfig";
import Legend from "./Legend";

const noopColorScale = () => "#000000";

describe("Legend divisor labels", () => {
  it("renders non-zero labels for skewed datasets when the divisor is picked from the max", () => {
    // Skewed `[0, 0, 0, 0, 5e9]`: under a min-based divisor the top label
    // would collapse to "0" because `0.005 * 1e9` rounds away at
    // `maximumFractionDigits: 2`. Max-based divisor keeps the top readable.
    const skewed = [0, 0, 0, 0, 5e9];
    const divisor = 1e9;

    render(
      <Legend
        colorScale={noopColorScale}
        percentileValues={skewed}
        title="Risk"
        divisor={divisor}
      />
    );

    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});

describe("Legend bucket counts", () => {
  it("renders `(N)` next to each level label when bucketCounts is provided", () => {
    render(
      <Legend
        colorScale={noopColorScale}
        percentileValues={[1, 2, 3, 4, 5]}
        title="Risk"
        divisor={1}
        bucketCounts={[3, 0, 7, 1, 12]}
      />
    );

    expect(screen.getByText("Level 1 (3)")).toBeInTheDocument();
    // Zero-count buckets render `(0)` rather than being hidden.
    expect(screen.getByText("Level 2 (0)")).toBeInTheDocument();
    expect(screen.getByText("Level 3 (7)")).toBeInTheDocument();
    expect(screen.getByText("Level 4 (1)")).toBeInTheDocument();
    expect(screen.getByText("Level 5 (12)")).toBeInTheDocument();
  });

  it("preserves the original level labels when bucketCounts is omitted", () => {
    render(
      <Legend
        colorScale={noopColorScale}
        percentileValues={[1, 2, 3, 4, 5]}
        title="Risk"
        divisor={1}
      />
    );

    expect(screen.getByText("Level 1")).toBeInTheDocument();
    expect(screen.getByText("Level 5")).toBeInTheDocument();
    expect(screen.queryByText(/Level 1 \(/)).not.toBeInTheDocument();
  });
});

describe("Legend interactive filter", () => {
  const renderInteractive = (props = {}) => {
    const onToggleLevel = vi.fn();
    const onClearFilter = vi.fn();
    const utils = render(
      <Legend
        colorScale={noopColorScale}
        percentileValues={[1, 2, 3, 4, 5]}
        title="Risk"
        divisor={1}
        bucketCounts={[3, 0, 7, 1, 12]}
        activeLevels={new Set()}
        onToggleLevel={onToggleLevel}
        onClearFilter={onClearFilter}
        {...props}
      />
    );
    return { ...utils, onToggleLevel, onClearFilter };
  };

  it("clicking a level fires onToggleLevel with additive=false", () => {
    const { onToggleLevel } = renderInteractive();

    fireEvent.click(screen.getByRole("button", { name: "Level 3" }));

    expect(onToggleLevel).toHaveBeenCalledWith(3, false);
  });

  it("shift-clicking a level fires onToggleLevel with additive=true", () => {
    const { onToggleLevel } = renderInteractive({ activeLevels: new Set([4]) });

    fireEvent.click(screen.getByRole("button", { name: "Level 5" }), { shiftKey: true });

    expect(onToggleLevel).toHaveBeenCalledWith(5, true);
  });

  it("clicking an empty bucket is a no-op", () => {
    const { onToggleLevel } = renderInteractive();
    const emptyBucketButton = screen.getByRole("button", { name: "Level 2" });

    expect(emptyBucketButton).toBeDisabled();
    fireEvent.click(emptyBucketButton);

    expect(onToggleLevel).not.toHaveBeenCalled();
  });

  it("renders Clear filter only when activeLevels is non-empty", () => {
    const { rerender, onClearFilter } = renderInteractive();

    expect(screen.queryByRole("button", { name: "Clear filter" })).not.toBeInTheDocument();

    rerender(
      <Legend
        colorScale={noopColorScale}
        percentileValues={[1, 2, 3, 4, 5]}
        title="Risk"
        divisor={1}
        bucketCounts={[3, 0, 7, 1, 12]}
        activeLevels={new Set([3])}
        onToggleLevel={vi.fn()}
        onClearFilter={onClearFilter}
      />
    );

    const clearButton = screen.getByRole("button", { name: "Clear filter" });
    fireEvent.click(clearButton);
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });

  it("marks active levels with aria-pressed=true", () => {
    renderInteractive({ activeLevels: new Set([3, 5]) });

    expect(screen.getByRole("button", { name: "Level 1" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "Level 3" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Level 5" })).toHaveAttribute("aria-pressed", "true");
  });
});
