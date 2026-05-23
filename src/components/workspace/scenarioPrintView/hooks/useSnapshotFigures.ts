import { useCallback, useEffect, useState } from "react";

import RiskWiseClient, { type SnapshotItem } from "../../../../lib/RiskWiseClient";
import logger from "../../../../lib/logger";
import {
  EMPTY_SURFACE_COUNTS,
  surfaceKey,
  type SurfaceCounts,
  type SurfaceKey,
} from "../utils/surfaceGrouping";

export interface SnapshotFigure {
  id: string;
  title: string | null;
  caption: string | null;
  snapshotType: string;
  surface: SurfaceKey;
  imageUrl: string;
}

export interface UseSnapshotFiguresResult {
  figures: SnapshotFigure[];
  snapshotsResolved: boolean;
  availableSurfaceCounts: SurfaceCounts;
  allImagesSettled: boolean;
  onImageSettled: () => void;
}

export const useSnapshotFigures = (
  scenarioId: string,
  snapshotIds: string[] | undefined
): UseSnapshotFiguresResult => {
  const [figures, setFigures] = useState<SnapshotFigure[]>([]);
  const [availableSurfaceCounts, setAvailableSurfaceCounts] =
    useState<SurfaceCounts>(EMPTY_SURFACE_COUNTS);
  const [snapshotsResolved, setSnapshotsResolved] = useState(false);
  const [imagesSettled, setImagesSettled] = useState(0);

  // Stabilise the effect's dependency: snapshotIds is a fresh array on every
  // render from the parent, so memoise on its joined contents.
  const snapshotIdsKey = (snapshotIds ?? []).join(",");

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    (async () => {
      try {
        const listResp = await RiskWiseClient.listSnapshots(scenarioId);
        if (cancelled) return;

        if (!listResp.success || listResp.result?.status?.code !== 2000) {
          logger.warn("useSnapshotFigures: listSnapshots failed", {
            scenario_id: scenarioId,
            error: listResp.success ? listResp.result?.status : listResp.error,
          });
          setFigures([]);
          setAvailableSurfaceCounts(EMPTY_SURFACE_COUNTS);
          setSnapshotsResolved(true);
          return;
        }

        const all = listResp.result.data ?? [];
        // Count only what the user could have picked: the picker shows
        // map-type snapshots, so the "available but not selected" notice
        // mirrors that surface.
        const counts: SurfaceCounts = { ...EMPTY_SURFACE_COUNTS };
        for (const s of all) {
          if (s.snapshot_type !== "map") continue;
          counts[surfaceKey(s)] += 1;
        }
        setAvailableSurfaceCounts(counts);

        const ids = snapshotIdsKey ? snapshotIdsKey.split(",") : [];
        if (ids.length === 0) {
          setFigures([]);
          setSnapshotsResolved(true);
          setImagesSettled(0);
          return;
        }

        const byId = new Map<string, SnapshotItem>(all.map((s) => [s.id, s]));
        const ordered = ids.map((id) => byId.get(id)).filter((s): s is SnapshotItem => Boolean(s));

        const fetched = await Promise.all(
          ordered.map(async (snap): Promise<SnapshotFigure | null> => {
            const resp = await RiskWiseClient.fetchSnapshotImage(snap.id);
            if (!resp.success) {
              logger.warn("useSnapshotFigures: snapshot image fetch failed", {
                snapshot_id: snap.id,
                error: resp.error,
              });
              return null;
            }
            const url = URL.createObjectURL(resp.result);
            createdUrls.push(url);
            return {
              id: snap.id,
              title: snap.title ?? null,
              caption: snap.caption ?? null,
              snapshotType: snap.snapshot_type,
              surface: surfaceKey(snap),
              imageUrl: url,
            };
          })
        );

        if (cancelled) return;
        setFigures(fetched.filter((f): f is SnapshotFigure => f !== null));
        setImagesSettled(0);
        setSnapshotsResolved(true);
      } catch (err: unknown) {
        if (cancelled) return;
        logger.error("useSnapshotFigures: pipeline failed", {
          scenario_id: scenarioId,
          error: err instanceof Error ? err.message : String(err),
        });
        setFigures([]);
        setAvailableSurfaceCounts(EMPTY_SURFACE_COUNTS);
        setSnapshotsResolved(true);
      }
    })();

    return () => {
      cancelled = true;
      createdUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [scenarioId, snapshotIdsKey]);

  const onImageSettled = useCallback(() => {
    setImagesSettled((n) => n + 1);
  }, []);

  const allImagesSettled = figures.length === 0 || imagesSettled >= figures.length;

  return {
    figures,
    snapshotsResolved,
    availableSurfaceCounts,
    allImagesSettled,
    onImageSettled,
  };
};

export default useSnapshotFigures;
