// Single source of truth for the main view tab identifiers and per-tab
// configuration. Replaces the previous numeric-index scheme (0/1/2/3) that
// was duplicated across MainTabs, MainSubTabs, MainView, the UI store, and
// MainViewTitle — reordering a tab used to silently break all five.
//
// Tab values are stable strings (not array indices), so:
//   * the `<Tabs value={selectedTab}>` wiring is order-independent;
//   * i18n keys are name-keyed (``main_view_tab_<id>_title``) instead of
//     positional (``main_view_tab_<n>_title``);
//   * adding/removing/reordering a tab only touches this file plus the
//     locale bundles.

export const TABS = Object.freeze({
  PARAMETERS: "parameters",
  RISK: "risk",
  ADAPTATION: "adaptation",
  MACRO: "macro",
  REPORTS: "reports",
});

// Sub-tab identifiers for tabs that have them. Sub-tabs remain index-keyed
// in the runtime (selectedSubTab is an integer); these constants document
// the indices so callers don't repeat magic numbers. The Save Scenario /
// Save Map|Chart actions used to live at indices 2 and 3 inside `<Tabs>`,
// but #249 moved them out into a sibling toolbar (`SubTabActions`), so
// only the real tabs remain here.
export const RISK_SUB_TABS = Object.freeze({
  RISK: 0,
  ADAPTATION: 1,
});

// Per-tab configuration consumed by MainTabs (rendering order), the UI
// store (default ``activeViewControl`` when switching tabs), and
// MainSubTabs (which sub-tabs to show). Keep ``order`` contiguous; it is
// the only place that defines the visual order of the main tab strip.
export const TAB_CONFIG = Object.freeze({
  [TABS.PARAMETERS]: {
    order: 0,
    titleKey: "main_view_tab_parameters_title",
    resultsTitleKey: "results_view_tab_parameters_title",
    sectionTitleKey: "main_section_title_parameters",
    defaultView: "",
    subTabs: [],
  },
  [TABS.RISK]: {
    order: 1,
    titleKey: "main_view_tab_risk_title",
    resultsTitleKey: "results_view_tab_risk_title",
    sectionTitleKey: "main_section_title_economic_non_economic",
    defaultView: "display_map",
    subTabs: [
      { key: "risk", labelKey: "main_subsection_title_risk" },
      { key: "adaptation", labelKey: "main_subsection_title_adaptation" },
    ],
  },
  // Adaptation is a top-level section reached via the sidebar; the legacy
  // MainTabs strip is not mounted in AppShell. ``order: 1.5`` keeps it
  // sequenced between Risk and Macro for any consumer that walks
  // ``ORDERED_TABS``, while leaving the integer slots for Macro (2) and
  // Reports (3) untouched so ``tabIndex`` keeps its historical positions
  // used by ResultsTypography's ERA i18n keys.
  [TABS.ADAPTATION]: {
    order: 1.5,
    titleKey: "main_view_tab_adaptation_title",
    resultsTitleKey: "results_view_tab_adaptation_title",
    sectionTitleKey: "main_section_title_adaptation",
    defaultView: "display_chart",
    subTabs: [],
  },
  [TABS.MACRO]: {
    order: 2,
    titleKey: "main_view_tab_macro_title",
    resultsTitleKey: "results_view_tab_macro_title",
    sectionTitleKey: "main_section_title_macroeconomic",
    // Macro tab opens on the chart frame so the analyst always sees a
    // chart container; parameter editors open on demand when a
    // side-column card is clicked.
    defaultView: "display_macro_chart",
    subTabs: [],
  },
  [TABS.REPORTS]: {
    order: 3,
    titleKey: "main_view_tab_reports_title",
    resultsTitleKey: "results_view_tab_reports_title",
    sectionTitleKey: "main_section_title_outputs",
    defaultView: "",
    subTabs: [],
  },
});

// Ordered list of tab ids derived from ``TAB_CONFIG.order``. Preferred
// over ``Object.keys`` so callers cannot accidentally rely on insertion
// order.
export const ORDERED_TABS = Object.freeze(
  Object.entries(TAB_CONFIG)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([id]) => id)
);

export const isValidTab = (value) =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(TAB_CONFIG, value);

// Legacy numeric index lookup. The ERA/Explore i18n bundle has ~350 keys
// per locale (e.g. ``results_era_egypt_flood_crops_1_0_display_map_*``)
// that are interpolated with the old numeric tab index. Renaming all of
// them is out of scope for #247, so consumers that build those keys
// (currently only ``ResultsTypography``) translate the enum back to its
// historical position via this helper.
export const tabIndex = (tabId) => TAB_CONFIG[tabId]?.order ?? 0;
