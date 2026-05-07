import {
  schemeReds,
  schemeBlues,
  schemeYlOrBr,
  schemeYlOrRd,
  interpolateReds,
  interpolateBlues,
  interpolateYlOrBr,
  interpolateYlOrRd,
} from "d3-scale-chromatic";

// D3 sequential ramps referenced by name from `theme.palette.viz.ramps` so the
// theme stays color-system-agnostic and the maps can switch ramp on hazard
// without importing d3 themselves.
const SCHEMES = {
  Blues: schemeBlues,
  Reds: schemeReds,
  YlOrBr: schemeYlOrBr,
  YlOrRd: schemeYlOrRd,
};

const INTERPOLATORS = {
  Blues: interpolateBlues,
  Reds: interpolateReds,
  YlOrBr: interpolateYlOrBr,
  YlOrRd: interpolateYlOrRd,
};

const RAMP_KEY_BY_HAZARD = {
  flood: "flood",
  drought: "drought",
  heatwaves: "heatwave",
};

const SAMPLE_COUNT = 5;

// Resolves a `viz.ramps.{flood,heatwave,drought,risk}` definition into 5
// concrete colours. When the domain is the full `[0, 1]` we use D3's
// pre-baked `schemeXxx[9]` array sliced to the dark end (matches the previous
// light-mode behaviour). For truncated domains (the dark-mode ramps) we
// sample the matching `interpolateXxx` continuously so the unreadable pale
// steps are clipped cleanly.
const resolveRamp = (rampDef) => {
  const { interpolator, domain } = rampDef;
  const [start, end] = domain;
  if (start === 0 && end === 1) {
    const scheme = SCHEMES[interpolator];
    return scheme[9].slice(-SAMPLE_COUNT);
  }
  const fn = INTERPOLATORS[interpolator];
  return Array.from({ length: SAMPLE_COUNT }, (_, i) =>
    fn(start + ((end - start) * i) / (SAMPLE_COUNT - 1))
  );
};

const getColorScale = (hazard, ramps) => {
  const key = RAMP_KEY_BY_HAZARD[hazard] ?? "risk";
  return resolveRamp(ramps[key]);
};

export const getScale = (hazard, percentileValues, ramps) => {
  const colors = getColorScale(hazard, ramps);
  const isAscending = percentileValues[0] < percentileValues[percentileValues.length - 1];

  return (value) => {
    if (isAscending) {
      if (value < percentileValues[0]) return colors[0];
      if (value >= percentileValues[percentileValues.length - 1]) return colors[colors.length - 1];
      for (let i = 0; i < percentileValues.length - 1; i++) {
        if (value >= percentileValues[i] && value < percentileValues[i + 1]) {
          return colors[i];
        }
      }
    } else {
      if (value > percentileValues[0]) return colors[0];
      if (value <= percentileValues[percentileValues.length - 1]) return colors[colors.length - 1];
      for (let i = 0; i < percentileValues.length - 1; i++) {
        if (value <= percentileValues[i] && value > percentileValues[i + 1]) {
          return colors[i];
        }
      }
    }
  };
};
