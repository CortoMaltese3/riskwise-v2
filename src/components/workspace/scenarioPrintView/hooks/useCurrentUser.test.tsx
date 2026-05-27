import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useCurrentUser } from "./useCurrentUser";

const setElectron = (getCurrentUser: () => Promise<string | null>) => {
  (window as unknown as { electron: { getCurrentUser: () => Promise<string | null> } }).electron = {
    getCurrentUser,
  };
};

afterEach(() => {
  delete (window as unknown as { electron?: unknown }).electron;
});

describe("useCurrentUser", () => {
  it("returns the OS username when the IPC resolves with a non-empty string", async () => {
    setElectron(() => Promise.resolve("alice"));

    const { result } = renderHook(() => useCurrentUser());

    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe("alice"));
  });

  it("returns null when the IPC resolves with null", async () => {
    setElectron(() => Promise.resolve(null));

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("returns null when the IPC resolves with an empty string", async () => {
    setElectron(() => Promise.resolve(""));

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("returns null when the IPC throws", async () => {
    setElectron(() => Promise.reject(new Error("ipc boom")));

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("resolves to null when window.electron is missing entirely", async () => {
    // The hook reads `window.electron?.getCurrentUser?.()`; with no bridge
    // installed it awaits `undefined`, falls through to the empty-string
    // branch, and parks at null so the readiness gate can still flip and the
    // renderer shows the fallback row instead of staying pending forever.
    delete (window as unknown as { electron?: unknown }).electron;

    const { result } = renderHook(() => useCurrentUser());

    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBeNull());
  });
});
