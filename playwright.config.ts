import { defineConfig } from "@playwright/test";
import path from "node:path";

/**
 * Playwright configuration for the RISK WISE Electron E2E suite (issue #114).
 *
 * The individual specs launch Electron themselves via ``_electron.launch``
 * from ``@playwright/test`` — this config therefore has no web-server block
 * and no ``projects`` block that forces a browser engine. Each spec passes
 * ``electronPath`` (the Electron binary bundled with the devDependency) and
 * the app's built main script at ``build/electron.js``.
 *
 * ``testDir`` is scoped to ``tests/e2e`` so Playwright does not pick up the
 * Vitest ``*.test.ts`` files that live under ``src/``.
 */
export default defineConfig({
  testDir: path.resolve(__dirname, "tests/e2e"),
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // One worker only: Electron and the FastAPI backend bind to ports and the
  // DuckDB scenario store is a single-writer resource — running specs in
  // parallel would race both.
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  outputDir: "test-results/e2e",
});
