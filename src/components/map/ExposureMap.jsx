import React, { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Box, Button } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { MapContainer, GeoJSON, useMap } from "react-leaflet";

import "leaflet/dist/leaflet.css";
import { formatNumber } from "../../lib/formatNumber";
import { getScaleLegacy } from "../../utils/colorScalesLegacy";
import LegendLegacy from "./LegendLegacy";
import MapControls from "./MapControls";
import RiskWiseClient from "../../lib/RiskWiseClient";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";

const adminLayers = [0, 1, 2]; // Administrative layers

const ExposureMap = () => {
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedExposureCategory = useWorkspaceStore((s) => s.selectedExposureCategory);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
  const setActiveMapRef = useUIStore((s) => s.setActiveMapRef);
  const isEconomic = selectedExposureCategory === "economic" || selectedExposureCategory === null;
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const mapRefSet = useRef(false);
  const theme = useTheme();
  const vizRamps = theme.palette.viz.ramps;

  const [activeAdminLayer, setActiveAdminLayer] = useState(0);
  const [mapInfo, setMapInfo] = useState({ geoJson: null, colorScale: null });
  const [maxValue, setMaxValue] = useState(null);
  const [minValue, setMinValue] = useState(null);
  const [unit, setUnit] = useState("");

  const fetchGeoJson = async (layer) => {
    // Served by the main-process `app://` handler (`/__temp/<file>`) — see
    // HazardMap for the rationale on the same-origin URL.
    const res = await RiskWiseClient.fetchGeoJson("app://./__temp/exposures_geodata.json");
    if (!res.success) {
      console.error("Error fetching GeoJSON data:", res.error.message);
      setMapInfo({ geoJson: null, colorScale: null });
      return;
    }
    try {
      const data = res.result;
      setUnit(data._metadata.unit);
      const filteredFeatures = data.features.filter(
        (feature) => feature.properties.layer === layer
      );
      const filteredData = { ...data, features: filteredFeatures };
      const values = filteredFeatures.map((f) => f.properties.value);
      const minValue = Math.min(...values);
      setMinValue(minValue);
      const maxValue = Math.max(...values);
      setMaxValue(maxValue);
      const scale = getScaleLegacy(selectedHazard, maxValue, minValue, vizRamps);

      setMapInfo({ geoJson: filteredData, colorScale: scale });
    } catch (error) {
      console.error("Error processing GeoJSON data:", error);
      setMapInfo({ geoJson: null, colorScale: null });
    }
  };

  const handleAdminLayerChange = async (newLayer) => {
    await fetchGeoJson(newLayer);
    setActiveAdminLayer(newLayer);
  };

  const style = (feature) => {
    return {
      fillColor: mapInfo.colorScale
        ? mapInfo.colorScale(feature.properties.value)
        : "var(--mui-palette-common-white)",
      weight: 2,
      opacity: 1,
      color: "white",
      dashArray: "3",
      fillOpacity: 0.7,
    };
  };

  const adminButtonStyle = (layer) => ({
    flex: "0 0 auto",
    // Floor wide enough to fit the natural width of "Admin 2" so all three
    // buttons line up. textTransform:none disables MUI's default ALL-CAPS.
    minWidth: 9,
    px: 1,
    fontSize: "0.75rem",
    whiteSpace: "nowrap",
    textTransform: "none",
    bgcolor: layer === activeAdminLayer ? "primary.dark" : "primary.main",
    "&:hover": { bgcolor: "secondary.main" },
  });

  // Right-anchored, gap-spaced row that wraps on narrow map widths so the
  // group never overflows the map viewport or clips long localized labels.
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

  const onEachFeature = (feature, layer) => {
    if (feature.properties) {
      const country = feature.properties["country"];
      let value = feature.properties.value;
      const name = feature.properties.name;

      // Check if the value should be rounded up for non-economic exposure
      if (!isEconomic) {
        value = Math.ceil(value);
      }

      layer.bindPopup(
        `${t("map_exposure_popup_country")}: ${country}<br>${t(
          "map_exposure_button_admin"
        )}: ${name}<br>${t("map_exposure_popup_value")}: ${formatNumber(value, locale)} ${unit}`
      );
    }
  };

  useEffect(() => {
    if (activeAdminLayer !== null) {
      fetchGeoJson(activeAdminLayer);
    }
  }, [activeAdminLayer]);

  // Re-fetch as soon as the backend signals the exposure GeoJSON is ready,
  // so the layer paints mid-run instead of waiting for the final ``result``
  // event to arrive at run completion.
  useEffect(() => {
    if (!window.electron?.onProgress) {
      return undefined;
    }
    return window.electron.onProgress((payload) => {
      if (payload?.step === "exposure_ready") {
        fetchGeoJson(activeAdminLayer);
      }
    });
  }, [activeAdminLayer]);

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

  return (
    <MapContainer
      key={selectedCountry}
      center={countryCoordinates[selectedCountry] || [30.0, 31.0]}
      zoom={6}
      // See HazardMap: percentage height inside flex-column Paper resolves
      // to 0; switch to flex sizing on the main axis.
      style={{ position: "relative", flex: 1, minHeight: 0, width: "100%" }}
    >
      <MapControls />
      <MapEvents />
      <Box sx={buttonContainerSx}>
        {adminLayers.map((layer) => (
          <Button
            key={`admin-${layer}`}
            size="small"
            sx={adminButtonStyle(layer)}
            onClick={() => handleAdminLayerChange(layer)}
            variant="contained"
          >
            {t("map_exposure_button_admin")} {layer}
          </Button>
        ))}
      </Box>
      {mapInfo.geoJson && mapInfo.colorScale && (
        <>
          <GeoJSON
            key={`${selectedCountry}-${activeAdminLayer}`}
            data={mapInfo.geoJson}
            style={style}
            onEachFeature={onEachFeature}
          />
          <LegendLegacy
            colorScale={mapInfo.colorScale}
            maxValue={maxValue}
            minValue={minValue}
            unit={unit}
            type={isEconomic ? "economic" : "non-economic"}
          />
        </>
      )}
    </MapContainer>
  );
};

export default ExposureMap;
