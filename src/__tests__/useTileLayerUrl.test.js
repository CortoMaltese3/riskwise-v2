import { describe, expect, it, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useTileLayerUrl, REMOTE_TILE_URL } from "../components/map/useTileLayerUrl";
import useStore from "../store";

const resetOfflineStore = () => {
  useStore.setState({
    offlineMode: false,
    offlineTilePort: null,
    offlineTilesPath: null,
    offlineImportedPacks: [],
  });
};

describe("useTileLayerUrl", () => {
  beforeEach(() => {
    resetOfflineStore();
  });

  it("returns the remote tile URL when offline mode is off", () => {
    const { result } = renderHook(() => useTileLayerUrl());
    expect(result.current).toBe(REMOTE_TILE_URL);
  });

  it("falls back to the remote URL when offline mode is on but the tile server has no port", () => {
    useStore.setState({ offlineMode: true, offlineTilePort: null });
    const { result } = renderHook(() => useTileLayerUrl());
    expect(result.current).toBe(REMOTE_TILE_URL);
  });

  it("returns the loopback URL when offline mode is on and the tile server is up", () => {
    useStore.setState({ offlineMode: true, offlineTilePort: 51234 });
    const { result } = renderHook(() => useTileLayerUrl());
    expect(result.current).toBe("http://127.0.0.1:51234/{z}/{x}/{y}.png");
  });
});
