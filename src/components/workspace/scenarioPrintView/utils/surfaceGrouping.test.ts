import { describe, it, expect } from "vitest";

import { EMPTY_SURFACE_COUNTS, surfaceKey, type SurfaceKey } from "./surfaceGrouping";

describe("surfaceGrouping", () => {
  it("EMPTY_SURFACE_COUNTS has zero for every known surface", () => {
    expect(EMPTY_SURFACE_COUNTS).toEqual({
      hazard: 0,
      exposure: 0,
      impact: 0,
      adaptation: 0,
      other: 0,
    });
  });

  it.each<["hazard" | "exposure" | "impact" | "adaptation", SurfaceKey]>([
    ["hazard", "hazard"],
    ["exposure", "exposure"],
    ["impact", "impact"],
    ["adaptation", "adaptation"],
  ])("maps known surface %s to itself", (input, expected) => {
    expect(surfaceKey({ surface: input })).toBe(expected);
  });

  it("falls back to 'other' for a null surface", () => {
    expect(surfaceKey({ surface: null })).toBe("other");
  });

  it("falls back to 'other' for an unknown surface string", () => {
    // The backend schema is permissive — anything outside the four known
    // surfaces is bucketed into "other" so the renderer never crashes on a
    // newly added tag.
    expect(surfaceKey({ surface: "mystery" as unknown as null })).toBe("other");
  });
});
