import React, { useEffect, useState, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import L from "leaflet";
import "leaflet-simple-map-screenshoter";
import { Box, Button } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

import "leaflet/dist/leaflet.css";
import { getScale } from "../../utils/colorScales";
import { formatNumberDivisor } from "../../lib/formatNumber";
import Legend from "./Legend";
import RiskWiseClient from "../../lib/RiskWiseClient";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import useTileLayerUrl from "./useTileLayerUrl";

// Pixel radius for impact-map markers — independent of geographic zoom so each
// centroid stays visible and clickable at any zoom level.
const IMPACT_MARKER_RADIUS_PX = 7;

const RiskMap = () => {
  const tileLayerUrl = useTileLayerUrl();
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
  const setActiveMapRef = useUIStore((s) => s.setActiveMapRef);
  const setAlertMessage = useUIStore((s) => s.setAlertMessage);
  const setAlertSeverity = useUIStore((s) => s.setAlertSeverity);
  const setAlertShowMessage = useUIStore((s) => s.setAlertShowMessage);
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const mapRefSet = useRef(false);
  const theme = useTheme();
  const vizRamps = theme.palette.viz.ramps;

  const [activeRPLayer, setActiveRPLayer] = useState(null);
  const [legendTitle, setLegendTitle] = useState("");
  const [mapInfo, setMapInfo] = useState({ geoJson: null, colorScale: null });
  const [percentileValues, setPercentileValues] = useState({});
  const [returnPeriods, setReturnPeriods] = useState([]);
  const [unit, setUnit] = useState("");
  const [suffix, setSuffix] = useState("");
  const [divisor, setDivisor] = useState(1);

  const getSuffixAndDivisor = (value) => {
    if (value >= 1e9) return { suffix: t("map_legend_title_billions_suffix"), divisor: 1e9 };
    if (value >= 1e6) return { suffix: t("map_legend_title_millions_suffix"), divisor: 1e6 };
    if (value >= 1e3) return { suffix: t("map_legend_title_thousands_suffix"), divisor: 1e3 };
    return { suffix: "", divisor: 1 };
  };

  const updateLegendTitle = (unit, suffix) => {
    return `Risk${
      unit
        ? ` (${unit}${suffix ? ` ${t("map_legend_legacy_title_in_suffix")} ${suffix}` : ""})`
        : ""
    }`;
  };

  const fetchGeoJson = useCallback(
    async (rpLayer) => {
      // Served by the main-process `app://` handler (`/__temp/<file>`) —
      // see HazardMap for the rationale on the same-origin URL.
      const res = await RiskWiseClient.fetchGeoJson("app://./__temp/risks_geodata.json");
      if (!res.success) {
        console.error("Error fetching GeoJSON data:", res.error.message);
        setMapInfo({ geoJson: null, colorScale: null });
        // No impact centroids — either the temp file is missing
        // (ERR_FILE_NOT_FOUND) or fetch couldn't reach the handler at all
        // (TypeError "Failed to fetch"). Both surface the same alert.
        const msg = res.error.message;
        if (msg.includes("ERR_FILE_NOT_FOUND") || msg === "Failed to fetch") {
          setAlertMessage(t("alert_message_risk_map_no_impact"));
          setAlertSeverity("info");
          setAlertShowMessage(true);
        }
        return;
      }

      try {
        const data = res.result;

        // Set return periods and initially set activeRPLayer
        const returnPeriods = data._metadata.return_periods;
        setReturnPeriods(returnPeriods);
        if (activeRPLayer === null && returnPeriods.length > 0) {
          // Only set if not already set
          setActiveRPLayer(returnPeriods[0]);
        }
        setPercentileValues(data._metadata.percentile_values);
        setUnit(data._metadata.unit);

        // On the very first render `activeRPLayer` is still ``null`` so the
        // effect fires fetchGeoJson(null). Falling back to the first return
        // period lets us paint the map immediately AND avoids a race where
        // the failing null-fetch's catch block clobbers a successful follow-
        // up fetch's mapInfo (white-map regression).
        const effectiveRP = rpLayer ?? (returnPeriods.length > 0 ? returnPeriods[0] : null);
        const rpKey = effectiveRP === null ? null : `rp${effectiveRP}`;
        if (rpKey && data._metadata.percentile_values && data._metadata.percentile_values[rpKey]) {
          const scale = getScale(selectedHazard, data._metadata.percentile_values[rpKey], vizRamps);
          setMapInfo({ geoJson: data, colorScale: scale });

          // Calculate minimum non-zero value
          const values = data._metadata.percentile_values[rpKey];
          const minAbsValue = Math.min(...values.filter((v) => v !== 0).map(Math.abs));
          const { suffix, divisor } = getSuffixAndDivisor(minAbsValue);
          setDivisor(divisor);
          setSuffix(suffix);
        } else {
          throw new Error("Percentile values are missing or incomplete.");
        }
      } catch (error) {
        console.error("Error processing GeoJSON data:", error);
        setMapInfo({ geoJson: null, colorScale: null });
      }
    },
    [selectedHazard, activeRPLayer, vizRamps]
  );

  useEffect(() => {
    setLegendTitle(updateLegendTitle(unit, suffix));
  }, [unit, suffix]); // Update the legend title when unit or suffix changes

  const CircleLayer = ({ data, colorScale }) => {
    const map = useMap();

    useEffect(() => {
      const layerGroup = L.layerGroup().addTo(map);

      data.features.forEach((feature) => {
        const { coordinates } = feature.geometry;
        const value = feature.properties[`rp${activeRPLayer}`];
        const level = feature.properties[`rp${activeRPLayer}_level`];
        const country = feature.properties["country"];
        const name = feature.properties["name"];
        const formattedValue = formatNumberDivisor(value, divisor, locale);
        const impactLine = unit ? `${formattedValue} ${unit}` : formattedValue;

        L.circleMarker([coordinates[1], coordinates[0]], {
          color: theme.palette.common.white,
          fillColor: colorScale(value),
          fillOpacity: 0.7,
          weight: 1.5,
          radius: IMPACT_MARKER_RADIUS_PX,
        })
          .bindPopup(
            `${t("country")}: ${country}<br>${t("admin")} 2: ${name}<br>` +
              `${t("level")}: ${level}<br>${t("map_impact_popup_impact")}: ${impactLine}`
          )
          .addTo(layerGroup);
      });

      return () => layerGroup.clearLayers();
    }, [data, colorScale, map]);

    return null;
  };

  CircleLayer.propTypes = {
    data: PropTypes.shape({
      features: PropTypes.arrayOf(
        PropTypes.shape({
          geometry: PropTypes.shape({
            coordinates: PropTypes.arrayOf(PropTypes.number).isRequired,
          }).isRequired,
          properties: PropTypes.shape({
            [`rp${activeRPLayer}`]: PropTypes.number.isRequired,
            country: PropTypes.string.isRequired,
            name: PropTypes.string.isRequired,
          }).isRequired,
        }).isRequired
      ).isRequired,
    }).isRequired,
    colorScale: PropTypes.func.isRequired,
  };

  const handleRPLayerChange = async (rp) => {
    setActiveRPLayer(rp);
    await fetchGeoJson(rp);
  };

  const RPButtonStyle = (rp) => ({
    flex: "0 0 auto",
    // Floor at 7 spacing units so "RP2" pads up to the natural width of
    // "RP100" — keeps the row visually uniform without clipping long labels.
    minWidth: 7,
    px: 1,
    fontSize: "0.75rem",
    whiteSpace: "nowrap",
    bgcolor: rp === activeRPLayer ? "primary.dark" : "primary.main",
    "&:hover": { bgcolor: "secondary.main" },
  });

  // Right-anchored, gap-spaced row that wraps on narrow map widths so the
  // group never overflows the map viewport or clips a long ``RP100`` label.
  const buttonContainerSx = {
    position: "absolute",
    top: 1.25,
    right: 1.25,
    zIndex: 1000,
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 0.5,
    justifyContent: "flex-end",
    maxWidth: (theme) => `calc(100% - ${theme.spacing(2.5)})`,
  };

  const countryCoordinates = {
    egypt: [26.8206, 30.8025],
    thailand: [15.87, 100.9925],
  };

  useEffect(() => {
    fetchGeoJson(activeRPLayer);
  }, [activeRPLayer, fetchGeoJson]);

  const MapEvents = () => {
    const map = useMap();

    useEffect(() => {
      if (!mapRefSet.current) {
        setActiveMapRef(map);
        mapRefSet.current = true; // Update the ref to indicate that setActiveMapRef has been called
      }
      // Leaflet measures the container at mount time. When the map is mounted
      // inside a freshly-shown flex pane (Display Map toggle, Risk Assessment
      // re-entry) the container can briefly be 0×0, which leaves the tile
      // layer un-rendered until a manual resize. Force a remeasure on next
      // tick so tiles always paint.
      const id = window.requestAnimationFrame(() => map.invalidateSize());
      return () => window.cancelAnimationFrame(id);
    }, [map, setActiveMapRef]);

    return null;
  };

  useEffect(() => {
    fetchGeoJson(activeRPLayer);
  }, [activeRPLayer, fetchGeoJson]);

  // Re-fetch mid-run when the backend signals the impact GeoJSON is ready.
  useEffect(() => {
    if (!window.electron?.onProgress) {
      return undefined;
    }
    return window.electron.onProgress((payload) => {
      if (payload?.step === "impact_ready") {
        fetchGeoJson(activeRPLayer);
      }
    });
  }, [activeRPLayer, fetchGeoJson]);

  return (
    <MapContainer
      key={selectedCountry}
      center={countryCoordinates[selectedCountry] || [30.0, 31.0]}
      zoom={6}
      // See HazardMap: percentage height inside flex-column Paper resolves
      // to 0; switch to flex sizing on the main axis.
      style={{ position: "relative", flex: 1, minHeight: 0, width: "100%" }}
    >
      <TileLayer url={tileLayerUrl} maxZoom={15} minZoom={5} />
      <MapEvents />
      <Box sx={buttonContainerSx}>
        {returnPeriods.map((rp) => (
          <Button
            key={`rp-${rp}`}
            size="small"
            sx={RPButtonStyle(rp)}
            onClick={() => handleRPLayerChange(rp)}
            variant="contained"
          >
            {t("return_period")}
            {rp}
          </Button>
        ))}
      </Box>
      {mapInfo.geoJson && mapInfo.colorScale && (
        <>
          <CircleLayer
            data={mapInfo.geoJson}
            colorScale={mapInfo.colorScale}
            activeRPLayer={activeRPLayer}
          />
          <Legend
            colorScale={mapInfo.colorScale}
            percentileValues={percentileValues ? percentileValues[`rp${activeRPLayer}`] : []}
            title={legendTitle}
            divisor={divisor}
          />
        </>
      )}
    </MapContainer>
  );
};

export default RiskMap;
