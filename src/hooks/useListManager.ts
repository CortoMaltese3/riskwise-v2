import { useCallback, useEffect, useState } from "react";

import type { IpcResult } from "../lib/electron";
import { enqueueToast } from "./useToast";

export type FetchFn<T> = () => Promise<T[] | null>;
export type DeleteFn<T> = (item: T) => Promise<IpcResult<unknown>>;

export interface UseListManagerOptions<T> {
  // Returns the next list, or `null` to keep the current list (transient
  // failures shouldn't wipe the table).
  fetchFn: FetchFn<T>;
  deleteFn?: DeleteFn<T>;
  getDeleteKey?: (item: T) => string;
  deleteSuccessMessage?: (item: T) => string;
  deleteFallbackErrorMessage?: string;
  // Optional external state — when callers already store the list elsewhere
  // (e.g. a Zustand slice) they can hand the hook the getter/setter pair so
  // both views stay in sync without duplicating state.
  storage?: {
    items: T[];
    setItems: (items: T[]) => void;
  };
}

export interface UseListManagerApi<T> {
  items: T[];
  loading: boolean;
  busy: string | null;
  setBusy: (value: string | null) => void;
  confirmDelete: T | null;
  setConfirmDelete: (item: T | null) => void;
  refresh: () => Promise<void>;
  remove: (item: T) => Promise<void>;
}

const defaultDeleteKey = <T>(item: T): string => {
  const id = (item as { id?: unknown })?.id;
  return id == null ? String(item) : String(id);
};

export function useListManager<T>(options: UseListManagerOptions<T>): UseListManagerApi<T> {
  const {
    fetchFn,
    deleteFn,
    getDeleteKey = defaultDeleteKey,
    deleteSuccessMessage,
    deleteFallbackErrorMessage,
    storage,
  } = options;

  const [internalItems, setInternalItems] = useState<T[]>([]);
  const items = storage ? storage.items : internalItems;
  const setItems = storage ? storage.setItems : setInternalItems;

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<T | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchFn();
      if (next !== null && next !== undefined) {
        setItems(next);
      }
    } catch {
      // Swallow transient fetch failures — the existing behaviour is to keep
      // whatever the table was already showing rather than wiping it.
    } finally {
      setLoading(false);
    }
  }, [fetchFn, setItems]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const remove = useCallback(
    async (item: T) => {
      if (!deleteFn) return;
      setBusy(`deleting-${getDeleteKey(item)}`);
      try {
        const res = await deleteFn(item);
        if (res?.success) {
          if (deleteSuccessMessage) {
            enqueueToast({ severity: "success", message: deleteSuccessMessage(item) });
          }
          await refresh();
        } else {
          const detail =
            (res && !res.success && res.error?.message) ||
            deleteFallbackErrorMessage ||
            "Delete failed";
          enqueueToast({ severity: "error", message: detail });
        }
      } finally {
        setBusy(null);
        setConfirmDelete(null);
      }
    },
    [deleteFn, getDeleteKey, deleteSuccessMessage, deleteFallbackErrorMessage, refresh]
  );

  return {
    items,
    loading,
    busy,
    setBusy,
    confirmDelete,
    setConfirmDelete,
    refresh,
    remove,
  };
}
