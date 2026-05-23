import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMap } from "react-leaflet";
import L from "leaflet";
import {
  Box,
  Paper,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";

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
// in place via setUrl() / setOpacity() on store changes (no React-driven
// remount). Also wires Leaflet's standard scale bar at the bottom-left.
const MapControls = () => {
  const map = useMap();
  const { t } = useTranslation();
  const basemap = useUIStore((s) => s.basemap);
  const basemapOpacity = useUIStore((s) => s.basemapOpacity);
  const setBasemap = useUIStore((s) => s.setBasemap);
  const setBasemapOpacity = useUIStore((s) => s.setBasemapOpacity);
  const offlineMode = useUIStore((s) => s.offlineMode);
  const tileUrl = useTileLayerUrl(basemap);

  const tileLayerRef = useRef(null);
  const attributionRef = useRef(null);
  // Local slider value during drag so subscribers don't re-render on every
  // tick — committed to the store on release via onChangeCommitted. The
  // tile layer's opacity is still mutated live in onChange for a smooth
  // visual update.
  const [draftOpacity, setDraftOpacity] = useState(basemapOpacity);

  useEffect(() => {
    setDraftOpacity(basemapOpacity);
  }, [basemapOpacity]);

  // Mount-only: create the base tile layer + scale bar. The mutation
  // effect below keeps URL / attribution / opacity in sync; this effect
  // intentionally reads only the initial values so subsequent changes
  // don't recreate the layer.
  useEffect(() => {
    const initialAttribution = attributionFor(basemap, offlineMode);
    const layer = L.tileLayer(tileUrl, {
      maxZoom: 15,
      minZoom: 5,
      opacity: basemapOpacity,
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

  // Mutate URL + attribution + opacity in place when the store changes.
  useEffect(() => {
    const layer = tileLayerRef.current;
    if (!layer) return;
    layer.setUrl(tileUrl);
    layer.setOpacity(basemapOpacity);
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
  }, [tileUrl, basemap, offlineMode, basemapOpacity, map]);

  const showSelector = !offlineMode;
  const opacityPercent = Math.round(draftOpacity * 100);

  const handleBasemapChange = (_event, value) => {
    // ToggleButtonGroup yields null when the active button is re-clicked.
    if (value === null || value === undefined) return;
    setBasemap(value);
  };

  const handleOpacityChange = (_event, value) => {
    const numeric = Array.isArray(value) ? value[0] : value;
    const next = numeric / 100;
    setDraftOpacity(next);
    const layer = tileLayerRef.current;
    if (layer) layer.setOpacity(next);
  };

  const handleOpacityCommit = (_event, value) => {
    const numeric = Array.isArray(value) ? value[0] : value;
    setBasemapOpacity(numeric / 100);
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
      <Box>
        <Typography
          variant="caption"
          sx={{ display: "block", mb: 0.25, fontWeight: 600 }}
          id="map-opacity-label"
        >
          {t("map_controls_opacity_label")} ({opacityPercent}%)
        </Typography>
        <Slider
          aria-labelledby="map-opacity-label"
          value={opacityPercent}
          min={0}
          max={100}
          step={1}
          onChange={handleOpacityChange}
          onChangeCommitted={handleOpacityCommit}
          size="small"
        />
      </Box>
    </Paper>
  );
};

export default MapControls;
export { ATTRIBUTIONS, BASEMAP_OPTIONS };
