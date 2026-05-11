// Single source of truth for the main view tab identifiers and per-tab
// configuration. Replaces the previous numeric-index scheme (0/1/2/3) that
// was duplicated across the legacy main-tab strip, MainView, the UI store,
// and MainViewTitle — reordering a tab used to silently break all of them.
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

// Per-tab configuration. ``order`` is the only place that defines the
// numeric sequence used by ``tabIndex`` (the legacy lookup that backs
// ResultsTypography's ERA i18n keys); ``defaultView`` is the
// ``activeViewControl`` to apply on tab entry. Adaptation keeps
// ``order: 1.5`` so it sits between Risk and Macro for any consumer that
// walks ``ORDERED_TABS``, while leaving the integer slots for Macro (2)
// and Reports (3) untouched so the historical ERA key positions hold.
export const TAB_CONFIG = Object.freeze({
  [TABS.PARAMETERS]: {
    order: 0,
    titleKey: "main_view_tab_parameters_title",
    resultsTitleKey: "results_view_tab_parameters_title",
    sectionTitleKey: "main_section_title_parameters",
    defaultView: "",
  },
  [TABS.RISK]: {
    order: 1,
    titleKey: "main_view_tab_risk_title",
    resultsTitleKey: "results_view_tab_risk_title",
    sectionTitleKey: "main_section_title_economic_non_economic",
    defaultView: "display_map",
  },
  [TABS.ADAPTATION]: {
    order: 1.5,
    titleKey: "main_view_tab_adaptation_title",
    resultsTitleKey: "results_view_tab_adaptation_title",
    sectionTitleKey: "main_section_title_adaptation",
    defaultView: "display_chart",
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
  },
  [TABS.REPORTS]: {
    order: 3,
    titleKey: "main_view_tab_reports_title",
    resultsTitleKey: "results_view_tab_reports_title",
    sectionTitleKey: "main_section_title_outputs",
    defaultView: "",
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
