// Targeted coverage for the tab-related slice of useUIStore after #247
// switched ``selectedTab`` from a numeric index to a TABS enum string.
// Verifies the setter applies the per-tab default ``activeViewControl``
// and ignores unknown values rather than corrupting the store.

import { beforeEach, describe, expect, it } from "vitest";

import useUIStore from "../store/useUIStore";
import { TABS } from "../components/main/tabs";

describe("useUIStore.setSelectedTab", () => {
  beforeEach(() => {
    useUIStore.setState({
      selectedTab: TABS.PARAMETERS,
      activeViewControl: "display_map",
    });
  });

  it("defaults selectedTab to the Parameters tab", () => {
    expect(useUIStore.getState().selectedTab).toBe(TABS.PARAMETERS);
  });

  it("clears the active view control when entering Parameters", () => {
    useUIStore.getState().setSelectedTab(TABS.PARAMETERS);
    const s = useUIStore.getState();
    expect(s.selectedTab).toBe(TABS.PARAMETERS);
    expect(s.activeViewControl).toBe("");
  });

  it("opens the map view when entering the Risk tab", () => {
    useUIStore.getState().setSelectedTab(TABS.RISK);
    const s = useUIStore.getState();
    expect(s.selectedTab).toBe(TABS.RISK);
    expect(s.activeViewControl).toBe("display_map");
  });

  it("opens the chart frame when entering the Macro tab", () => {
    useUIStore.getState().setSelectedTab(TABS.MACRO);
    const s = useUIStore.getState();
    expect(s.selectedTab).toBe(TABS.MACRO);
    expect(s.activeViewControl).toBe("display_macro_chart");
  });

  it("ignores unknown tab ids rather than corrupting the store", () => {
    useUIStore.setState({ selectedTab: TABS.RISK, activeViewControl: "display_map" });
    useUIStore.getState().setSelectedTab("nope");
    const s = useUIStore.getState();
    expect(s.selectedTab).toBe(TABS.RISK);
    expect(s.activeViewControl).toBe("display_map");
  });
});
