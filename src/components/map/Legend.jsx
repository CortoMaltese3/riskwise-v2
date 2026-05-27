import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import "./Legend.css";
import { formatNumberDivisor } from "../../lib/formatNumber";

const Legend = ({
  colorScale,
  percentileValues,
  title,
  divisor,
  bucketCounts,
  activeLevels,
  onToggleLevel,
  onClearFilter,
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const isAscending = percentileValues[0] < percentileValues[percentileValues.length - 1];

  const blockHeight = 20;
  const interactive = typeof onToggleLevel === "function";
  const hasActiveSelection = !!activeLevels && activeLevels.size > 0;

  const isLevelActive = (levelIndex) => !!activeLevels && activeLevels.has(levelIndex + 1);

  // Empty buckets render as visible no-ops so users see the dataset has no
  // features at that level rather than triggering a filter that hides
  // everything (#476's per-bucket counts inform this affordance).
  const isBucketEmpty = (levelIndex) =>
    Array.isArray(bucketCounts) &&
    levelIndex < bucketCounts.length &&
    bucketCounts[levelIndex] === 0;

  const handleClick = (levelIndex, event) => {
    if (!interactive) return;
    if (isBucketEmpty(levelIndex)) return;
    onToggleLevel(levelIndex + 1, event.shiftKey);
  };

  const colorBlocks = percentileValues.map((value, index) => {
    const active = isLevelActive(index);
    const empty = isBucketEmpty(index);
    const classes = ["color-block"];
    if (interactive && !empty) classes.push("color-block-interactive");
    if (active) classes.push("color-block-active");
    if (interactive && empty) classes.push("color-block-empty");
    return (
      <button
        key={index}
        type="button"
        className={classes.join(" ")}
        aria-pressed={active}
        aria-label={`${t("level")} ${index + 1}`}
        disabled={interactive && empty}
        onClick={(event) => handleClick(index, event)}
        style={{
          backgroundColor: colorScale(value),
          width: `${100 / percentileValues.length}%`,
          height: `${blockHeight}px`,
        }}
      />
    );
  });

  const valueLabels = isAscending ? percentileValues : [...percentileValues].reverse();

  return (
    <div className="legend-container">
      <div className="legend-title">{title}</div>
      <div className="color-blocks" style={{ display: "flex", width: "100%" }}>
        {colorBlocks}
      </div>
      <div
        className="value-labels"
        style={{
          display: "flex",
          width: "100%",
          flexDirection: isAscending ? "row" : "row-reverse",
        }}
      >
        {valueLabels.map((value, index) => (
          <span key={index} className={isAscending ? "value-label-left" : "value-label-right"}>
            {formatNumberDivisor(value, divisor, locale)}
          </span>
        ))}
      </div>
      <div className="legend-labels">
        {Array.from({ length: percentileValues.length }, (_, i) => {
          const base = `${t("level")} ${i + 1}`;
          const hasCount = Array.isArray(bucketCounts) && i < bucketCounts.length;
          return hasCount ? `${base} (${bucketCounts[i]})` : base;
        }).map((level, index) => (
          <div key={index} className="legend-label">
            {level}
          </div>
        ))}
      </div>
      {interactive && hasActiveSelection && (
        <button
          type="button"
          className="legend-clear-filter"
          onClick={() => onClearFilter && onClearFilter()}
        >
          {t("map_legend_clear_filter")}
        </button>
      )}
    </div>
  );
};

Legend.propTypes = {
  colorScale: PropTypes.func.isRequired,
  percentileValues: PropTypes.arrayOf(PropTypes.number).isRequired,
  title: PropTypes.string.isRequired,
  divisor: PropTypes.number,
  bucketCounts: PropTypes.arrayOf(PropTypes.number),
  activeLevels: PropTypes.instanceOf(Set),
  onToggleLevel: PropTypes.func,
  onClearFilter: PropTypes.func,
};

export default Legend;
