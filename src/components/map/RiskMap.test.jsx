import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import enLocale from "../../locales/en.json";
import theme from "../../theme/theme";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => enLocale[key] ?? key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

// Capture mocks shared across cases — declared here so the leaflet/react-leaflet
// factories below can close over them.
const circleMarkerInstance = {
  bindPopup: vi.fn().mockReturnThis(),
  addTo: vi.fn().mockReturnThis(),
};
const circleMarkerMock = vi.fn(() => circleMarkerInstance);
const circleMock = vi.fn();
const layerGroupMock = vi.fn(() => ({
  addTo: vi.fn().mockReturnThis(),
  clearLayers: vi.fn(),
}));

vi.mock("leaflet", () => ({
  default: {
    circleMarker: (...args) => circleMarkerMock(...args),
    circle: (...args) => circleMock(...args),
    layerGroup: (...args) => layerGroupMock(...args),
  },
}));
vi.mock("leaflet-simple-map-screenshoter", () => ({}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  useMap: () => ({
    invalidateSize: vi.fn(),
  }),
}));

const fetchGeoJsonMock = vi.fn();
vi.mock("../../lib/RiskWiseClient", () => ({
  default: {
    fetchGeoJson: (...args) => fetchGeoJsonMock(...args),
  },
}));

const uiState = {
  setActiveMapRef: vi.fn(),
  setAlertMessage: vi.fn(),
  setAlertSeverity: vi.fn(),
  setAlertShowMessage: vi.fn(),
  offlineMode: false,
  offlineTilePort: null,
};
const workspaceState = {
  selectedCountry: "egypt",
  selectedHazard: "flood",
};

vi.mock("../../store/useUIStore", () => ({
  default: (selector) => selector(uiState),
}));
vi.mock("../../store/useWorkspaceStore", () => ({
  default: (selector) => selector(workspaceState),
}));

// Imported after mocks so the module under test picks up the stubs.
import RiskMap from "./RiskMap";

const geoJsonFixture = {
  _metadata: {
    return_periods: [10],
    percentile_values: { rp10: [1000, 5_000_000, 9_000_000] },
    unit: "USD",
    radius: 100,
  },
  features: [
    {
      geometry: { type: "Point", coordinates: [30.0, 26.5] },
      properties: {
        country: "Egypt",
        name: "Cairo",
        rp10: 5_000_000,
        rp10_level: 3,
      },
    },
  ],
};

beforeEach(() => {
  circleMarkerMock.mockClear();
  circleMock.mockClear();
  layerGroupMock.mockClear();
  circleMarkerInstance.bindPopup.mockClear();
  circleMarkerInstance.addTo.mockClear();
  fetchGeoJsonMock.mockResolvedValue({ success: true, result: geoJsonFixture });
});

afterEach(() => {
  cleanup();
});

const renderMap = () =>
  render(
    <ThemeProvider theme={theme}>
      <RiskMap />
    </ThemeProvider>
  );

describe("RiskMap impact markers", () => {
  it("renders each feature as a fixed-pixel L.circleMarker (not L.circle)", async () => {
    renderMap();

    await waitFor(() => {
      expect(circleMarkerMock).toHaveBeenCalled();
    });

    expect(circleMock).not.toHaveBeenCalled();

    const [latLng, options] = circleMarkerMock.mock.calls[0];
    expect(latLng).toEqual([26.5, 30.0]);
    expect(options).toMatchObject({
      radius: 7,
      weight: 1.5,
      fillOpacity: 0.7,
      color: "#fff",
    });
    expect(typeof options.fillColor).toBe("string");
  });

  it("binds a popup that includes the formatted impact value and unit", async () => {
    renderMap();

    await waitFor(() => {
      expect(circleMarkerInstance.bindPopup).toHaveBeenCalled();
    });

    const popupHtml = circleMarkerInstance.bindPopup.mock.calls[0][0];
    // Divisor is picked from the *max* nonzero percentile (9_000_000) so the
    // top label stays readable — 5_000_000 / 1e6 renders as "5".
    expect(popupHtml).toContain("Country: Egypt");
    expect(popupHtml).toContain("Admin 2: Cairo");
    expect(popupHtml).toContain("Level: 3");
    expect(popupHtml).toContain("Impact: 5 USD");
  });
});
