import React from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act, render, renderHook } from "@testing-library/react";

import { useToast, enqueueToast, dismissToast, clearToasts } from "./useToast";

describe("useToast", () => {
  beforeEach(() => {
    clearToasts();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearToasts();
  });

  it("enqueues a toast and returns its id", () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toasts).toEqual([]);

    let id = "";
    act(() => {
      id = result.current.toast({ severity: "success", message: "saved" });
    });

    expect(id).toBeTruthy();
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      id,
      severity: "success",
      message: "saved",
      duration: 4000,
    });
  });

  it("defaults errors to an 8s duration and other severities to 4s", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({ severity: "error", message: "boom" });
      result.current.toast({ severity: "info", message: "hi" });
    });

    const [err, info] = result.current.toasts;
    expect(err.duration).toBe(8000);
    expect(info.duration).toBe(4000);
  });

  it("honors an explicit duration override", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.toast({ severity: "warning", message: "slow", duration: 15000 });
    });
    expect(result.current.toasts[0].duration).toBe(15000);
  });

  it("dismisses a toast by id and leaves others in place", () => {
    const { result } = renderHook(() => useToast());

    let firstId = "";
    let secondId = "";
    act(() => {
      firstId = result.current.toast({ severity: "info", message: "one" });
      secondId = result.current.toast({ severity: "info", message: "two" });
    });
    expect(result.current.toasts).toHaveLength(2);

    act(() => {
      result.current.dismiss(firstId);
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].id).toBe(secondId);
  });

  it("queues multiple toasts preserving insertion order", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.toast({ severity: "info", message: "a" });
      result.current.toast({ severity: "info", message: "b" });
      result.current.toast({ severity: "info", message: "c" });
    });
    expect(result.current.toasts.map((t) => t.message)).toEqual(["a", "b", "c"]);
  });

  it("keeps a stable toast function reference across renders", () => {
    const { result, rerender } = renderHook(() => useToast());
    const firstToast = result.current.toast;
    const firstDismiss = result.current.dismiss;
    rerender();
    expect(result.current.toast).toBe(firstToast);
    expect(result.current.dismiss).toBe(firstDismiss);
  });

  it("notifies subscribed components of queue changes", () => {
    const Probe = () => {
      const { toasts } = useToast();
      return <div data-testid="count">{toasts.length}</div>;
    };

    const { getByTestId } = render(<Probe />);
    expect(getByTestId("count").textContent).toBe("0");

    let id = "";
    act(() => {
      id = enqueueToast({ severity: "info", message: "ping" });
    });
    expect(getByTestId("count").textContent).toBe("1");

    act(() => {
      dismissToast(id);
    });
    expect(getByTestId("count").textContent).toBe("0");
  });
});
