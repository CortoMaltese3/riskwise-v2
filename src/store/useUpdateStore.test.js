import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useUpdateStore, { UPDATE_PHASES, requestUpdateDownload } from "./useUpdateStore";

const reset = () => useUpdateStore.getState().reset();

describe("useUpdateStore", () => {
  beforeEach(reset);
  afterEach(() => {
    reset();
    delete window.electron;
  });

  it("starts idle", () => {
    const s = useUpdateStore.getState();
    expect(s.phase).toBeNull();
    expect(s.percent).toBe(0);
  });

  it("moves through downloading → ready", () => {
    useUpdateStore.getState().startDownloading("2.1.5");
    expect(useUpdateStore.getState().phase).toBe(UPDATE_PHASES.DOWNLOADING);
    expect(useUpdateStore.getState().version).toBe("2.1.5");

    useUpdateStore.getState().setProgress({ percent: 40, transferred: 50, total: 125 });
    expect(useUpdateStore.getState().percent).toBe(40);
    expect(useUpdateStore.getState().total).toBe(125);

    useUpdateStore.getState().setReady();
    expect(useUpdateStore.getState().phase).toBe(UPDATE_PHASES.READY);
    expect(useUpdateStore.getState().percent).toBe(100);
  });

  it("clamps out-of-range percent", () => {
    useUpdateStore.getState().setProgress({ percent: 142 });
    expect(useUpdateStore.getState().percent).toBe(100);
    useUpdateStore.getState().setProgress({ percent: -5 });
    expect(useUpdateStore.getState().percent).toBe(0);
  });

  it("requestUpdateDownload sets downloading then triggers the IPC", async () => {
    const installOnNextRestart = vi.fn().mockResolvedValue({ ok: true });
    window.electron = { updates: { installOnNextRestart } };

    await requestUpdateDownload("2.1.5");

    expect(installOnNextRestart).toHaveBeenCalledTimes(1);
    expect(useUpdateStore.getState().phase).toBe(UPDATE_PHASES.DOWNLOADING);
    expect(useUpdateStore.getState().version).toBe("2.1.5");
  });

  it("requestUpdateDownload marks failed when the IPC reports an error", async () => {
    window.electron = {
      updates: { installOnNextRestart: vi.fn().mockResolvedValue({ error: "network" }) },
    };
    await requestUpdateDownload("2.1.5");
    expect(useUpdateStore.getState().phase).toBe(UPDATE_PHASES.FAILED);
  });

  it("requestUpdateDownload marks failed when the IPC throws", async () => {
    window.electron = {
      updates: { installOnNextRestart: vi.fn().mockRejectedValue(new Error("boom")) },
    };
    await requestUpdateDownload("2.1.5");
    expect(useUpdateStore.getState().phase).toBe(UPDATE_PHASES.FAILED);
  });
});
