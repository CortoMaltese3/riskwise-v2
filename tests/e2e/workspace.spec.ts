/**
 * Workspace E2E: multi-scenario rename, filter, and PDF export (issue #114).
 *
 * Creates two scenarios via the app's own save flow, renames one, filters
 * the workspace list by country, triggers a PDF export, and asserts that
 * the PDF file lands on disk. The spec reuses the real Electron app so
 * the file-system side effects exercise the same code the installer
 * ships — a mocked renderer would bypass the Electron save dialog that
 * actually writes the PDF.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ELECTRON_MAIN = path.join(REPO_ROOT, "build", "electron.js");

let app: ElectronApplication;
let window: Page;
let exportDir: string;

async function runScenario(page: Page, country: RegExp, hazard: RegExp, name: string) {
  await page.getByRole("combobox", { name: /country/i }).first().click();
  await page.getByRole("option", { name: country }).click();
  await page.getByRole("combobox", { name: /hazard/i }).first().click();
  await page.getByRole("option", { name: hazard }).click();
  await page.getByRole("button", { name: /^run$/i }).click();
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: /^save( scenario)?$/i }).click();
  await page.getByRole("textbox", { name: /(scenario )?name/i }).fill(name);
  await page.getByRole("button", { name: /^(save|confirm|ok)$/i }).click();
}

test.beforeEach(async () => {
  exportDir = fs.mkdtempSync(path.join(os.tmpdir(), "riskwise-e2e-"));
  app = await electron.launch({
    args: [ELECTRON_MAIN],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      RISKWISE_TEST_MODE: "1",
      // Allow the export test to assert the PDF landed without needing
      // to stub Electron's save dialog: the main process honours this
      // override when running under ``RISKWISE_TEST_MODE``.
      RISKWISE_TEST_EXPORT_DIR: exportDir,
    },
  });
  window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
});

test.afterEach(async () => {
  await app?.close();
  fs.rmSync(exportDir, { recursive: true, force: true });
});

test("workspace: create two scenarios, rename, filter, export PDF", async () => {
  const nameA = `EGY flood ${Date.now()}`;
  const nameB = `THA flood ${Date.now()}`;
  const renamedA = `${nameA} (renamed)`;

  await runScenario(window, /egypt/i, /flood/i, nameA);
  await runScenario(window, /thailand/i, /flood/i, nameB);

  await window.getByRole("link", { name: /workspace/i }).click();
  await expect(window.getByText(nameA)).toBeVisible();
  await expect(window.getByText(nameB)).toBeVisible();

  // Rename the first scenario — open the row's edit affordance, type the
  // new name, and confirm via the row-level save.
  const rowA = window.getByRole("row", { name: new RegExp(nameA) });
  await rowA.getByRole("button", { name: /(rename|edit)/i }).click();
  const renameInput = window.getByRole("textbox", { name: /(scenario )?name/i });
  await renameInput.fill(renamedA);
  await window.getByRole("button", { name: /^(save|confirm|ok)$/i }).click();
  await expect(window.getByText(renamedA)).toBeVisible();

  // Filter by country — the workspace exposes a search/filter input that
  // narrows rows by substring. Filtering for "thailand" should hide the
  // Egypt scenario and keep the Thailand one.
  const countryFilter = window.getByRole("textbox", { name: /(filter|search)/i });
  await countryFilter.fill("Thailand");
  await expect(window.getByText(renamedA)).toHaveCount(0);
  await expect(window.getByText(nameB)).toBeVisible();
  await countryFilter.fill("");

  // Export the Thailand scenario to PDF. The resulting file must land
  // under ``exportDir`` (wired via the env var above).
  const rowB = window.getByRole("row", { name: new RegExp(nameB) });
  await rowB.getByRole("button", { name: /export/i }).click();
  await window.getByRole("menuitem", { name: /pdf/i }).click();

  // Poll for the PDF file — Electron writes it asynchronously after the
  // renderer dispatches the export IPC message.
  await expect
    .poll(() => fs.readdirSync(exportDir).filter((f) => f.toLowerCase().endsWith(".pdf")), {
      timeout: 30_000,
    })
    .not.toEqual([]);

  const pdfs = fs.readdirSync(exportDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  expect(pdfs.length).toBeGreaterThan(0);
  const stat = fs.statSync(path.join(exportDir, pdfs[0]));
  expect(stat.size).toBeGreaterThan(0);
});
