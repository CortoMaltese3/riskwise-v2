import { describe, it, expect } from "vitest";

import translationEN from "../locales/en.json";
import translationAR from "../locales/ar.json";
import translationTH from "../locales/th.json";
import { exposureByCountryHazard } from "../data/exposureCatalog";

const LOCALES = { en: translationEN, ar: translationAR, th: translationTH };

// Template-only strings whose English value is just punctuation + i18next
// interpolations ({{var}}); translating them would be a no-op. Keep this list
// short — every entry should be a string a human reader cannot recognize as
// English without the curly braces.
const DRIFT_ALLOWLIST = new Set([
  "export_pdf_dialog_group_count", // "{{label}} ({{count}})"
  "scenario_chip_summary", // "{{country}} · {{hazard}} · {{from}}–{{to}}"
  "home_active_run_summary", // "{{country}} · {{hazard}} · {{from}}–{{to}}"
  // Impact-function viewer (issue #452): English values are intentional
  // placeholders pending translation per the issue's i18n acceptance criterion.
  "impact_function_card_title",
  "impact_function_card_placeholder",
  "impact_function_card_loading",
  "impact_function_card_error",
  "impact_function_card_summary",
  "impact_function_card_unit",
  "impact_function_dialog_title",
  "impact_function_dialog_intensity_unit",
  "impact_function_dialog_intensity_axis",
  "impact_function_dialog_mdd",
  "impact_function_dialog_paa",
  "results_view_impact_function",
  // Editable impact-function strings (issue #453): per the issue's i18n
  // acceptance criterion, non-English locales ship the English text as
  // an explicit placeholder pending translation.
  "impact_function_editor_save_error",
  // ErrorBoundary / ErrorToast / AlertMessage labels surfaced by the A2
  // i18n audit (issue #146 A2). Non-English values are English placeholders
  // awaiting translator review under #146 A1.
  "error_id_label",
  "error_request_id_label",
  "error_boundary_title",
  "error_boundary_description",
]);

const DRIFT_MIN_LENGTH = 15;

function eraKeysFromCatalog() {
  const keys = [];
  const tabIdx = 1;
  const subTabIdx = 0;
  for (const [country, hazards] of Object.entries(exposureByCountryHazard)) {
    for (const [hazard, exposures] of Object.entries(hazards)) {
      for (const exposure of exposures) {
        for (const view of ["display_map", "display_chart"]) {
          for (const map of ["hazard", "exposure", "impact"]) {
            keys.push(
              `results_era_${country}_${hazard}_${exposure}_${tabIdx}_${subTabIdx}_${view}_${map}`
            );
          }
        }
      }
    }
  }
  return keys;
}

describe("locales — ERA result-detail coverage", () => {
  const eraKeys = eraKeysFromCatalog();

  it("enumerates the full Cartesian product from exposureCatalog", () => {
    // Sanity check so a future catalog change makes the size assertion visible
    // instead of silently shrinking the matrix.
    expect(eraKeys.length).toBeGreaterThan(0);
  });

  for (const [lang, bundle] of Object.entries(LOCALES)) {
    it(`${lang}.json defines every composed ERA result-detail key`, () => {
      const missing = eraKeys.filter((k) => !(k in bundle) || bundle[k] === "");
      expect(missing).toEqual([]);
    });
  }
});

describe("locales — translator debt", () => {
  for (const [lang, bundle] of Object.entries(LOCALES)) {
    it(`${lang}.json contains no TODO_TRANSLATION placeholders`, () => {
      const offenders = Object.entries(bundle)
        .filter(([, v]) => typeof v === "string" && v === "TODO_TRANSLATION")
        .map(([k]) => k);
      expect(offenders).toEqual([]);
    });
  }
});

describe("locales — TH/AR drift guard", () => {
  for (const lang of ["th", "ar"]) {
    it(`${lang}.json carries no untranslated long strings outside the allowlist`, () => {
      const target = LOCALES[lang];
      const offenders = [];
      for (const [key, enValue] of Object.entries(translationEN)) {
        if (typeof enValue !== "string" || enValue.length < DRIFT_MIN_LENGTH) continue;
        if (DRIFT_ALLOWLIST.has(key)) continue;
        if (target[key] === enValue) offenders.push(key);
      }
      expect(offenders).toEqual([]);
    });
  }
});
