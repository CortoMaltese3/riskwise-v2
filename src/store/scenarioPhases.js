// Phase enum the ScenarioProgressChip and useRunScenario both write/read.
// String literals across files invite typo drift (e.g., "cancelling" vs.
// "canceling") that compiles silently — the constant is the typo guard.

export const SCENARIO_PHASES = Object.freeze({
  RUNNING: "running",
  CANCELLING: "cancelling",
  COMPLETED: "completed",
  FAILED: "failed",
});

export const TERMINAL_PHASES = Object.freeze(
  new Set([SCENARIO_PHASES.COMPLETED, SCENARIO_PHASES.FAILED])
);
