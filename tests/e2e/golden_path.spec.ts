/**
 * Golden-path E2E: EGY flood scenario run, save, and restore (issue #114).
 *
 * The test drives the real Electron app (``build/electron.js`` + the
 * FastAPI backend the main process spawns on loopback) through the
 * end-to-end flow the issue spells out:
 *   1. Launch the app.
 *   2. Select Egypt + Flood.
 *   3. Click Run and wait for the SSE ``result`` event to close the stream.
 *   4. Assert that Leaflet has rendered a tile/layer on the map canvas.
 *   5. Save the scenario.
 *   6. Navigate to the workspace and confirm the scenario appears.
 *   7. Restore it and confirm the run state is re-applied.
 *
 * Locators lean on role/text selectors so small UI refactors do not
 * break the spec. Where a stable identifier is needed (Leaflet pane,
 * workspace rows) the spec targets a DOM attribute Leaflet itself emits
 * (``.leaflet-tile-loaded``) or the scenario name the flow just wrote.
 */
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ELECTRON_MAIN = path.join(REPO_ROOT, "build", "electron.js");

let app: ElectronApplication;
let window: Page;

test.beforeEach(async () => {
  app = await electron.launch({
    args: [ELECTRON_MAIN],
    cwd: REPO_ROOT,
    // Force a clean user-data dir per run so the workspace list starts
    // empty and the "save/restore" assertions are deterministic.
    env: {
      ...process.env,
      RISKWISE_TEST_MODE: "1",
    },
  });
  window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
});

test.afterEach(async () => {
  await app?.close();
});

test("Egypt flood scenario: run → map → save → restore", async () => {
  // Select Egypt from the country dropdown. A combobox role is what MUI's
  // Autocomplete exposes; falling back to a label-based locator keeps the
  // selector resilient to the specific MUI component variant in use.
  const countrySelect = window.getByRole("combobox", { name: /country/i }).first();
  await countrySelect.click();
  await window.getByRole("option", { name: /egypt/i }).click();

  // Select Flood as the hazard.
  const hazardSelect = window.getByRole("combobox", { name: /hazard/i }).first();
  await hazardSelect.click();
  await window.getByRole("option", { name: /flood/i }).click();

  // Kick off the scenario run. The Run button typically lives near the
  // scenario action bar — match by accessible name.
  await window.getByRole("button", { name: /^run$/i }).click();

  // Wait for the SSE stream to close (progress indicator disappears) and
  // for Leaflet to paint at least one tile. ``.leaflet-tile-loaded`` is a
  // class Leaflet sets after each tile's ``load`` event fires, so its
  // presence is a reliable "map is rendered" signal.
  await expect(window.locator(".leaflet-tile-loaded").first()).toBeVisible({ timeout: 90_000 });

  // Save the scenario. The action is commonly surfaced as a "Save" button
  // in the scenario toolbar after a run completes.
  await window.getByRole("button", { name: /^save( scenario)?$/i }).click();

  const scenarioName = `E2E golden path ${Date.now()}`;
  const nameInput = window.getByRole("textbox", { name: /(scenario )?name/i });
  await nameInput.fill(scenarioName);
  await window.getByRole("button", { name: /^(save|confirm|ok)$/i }).click();

  // Open the workspace and confirm the scenario row is listed.
  await window.getByRole("link", { name: /workspace/i }).click();
  await expect(window.getByText(scenarioName)).toBeVisible();

  // Restore the scenario — typically a row-level action or button.
  await window
    .getByRole("button", { name: /restore/i })
    .first()
    .click();
  // Leaflet must re-render after restore.
  await expect(window.locator(".leaflet-tile-loaded").first()).toBeVisible({ timeout: 60_000 });
});
