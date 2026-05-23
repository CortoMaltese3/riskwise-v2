import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import "./Legend.css";
import { formatNumberDivisor } from "../../lib/formatNumber";

const Legend = ({ colorScale, percentileValues, title, divisor, bucketCounts }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const isAscending = percentileValues[0] < percentileValues[percentileValues.length - 1];

  // Create a color block for each percentile value
  const blockHeight = 20;
  const colorBlocks = percentileValues.map((value, index) => (
    <div
      key={index}
      style={{
        backgroundColor: colorScale(value),
        width: `${100 / percentileValues.length}%`,
        height: `${blockHeight}px`,
      }}
    />
  ));

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
    </div>
  );
};

Legend.propTypes = {
  colorScale: PropTypes.func.isRequired,
  percentileValues: PropTypes.arrayOf(PropTypes.number).isRequired,
  title: PropTypes.string.isRequired,
  divisor: PropTypes.number,
  bucketCounts: PropTypes.arrayOf(PropTypes.number),
};

export default Legend;
