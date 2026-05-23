import { describe, expect, it, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useTileLayerUrl, remoteTileUrl } from "../components/map/useTileLayerUrl";
import useUIStore from "../store/useUIStore";

const resetOfflineStore = () => {
  useUIStore.setState({
    offlineMode: false,
    offlineTilePort: null,
    offlineTilesPath: null,
    offlineImportedPacks: [],
    basemap: "voyager",
    basemapOpacity: 1,
  });
};

describe("useTileLayerUrl", () => {
  beforeEach(() => {
    resetOfflineStore();
  });

  it("returns the keyed Voyager proxy URL by default", () => {
    const { result } = renderHook(() => useTileLayerUrl());
    expect(result.current).toBe(remoteTileUrl("voyager"));
    expect(result.current).toContain("/__tiles/voyager/");
  });

  it("honors the basemap argument over the stored preference", () => {
    useUIStore.setState({ basemap: "voyager" });
    const { result } = renderHook(() => useTileLayerUrl("dark"));
    expect(result.current).toBe(remoteTileUrl("dark"));
    expect(result.current).toContain("/__tiles/dark/");
  });

  it("uses the stored basemap when no argument is passed", () => {
    useUIStore.setState({ basemap: "satellite" });
    const { result } = renderHook(() => useTileLayerUrl());
    expect(result.current).toBe(remoteTileUrl("satellite"));
    expect(result.current).toContain("/__tiles/satellite/");
  });

  it("falls back to the remote URL when offline mode is on but the tile server has no port", () => {
    useUIStore.setState({ offlineMode: true, offlineTilePort: null });
    const { result } = renderHook(() => useTileLayerUrl());
    expect(result.current).toBe(remoteTileUrl("voyager"));
  });

  it("returns the loopback URL when offline mode is on and the tile server is up", () => {
    useUIStore.setState({ offlineMode: true, offlineTilePort: 51234 });
    const { result } = renderHook(() => useTileLayerUrl());
    expect(result.current).toBe("http://127.0.0.1:51234/{z}/{x}/{y}.png");
  });
});
