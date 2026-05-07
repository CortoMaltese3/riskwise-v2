import {
  interpolateRdYlGn,
  interpolateBlues,
  interpolateYlOrBr,
  interpolateReds,
} from "d3-scale-chromatic";
import { scaleSequentialLog } from "d3-scale";

// Continuous ramps for the exposure log-scale legend. Mirrors `colorScales.js`:
// the active `theme.palette.viz.ramps.{...}` definition determines the hazard
// colour family + the interpolator domain. Truncated domains (dark mode) are
// applied by remapping `t` into the ramp's slice before calling the
// interpolator. The reverse default (1 - t) preserves the legacy direction.
const INTERPOLATORS = {
  Blues: interpolateBlues,
  Reds: interpolateReds,
  YlOrBr: interpolateYlOrBr,
};

const RAMP_KEY_BY_HAZARD = {
  flood: "flood",
  drought: "drought",
  heatwaves: "heatwave",
};

const buildRampInterpolator = (rampDef) => {
  const fn = INTERPOLATORS[rampDef.interpolator];
  if (!fn) {
    return (t) => interpolateRdYlGn(0.2 + 0.8 * (1 - t));
  }
  const [start, end] = rampDef.domain;
  // Reverse direction so the warm/dark end of the ramp lines up with the
  // higher exposure values (the legacy `interpolateXxxReversed` behaviour).
  return (t) => fn(start + (end - start) * (1 - t));
};

export const getColorScale = (hazard, ramps) => {
  const key = RAMP_KEY_BY_HAZARD[hazard];
  if (!key || !ramps?.[key]) {
    // Default to the diverging RdYlGn ramp; not part of the new viz.ramps set
    // because no map currently uses it as a hazard ramp.
    return (t) => interpolateRdYlGn(0.2 + 0.8 * (1 - t));
  }
  return buildRampInterpolator(ramps[key]);
};

export const getScaleLegacy = (hazard, maxValue, minValue, ramps) => {
  const colorScale = getColorScale(hazard, ramps);
  // `minValue` is intentionally unused — the previous implementation also
  // ignored it in favour of a fixed `maxValue * 0.005` floor. Keeping the
  // signature stable so the map call sites don't need to change.
  void minValue;
  const adjustedMin = maxValue * 0.005;
  return scaleSequentialLog(colorScale).domain([maxValue, adjustedMin]);
};
