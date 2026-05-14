// Pins the cold-start landing surface: a fresh useUIStore opens on Home,
// not Risk. The previous default sent every user straight into the input
// parameter editor before they could see the home dashboard.

import { describe, expect, it } from "vitest";

import useUIStore from "../store/useUIStore";

describe("useUIStore defaults", () => {
  it("lands on the Home section on cold start", () => {
    expect(useUIStore.getState().activeSection).toBe("home");
  });
});
