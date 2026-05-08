import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useListManager } from "./useListManager";

const enqueueMock = vi.fn();
vi.mock("./useToast", () => ({
  enqueueToast: (...args: unknown[]) => enqueueMock(...(args as [unknown])),
}));

interface Row {
  id: string;
  name: string;
}

beforeEach(() => {
  enqueueMock.mockReset();
});

describe("useListManager", () => {
  it("populates items from fetchFn on mount", async () => {
    const rows: Row[] = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];
    const fetchFn = vi.fn().mockResolvedValue(rows);

    const { result } = renderHook(() => useListManager<Row>({ fetchFn }));

    await waitFor(() => expect(result.current.items).toEqual(rows));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });

  it("keeps existing items when fetchFn returns null", async () => {
    const initial: Row[] = [{ id: "a", name: "A" }];
    const fetchFn = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(null);

    const { result } = renderHook(() => useListManager<Row>({ fetchFn }));
    await waitFor(() => expect(result.current.items).toEqual(initial));

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.items).toEqual(initial);
  });

  it("uses external storage when provided", async () => {
    const storedItems: Row[] = [{ id: "x", name: "X" }];
    const setItems = vi.fn();
    const fetchFn = vi.fn().mockResolvedValue([{ id: "y", name: "Y" }]);

    const { result } = renderHook(() =>
      useListManager<Row>({
        fetchFn,
        storage: { items: storedItems, setItems },
      })
    );

    await waitFor(() => expect(setItems).toHaveBeenCalledWith([{ id: "y", name: "Y" }]));
    expect(result.current.items).toBe(storedItems);
  });

  it("remove sets busy, calls deleteFn, toasts success, refreshes, and clears confirmDelete", async () => {
    const initial: Row[] = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];
    const after: Row[] = [{ id: "b", name: "B" }];
    const fetchFn = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(after);
    const deleteFn = vi.fn().mockResolvedValue({ success: true, result: { ok: true } });

    const { result } = renderHook(() =>
      useListManager<Row>({
        fetchFn,
        deleteFn,
        deleteSuccessMessage: (item) => `deleted ${item.name}`,
      })
    );
    await waitFor(() => expect(result.current.items).toEqual(initial));

    act(() => {
      result.current.setConfirmDelete(initial[0]);
    });
    expect(result.current.confirmDelete).toEqual(initial[0]);

    await act(async () => {
      await result.current.remove(initial[0]);
    });

    expect(deleteFn).toHaveBeenCalledWith(initial[0]);
    expect(enqueueMock).toHaveBeenCalledWith({ severity: "success", message: "deleted A" });
    expect(result.current.items).toEqual(after);
    expect(result.current.busy).toBeNull();
    expect(result.current.confirmDelete).toBeNull();
  });

  it("remove toasts the backend error message on failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue([{ id: "a", name: "A" }]);
    const deleteFn = vi.fn().mockResolvedValue({
      success: false,
      error: { code: "x", message: "row in use", detail: null, error_id: "e1" },
    });

    const { result } = renderHook(() =>
      useListManager<Row>({
        fetchFn,
        deleteFn,
        deleteFallbackErrorMessage: "fallback",
      })
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.remove({ id: "a", name: "A" });
    });

    expect(enqueueMock).toHaveBeenCalledWith({ severity: "error", message: "row in use" });
    expect(result.current.busy).toBeNull();
    expect(result.current.confirmDelete).toBeNull();
  });

  it("remove falls back when backend error has no message", async () => {
    const fetchFn = vi.fn().mockResolvedValue([{ id: "a", name: "A" }]);
    const deleteFn = vi.fn().mockResolvedValue({
      success: false,
      error: { code: "x", message: "", detail: null, error_id: "e1" },
    });

    const { result } = renderHook(() =>
      useListManager<Row>({
        fetchFn,
        deleteFn,
        deleteFallbackErrorMessage: "fallback msg",
      })
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.remove({ id: "a", name: "A" });
    });

    expect(enqueueMock).toHaveBeenCalledWith({ severity: "error", message: "fallback msg" });
  });

  it("uses getDeleteKey to derive the busy id and clears it after", async () => {
    const fetchFn = vi.fn().mockResolvedValue([{ id: "iso-FRA", name: "France" }]);
    const getDeleteKey = vi.fn((item: Row) => item.name);
    const busyValues: (string | null)[] = [];

    const deferred: { resolve: () => void; promise: Promise<void> } = (() => {
      let resolve: () => void = () => {};
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { resolve, promise };
    })();

    const deleteFn = vi.fn().mockImplementation(async () => {
      await deferred.promise;
      return { success: true, result: {} };
    });

    const Wrapper = () => {
      const api = useListManager<Row>({ fetchFn, deleteFn, getDeleteKey });
      busyValues.push(api.busy);
      return api;
    };
    const { result } = renderHook(Wrapper);
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    let removePromise: Promise<void> = Promise.resolve();
    await act(async () => {
      removePromise = result.current.remove({ id: "iso-FRA", name: "France" });
      // yield so React commits the setBusy update before we resolve deleteFn
      await Promise.resolve();
    });

    expect(busyValues).toContain("deleting-France");

    await act(async () => {
      deferred.resolve();
      await removePromise;
    });

    expect(getDeleteKey).toHaveBeenCalledWith({ id: "iso-FRA", name: "France" });
    expect(result.current.busy).toBeNull();
  });
});
