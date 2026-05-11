// Coverage for the TABS / TAB_CONFIG single source of truth introduced in
// #247. The tests guard the contract the rest of the app relies on:
// stable string ids, ordered iteration, and round-trip lookups via
// ``isValidTab`` / ``tabIndex`` (the legacy index helper used by
// ResultsTypography).

import { describe, expect, it } from "vitest";

import {
  ORDERED_TABS,
  RISK_SUB_TABS,
  TABS,
  TAB_CONFIG,
  isValidTab,
  tabIndex,
} from "../components/main/tabs";

describe("TABS / TAB_CONFIG", () => {
  it("exposes all tab ids as strings", () => {
    expect(TABS.PARAMETERS).toBe("parameters");
    expect(TABS.RISK).toBe("risk");
    expect(TABS.ADAPTATION).toBe("adaptation");
    expect(TABS.MACRO).toBe("macro");
    expect(TABS.REPORTS).toBe("reports");
  });

  it("freezes TABS so consumers cannot mutate the source of truth", () => {
    expect(Object.isFrozen(TABS)).toBe(true);
    expect(Object.isFrozen(TAB_CONFIG)).toBe(true);
  });

  it("orders tabs parameters → risk → adaptation → macro → reports", () => {
    expect(ORDERED_TABS).toEqual([
      TABS.PARAMETERS,
      TABS.RISK,
      TABS.ADAPTATION,
      TABS.MACRO,
      TABS.REPORTS,
    ]);
  });

  it("provides a config entry per tab with the keys consumers need", () => {
    for (const tabId of ORDERED_TABS) {
      const cfg = TAB_CONFIG[tabId];
      expect(cfg).toBeDefined();
      expect(typeof cfg.order).toBe("number");
      expect(typeof cfg.titleKey).toBe("string");
      expect(typeof cfg.resultsTitleKey).toBe("string");
      expect(typeof cfg.sectionTitleKey).toBe("string");
      expect(typeof cfg.defaultView).toBe("string");
      expect(Array.isArray(cfg.subTabs)).toBe(true);
    }
  });

  it("only marks the Risk tab with sub-tabs", () => {
    expect(TAB_CONFIG[TABS.PARAMETERS].subTabs).toHaveLength(0);
    expect(TAB_CONFIG[TABS.RISK].subTabs.length).toBeGreaterThan(0);
    expect(TAB_CONFIG[TABS.ADAPTATION].subTabs).toHaveLength(0);
    expect(TAB_CONFIG[TABS.MACRO].subTabs).toHaveLength(0);
    expect(TAB_CONFIG[TABS.REPORTS].subTabs).toHaveLength(0);
  });

  it("opens Risk on the map view, Adaptation on the chart, and Macro on the chart frame", () => {
    expect(TAB_CONFIG[TABS.RISK].defaultView).toBe("display_map");
    expect(TAB_CONFIG[TABS.ADAPTATION].defaultView).toBe("display_chart");
    expect(TAB_CONFIG[TABS.MACRO].defaultView).toBe("display_macro_chart");
    expect(TAB_CONFIG[TABS.PARAMETERS].defaultView).toBe("");
    expect(TAB_CONFIG[TABS.REPORTS].defaultView).toBe("");
  });

  describe("isValidTab", () => {
    it("accepts every TAB id", () => {
      for (const tabId of ORDERED_TABS) expect(isValidTab(tabId)).toBe(true);
    });

    it("rejects unknown strings, numbers, and nullish values", () => {
      expect(isValidTab("unknown")).toBe(false);
      expect(isValidTab(0)).toBe(false);
      expect(isValidTab(null)).toBe(false);
      expect(isValidTab(undefined)).toBe(false);
    });
  });

  describe("tabIndex (legacy numeric lookup)", () => {
    it("maps the enum back to its historical numeric position", () => {
      // ResultsTypography composes ERA i18n keys like ``..._1_0_...``;
      // breaking these would silently blank the explanatory copy.
      expect(tabIndex(TABS.PARAMETERS)).toBe(0);
      expect(tabIndex(TABS.RISK)).toBe(1);
      expect(tabIndex(TABS.MACRO)).toBe(2);
      expect(tabIndex(TABS.REPORTS)).toBe(3);
    });

    it("falls back to 0 for unknown ids", () => {
      expect(tabIndex("nope")).toBe(0);
      expect(tabIndex(undefined)).toBe(0);
    });
  });

  describe("RISK_SUB_TABS", () => {
    it("documents the risk sub-tab indices (real tabs only)", () => {
      // The Save Scenario / Save Map|Chart actions used to live at indices
      // 2 and 3 inside `<Tabs>`; #249 moved them to the SubTabActions
      // sibling toolbar, so only the real tabs remain here.
      expect(RISK_SUB_TABS).toEqual({
        RISK: 0,
        ADAPTATION: 1,
      });
      expect(Object.isFrozen(RISK_SUB_TABS)).toBe(true);
    });
  });
});
