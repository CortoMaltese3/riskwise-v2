import { describe, expect, it } from "vitest";

import { exposureByCountryHazard, exposureCategoryMap } from "../exposureCatalog";

describe("exposureCatalog", () => {
  it("every asset key in exposureByCountryHazard has a category mapping", () => {
    const assets = new Set();
    for (const country of Object.values(exposureByCountryHazard)) {
      for (const list of Object.values(country)) {
        for (const asset of list) assets.add(asset);
      }
    }

    const missing = [...assets].filter((asset) => !exposureCategoryMap[asset]);
    expect(missing).toEqual([]);
  });

  it("every category mapping is one of the documented values", () => {
    const allowed = new Set(["economic", "non_economic"]);
    for (const [asset, category] of Object.entries(exposureCategoryMap)) {
      expect(
        allowed.has(category),
        `${asset} has unexpected category ${category}`
      ).toBe(true);
    }
  });
});
