import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { Box, Paper, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";

import useUIStore from "../../store/useUIStore";
import useTileLayerUrl from "./useTileLayerUrl";

// Per-provider attribution lines. Each upstream provider requires a credit
// line, so the attribution control updates in lockstep with setUrl() when
// the user switches basemaps.
const ATTRIBUTIONS = Object.freeze({
  voyager:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  dark: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  satellite:
    "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
});

const BASEMAP_OPTIONS = [
  { key: "voyager", labelKey: "map_controls_basemap_light" },
  { key: "dark", labelKey: "map_controls_basemap_dark" },
  { key: "satellite", labelKey: "map_controls_basemap_satellite" },
];

// Positioned top-left so the card doesn't collide with the right-anchored
// RP / admin button rows already mounted on the three map screens.
const containerSx = {
  position: "absolute",
  top: 1.25,
  left: 1.25,
  zIndex: 1000,
  display: "flex",
  flexDirection: "column",
  gap: 0.75,
  p: 1,
  minWidth: 180,
  pointerEvents: "auto",
};

const attributionFor = (basemap, offlineMode) =>
  offlineMode ? "" : (ATTRIBUTIONS[basemap] ?? ATTRIBUTIONS.voyager);

// Owns the single base TileLayer for the map: created on mount, mutated
// in place via setUrl() on store changes (no React-driven remount).
// Also wires Leaflet's standard scale bar at the bottom-left.
const MapControls = () => {
  const map = useMap();
  const { t } = useTranslation();
  const basemap = useUIStore((s) => s.basemap);
  const setBasemap = useUIStore((s) => s.setBasemap);
  const offlineMode = useUIStore((s) => s.offlineMode);
  const tileUrl = useTileLayerUrl(basemap);

  const tileLayerRef = useRef(null);
  const attributionRef = useRef(null);

  // Mount-only: create the base tile layer + scale bar. The mutation
  // effect below keeps URL / attribution in sync; this effect
  // intentionally reads only the initial values so subsequent changes
  // don't recreate the layer.
  useEffect(() => {
    const initialAttribution = attributionFor(basemap, offlineMode);
    const layer = L.tileLayer(tileUrl, {
      maxZoom: 15,
      minZoom: 5,
      attribution: initialAttribution,
    }).addTo(map);
    tileLayerRef.current = layer;
    attributionRef.current = initialAttribution;

    const scale = L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

    return () => {
      // Attribution added imperatively via addAttribution() (see the
      // update effect) is not tracked by the layer, so strip it explicitly
      // before removing the layer to avoid orphaned credit lines after a
      // basemap-then-country switch.
      if (attributionRef.current && map.attributionControl) {
        map.attributionControl.removeAttribution(attributionRef.current);
      }
      map.removeLayer(layer);
      scale.remove();
      tileLayerRef.current = null;
      attributionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Mutate URL + attribution in place when the store changes.
  useEffect(() => {
    const layer = tileLayerRef.current;
    if (!layer) return;
    layer.setUrl(tileUrl);
    const next = attributionFor(basemap, offlineMode);
    if (attributionRef.current !== next) {
      if (attributionRef.current && map.attributionControl) {
        map.attributionControl.removeAttribution(attributionRef.current);
      }
      if (next && map.attributionControl) {
        map.attributionControl.addAttribution(next);
      }
      attributionRef.current = next;
    }
  }, [tileUrl, basemap, offlineMode, map]);

  const showSelector = !offlineMode;

  const handleBasemapChange = (_event, value) => {
    // ToggleButtonGroup yields null when the active button is re-clicked.
    if (value === null || value === undefined) return;
    setBasemap(value);
  };

  return (
    <Paper elevation={3} sx={containerSx} data-testid="map-controls">
      {showSelector ? (
        <Box>
          <Typography
            variant="caption"
            sx={{ display: "block", mb: 0.25, fontWeight: 600 }}
            id="map-basemap-label"
          >
            {t("map_controls_basemap_label")}
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={basemap}
            onChange={handleBasemapChange}
            aria-labelledby="map-basemap-label"
            fullWidth
          >
            {BASEMAP_OPTIONS.map(({ key, labelKey }) => (
              <ToggleButton key={key} value={key} aria-label={t(labelKey)}>
                {t(labelKey)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      ) : (
        <Tooltip title={t("map_controls_basemap_offline_tooltip")} placement="right">
          <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
            {t("map_controls_basemap_offline_tooltip")}
          </Typography>
        </Tooltip>
      )}
    </Paper>
  );
};

export default MapControls;
export { ATTRIBUTIONS, BASEMAP_OPTIONS };
