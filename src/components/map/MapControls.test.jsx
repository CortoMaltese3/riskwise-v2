import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import "../../i18nConfig";
import useUIStore from "../../store/useUIStore";

// Shared with the leaflet/react-leaflet factories so the tests can
// assert the imperative calls MapControls makes against the Leaflet API
// — the underlying tile layer is mutated in place rather than remounted
// when the basemap or opacity changes.
const tileLayerInstance = {
  addTo: vi.fn().mockReturnThis(),
  setUrl: vi.fn(),
  setOpacity: vi.fn(),
};
const tileLayerCtor = vi.fn(() => tileLayerInstance);
const scaleInstance = {
  addTo: vi.fn().mockReturnThis(),
  remove: vi.fn(),
};
const scaleCtor = vi.fn(() => scaleInstance);
const removeLayer = vi.fn();
const addAttribution = vi.fn();
const removeAttribution = vi.fn();

vi.mock("leaflet", () => ({
  default: {
    tileLayer: (...args) => tileLayerCtor(...args),
    control: {
      scale: (...args) => scaleCtor(...args),
    },
  },
}));

const map = {
  removeLayer,
  attributionControl: { addAttribution, removeAttribution },
};

vi.mock("react-leaflet", () => ({
  useMap: () => map,
}));

import MapControls from "./MapControls";

const resetStore = () => {
  useUIStore.setState({
    basemap: "voyager",
    basemapOpacity: 1,
    offlineMode: false,
    offlineTilePort: null,
  });
};

beforeEach(() => {
  tileLayerCtor.mockClear();
  tileLayerInstance.addTo.mockClear();
  tileLayerInstance.setUrl.mockClear();
  tileLayerInstance.setOpacity.mockClear();
  scaleCtor.mockClear();
  scaleInstance.addTo.mockClear();
  scaleInstance.remove.mockClear();
  removeLayer.mockClear();
  addAttribution.mockClear();
  removeAttribution.mockClear();
  resetStore();
});

afterEach(() => {
  cleanup();
});

describe("MapControls", () => {
  it("renders all three basemap options and the opacity slider", () => {
    render(<MapControls />);

    expect(screen.getByRole("button", { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dark/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /satellite/i })).toBeInTheDocument();
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("creates the base tile layer with the keyed Voyager proxy URL on mount", () => {
    render(<MapControls />);

    expect(tileLayerCtor).toHaveBeenCalledTimes(1);
    const [url, options] = tileLayerCtor.mock.calls[0];
    expect(url).toContain("/__tiles/voyager/");
    expect(options).toMatchObject({ maxZoom: 15, minZoom: 5, opacity: 1 });
    expect(tileLayerInstance.addTo).toHaveBeenCalledWith(map);
  });

  it("adds Leaflet's standard scale bar in metric units at the bottom-left", () => {
    render(<MapControls />);

    expect(scaleCtor).toHaveBeenCalledTimes(1);
    expect(scaleCtor.mock.calls[0][0]).toMatchObject({
      imperial: false,
      position: "bottomleft",
    });
  });

  it("calls setUrl on the existing tile layer when basemap changes (no remount)", () => {
    render(<MapControls />);
    tileLayerCtor.mockClear();

    act(() => {
      useUIStore.getState().setBasemap("dark");
    });

    expect(tileLayerCtor).not.toHaveBeenCalled();
    expect(tileLayerInstance.setUrl).toHaveBeenCalledWith(
      expect.stringContaining("/__tiles/dark/")
    );
  });

  it("updates the attribution line when basemap changes", () => {
    render(<MapControls />);
    addAttribution.mockClear();
    removeAttribution.mockClear();

    act(() => {
      useUIStore.getState().setBasemap("satellite");
    });

    expect(removeAttribution).toHaveBeenCalled();
    expect(addAttribution).toHaveBeenCalled();
    const newAttribution = addAttribution.mock.calls[addAttribution.mock.calls.length - 1][0];
    expect(newAttribution).toContain("Esri");
  });

  it("mutates the tile layer's opacity live when the slider changes and persists to the store", () => {
    render(<MapControls />);
    tileLayerInstance.setOpacity.mockClear();

    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: 40 } });

    // Live visual update: the tile layer's opacity is mutated directly
    // in onChange, no React-driven remount of the layer.
    expect(tileLayerInstance.setOpacity).toHaveBeenCalledWith(0.4);
    // Eventually persisted to the store via onChangeCommitted (fired on
    // pointer release) so subscribers don't re-render every drag tick.
    expect(useUIStore.getState().basemapOpacity).toBeCloseTo(0.4);
  });

  it("hides the basemap selector in offline mode but keeps the opacity slider", () => {
    useUIStore.setState({ offlineMode: true, offlineTilePort: 51234 });

    render(<MapControls />);

    expect(screen.queryByRole("button", { name: /light/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /satellite/i })).not.toBeInTheDocument();
    expect(screen.getByText(/offline mode/i)).toBeInTheDocument();
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("uses the loopback URL when offline mode is on and the tile server is up", () => {
    useUIStore.setState({ offlineMode: true, offlineTilePort: 51234 });

    render(<MapControls />);

    const [url] = tileLayerCtor.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:51234/{z}/{x}/{y}.png");
  });

  it("removes the tile layer and scale bar on unmount", () => {
    const { unmount } = render(<MapControls />);
    unmount();

    expect(removeLayer).toHaveBeenCalledWith(tileLayerInstance);
    expect(scaleInstance.remove).toHaveBeenCalled();
  });

  it("removes the attached attribution on unmount so credit lines don't leak across remounts", () => {
    // Switch basemap so an imperative addAttribution() has run — the
    // initial constructor-time attribution would otherwise be cleaned
    // up by Leaflet automatically when the layer is removed.
    const { unmount } = render(<MapControls />);
    act(() => {
      useUIStore.getState().setBasemap("satellite");
    });
    removeAttribution.mockClear();

    unmount();

    expect(removeAttribution).toHaveBeenCalled();
    const lastArg = removeAttribution.mock.calls[removeAttribution.mock.calls.length - 1][0];
    expect(lastArg).toContain("Esri");
  });
});
