// Declarative definitions for the four guided tours offered in the Help menu
// (issue #88). Each tour is a sequence of steps; ``target`` is a CSS selector
// resolved at runtime by react-joyride, and ``contentKey`` points at an i18n
// string so translations stay centralized in the locale files.
export const TOURS = [
  {
    id: "first_scenario",
    titleKey: "onboarding_tour_first_scenario_title",
    steps: [
      {
        target: "[data-tour='country-selector']",
        contentKey: "onboarding_tour_first_scenario_step_country",
      },
      {
        target: "[data-tour='hazard-selector']",
        contentKey: "onboarding_tour_first_scenario_step_hazard",
      },
      {
        target: "[data-tour='run-button']",
        contentKey: "onboarding_tour_first_scenario_step_run",
      },
      {
        target: "[data-tour='results-panel']",
        contentKey: "onboarding_tour_first_scenario_step_results",
      },
    ],
  },
  {
    id: "compare_scenarios",
    titleKey: "onboarding_tour_compare_scenarios_title",
    steps: [
      {
        target: "[data-tour='workspace-nav']",
        contentKey: "onboarding_tour_compare_scenarios_step_workspace",
      },
      {
        target: "body",
        placement: "center",
        contentKey: "onboarding_tour_compare_scenarios_step_select",
      },
      {
        target: "body",
        placement: "center",
        contentKey: "onboarding_tour_compare_scenarios_step_compare",
      },
    ],
  },
  {
    id: "export_report",
    titleKey: "onboarding_tour_export_report_title",
    steps: [
      {
        target: "[data-tour='workspace-nav']",
        contentKey: "onboarding_tour_export_report_step_workspace",
      },
      {
        target: "body",
        placement: "center",
        contentKey: "onboarding_tour_export_report_step_pdf",
      },
    ],
  },
  {
    id: "add_custom_country",
    titleKey: "onboarding_tour_add_custom_country_title",
    steps: [
      {
        target: "[data-tour='country-selector']",
        contentKey: "onboarding_tour_add_custom_country_step_open",
      },
      {
        target: "body",
        placement: "center",
        contentKey: "onboarding_tour_add_custom_country_step_upload",
      },
    ],
  },
];
