import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import OfflineSection from "./OfflineSection";
import useStore from "../../store";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key, opts) => {
      if (opts && typeof opts === "object" && opts.defaultValue) {
        let out = opts.defaultValue;
        for (const [k, v] of Object.entries(opts)) {
          if (k === "defaultValue") continue;
          out = out.replace(`{{${k}}}`, String(v));
        }
        return out;
      }
      return _key;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

const baseStatus = {
  enabled: false,
  tilePort: null,
  tilesPath: "/tmp/tiles.mbtiles",
  importedPacks: [],
};

const setupBridge = (overrides = {}) => {
  const setEnabled = vi.fn().mockResolvedValue({ ...baseStatus, enabled: true, ...overrides });
  const getStatus = vi.fn().mockResolvedValue({ ...baseStatus, ...overrides });
  const rescan = vi.fn().mockResolvedValue([]);
  window.electron = {
    offline: { getStatus, setEnabled, onStatusChanged: vi.fn(() => () => {}) },
    dataPacks: { getStatus: vi.fn(), rescan },
  };
  return { getStatus, setEnabled, rescan };
};

beforeEach(() => {
  useStore.setState({
    offlineMode: false,
    offlineTilePort: null,
    offlineTilesPath: null,
    offlineImportedPacks: [],
  });
});

afterEach(() => {
  cleanup();
  delete window.electron;
});

describe("OfflineSection", () => {
  it("hydrates from electron.offline.getStatus on mount", async () => {
    const { getStatus } = setupBridge({ enabled: true, tilePort: 51234 });
    render(<OfflineSection />);
    await waitFor(() => expect(getStatus).toHaveBeenCalled());
    await waitFor(() => expect(useStore.getState().offlineMode).toBe(true));
    expect(useStore.getState().offlineTilePort).toBe(51234);
  });

  it("calls setEnabled when the user flips the toggle", async () => {
    const { setEnabled } = setupBridge();
    render(<OfflineSection />);
    const wrapper = await screen.findByTestId("offline-toggle");
    const toggle = wrapper.querySelector("input[type='checkbox']") || wrapper;
    fireEvent.click(toggle);
    await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(true));
  });

  it("shows a warning when offline mode is on but no tile pack is installed", async () => {
    setupBridge({ enabled: true, tilesPath: null });
    render(<OfflineSection />);
    expect(await screen.findByText(/No offline map tiles bundled/i)).toBeInTheDocument();
  });

  it("renders rejected pack entries with their error message", async () => {
    setupBridge({
      importedPacks: [
        { pack: "evil.riskwise-pack", ok: false, error: "Pack signature did not verify" },
      ],
    });
    render(<OfflineSection />);
    expect(await screen.findByText(/evil\.riskwise-pack/)).toBeInTheDocument();
    expect(await screen.findByText(/Rejected: Pack signature did not verify/)).toBeInTheDocument();
  });
});
