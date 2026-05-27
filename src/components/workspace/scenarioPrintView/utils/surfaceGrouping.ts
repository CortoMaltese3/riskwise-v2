import type { SnapshotItem } from "../../../../lib/RiskWiseClient";

export type SurfaceKey = "hazard" | "exposure" | "impact" | "adaptation" | "other";

export type SurfaceCounts = Record<SurfaceKey, number>;

export const EMPTY_SURFACE_COUNTS: SurfaceCounts = {
  hazard: 0,
  exposure: 0,
  impact: 0,
  adaptation: 0,
  other: 0,
};

const KNOWN_SURFACES: ReadonlySet<SurfaceKey> = new Set([
  "hazard",
  "exposure",
  "impact",
  "adaptation",
]);

export const surfaceKey = (snap: Pick<SnapshotItem, "surface">): SurfaceKey => {
  const raw = snap.surface ?? "other";
  return KNOWN_SURFACES.has(raw as SurfaceKey) ? (raw as SurfaceKey) : "other";
};
