import { describe, it, expect, beforeEach } from "vitest";

import useStore from "./store";

const KEY = "riskwise.themeMode";

describe("store — themeMode persistence", () => {
  beforeEach(() => {
    globalThis.localStorage?.removeItem(KEY);
    useStore.setState({ themeMode: "system" });
  });

  it("setThemeMode writes to localStorage and updates state", () => {
    useStore.getState().setThemeMode("dark");
    expect(useStore.getState().themeMode).toBe("dark");
    expect(globalThis.localStorage?.getItem(KEY)).toBe("dark");
  });

  it("accepts each valid mode", () => {
    for (const mode of ["light", "dark", "system"]) {
      useStore.getState().setThemeMode(mode);
      expect(useStore.getState().themeMode).toBe(mode);
      expect(globalThis.localStorage?.getItem(KEY)).toBe(mode);
    }
  });

  it("falls back to system when given an invalid mode", () => {
    useStore.getState().setThemeMode("neon");
    expect(useStore.getState().themeMode).toBe("system");
    expect(globalThis.localStorage?.getItem(KEY)).toBe("system");
  });
});
