import { useSyncExternalStore } from "react";

export type ToastSeverity = "success" | "error" | "warning" | "info";

export interface ToastInput {
  severity: ToastSeverity;
  message: string;
  duration?: number;
  code?: string;
}

export interface Toast extends Required<Omit<ToastInput, "code">> {
  id: string;
  code?: string;
}

const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 8000;

type Listener = () => void;

let toasts: Toast[] = [];
const listeners = new Set<Listener>();

const emit = () => {
  for (const l of listeners) l();
};

const subscribe = (l: Listener) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const getSnapshot = () => toasts;

const makeId = () => {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const enqueueToast = (input: ToastInput): string => {
  const duration =
    input.duration ?? (input.severity === "error" ? ERROR_DURATION : DEFAULT_DURATION);
  const toast: Toast = {
    id: makeId(),
    severity: input.severity,
    message: input.message,
    duration,
    code: input.code,
  };
  toasts = [...toasts, toast];
  emit();
  return toast.id;
};

export const dismissToast = (id: string): void => {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
};

export const clearToasts = (): void => {
  if (toasts.length === 0) return;
  toasts = [];
  emit();
};

export interface UseToastApi {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  toasts: Toast[];
}

// Stable references so consumers can rely on referential identity.
const toastFn = (input: ToastInput) => enqueueToast(input);
const dismissFn = (id: string) => dismissToast(id);

export const useToast = (): UseToastApi => {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { toast: toastFn, dismiss: dismissFn, toasts: snapshot };
};

export const __toastInternals = { subscribe, getSnapshot };
