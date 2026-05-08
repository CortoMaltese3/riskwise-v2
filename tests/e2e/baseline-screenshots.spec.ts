/**
 * Phase 8.1 baseline screenshot capture (issue #207).
 *
 * Drives the real Electron app through the supported viewport × locale ×
 * primary-view matrix and writes one PNG per combination into
 * ``docs/audits/ui-baseline-v1/<locale>/<viewport>/<view>.png``.
 *
 * The capture is the artefact, not the assertion. This spec is meant to be
 * run on demand (locally) when establishing or refreshing the Phase 8
 * baseline; it is not a regression gate. Sub-phase 8.7 will add a separate
 * Playwright visual-regression spec that compares against these PNGs.
 *
 * Matrix:
 *   viewports: 1280 × 720 / 1366 × 768 / 1920 × 1080 / 3840 × 2160
 *   locales:   en (default), ar (RTL), th (long strings)
 *   views:     home, risk, macro, workspace, settings
 *   total:     4 × 3 × 5 = 60 PNGs
 *
 * The 4K-class viewport is set via ``page.setViewportSize`` against the
 * Electron renderer; the host OS window may stay smaller (the renderer
 * still lays out at the requested size, so the screenshot reflects 4K
 * regardless of the physical display).
 */
import { _electron as electron, test, type ElectronApplication, type Page } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT_ROOT = path.join(REPO_ROOT, "docs", "audits", "ui-baseline-v1");

type Viewport = { name: string; width: number; height: number };
type Locale = { code: "en" | "ar" | "th"; menuMatch: RegExp | null };
type View = {
  id: "home" | "risk" | "macro" | "workspace" | "settings";
  sidebarIndex: number;
};

const VIEWPORTS: Viewport[] = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "3840x2160", width: 3840, height: 2160 },
];

const LOCALES: Locale[] = [
  // ``menuMatch: null`` means we do not click the language menu — locale is
  // already English at boot. For ar/th we open the language menu and select
  // the appropriate item; the menu items render the language name in the
  // target language, so we accept either the English label or the native
  // glyphs to keep the matcher stable across translation passes.
  { code: "en", menuMatch: null },
  { code: "ar", menuMatch: /(arabic|العربية|عربي)/i },
  { code: "th", menuMatch: /(thai|ไทย|ภาษาไทย)/i },
];

const VIEWS: View[] = [
  // Sidebar order is fixed in src/components/layout/Sidebar.jsx as
  // [home, risk, macro, workspace, settings]. The app boots into the Risk
  // section (sidebarIndex 1) with ERA defaults applied — there is no
  // up-front modal to dismiss anymore (issue #322).
  { id: "home", sidebarIndex: 0 },
  { id: "risk", sidebarIndex: 1 },
  { id: "macro", sidebarIndex: 2 },
  { id: "workspace", sidebarIndex: 3 },
  { id: "settings", sidebarIndex: 4 },
];

async function waitForMainWindow(app: ElectronApplication, timeoutMs = 60_000): Promise<Page> {
  // The Python supervisor handshake can take a few seconds on a cold start;
  // in CI / slow disks 60 s is a safe ceiling. The loader BrowserWindow
  // shows ``loader.html`` and is replaced (a new window opens) once the
  // backend reports ``ready`` and the main window navigates to
  // ``app://./index.html``.
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const w of app.windows()) {
      const url = w.url();
      if (url.startsWith("app://") || url.includes("index.html")) return w;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Main window did not appear within timeout");
}

async function setLocale(window: Page, locale: Locale): Promise<void> {
  if (locale.menuMatch === null) return;
  // The language menu lives in the TopBar, which is mounted from boot now
  // that the launch modal is gone (issue #322).
  const langButton = window.getByRole("button", { name: /language/i }).first();
  await langButton.click();
  const menuItem = window.getByRole("menuitem", { name: locale.menuMatch }).first();
  await menuItem.click();
  // Allow the i18n re-render and any direction flip to settle before the
  // next screenshot. 250 ms is enough for the MUI ThemeProvider to re-emit
  // with the new ``direction`` and for ``<html dir>`` to update.
  await window.waitForTimeout(250);
}

async function selectSection(window: Page, sidebarIndex: number): Promise<void> {
  // The sidebar has 5 ListItemButton entries (home/risk/macro/workspace/
  // settings) plus one IconButton at the bottom for the glossary. Selecting
  // by index over ``[role="navigation"] [role="button"]`` is locale-
  // independent and stable — the order is hard-coded in Sidebar.jsx.
  const navItems = window.locator('[role="navigation"] [role="button"]');
  await navItems.nth(sidebarIndex).click();
  // Brief settle for the section component to mount.
  await window.waitForTimeout(150);
}

function outputPathFor(locale: Locale, viewport: Viewport, view: View): string {
  const dir = path.join(OUTPUT_ROOT, locale.code, viewport.name);
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${view.id}.png`);
}

// One Playwright test per (viewport, locale) pair. Each test launches a
// fresh Electron instance so the per-locale localStorage and the per-launch
// scenario store start clean — RISKWISE_TEST_MODE=1 guarantees the latter.
for (const viewport of VIEWPORTS) {
  for (const locale of LOCALES) {
    test(`baseline ${locale.code} @ ${viewport.name}`, async () => {
      let app: ElectronApplication | null = null;
      try {
        // ``ELECTRON_RUN_AS_NODE=1`` may be set in the developer's shell
        // (electron-builder helpers and various tooling rely on it). When
        // present, the Electron binary launches as a plain Node process and
        // rejects Playwright's ``--remote-debugging-port=0`` with
        // ``bad option:`` — turning into ``Process failed to launch!``.
        // Strip it explicitly so the spec is robust to whichever env the
        // developer ran ``npx playwright test`` from.
        const launchEnv = { ...process.env, RISKWISE_TEST_MODE: "1" };
        delete launchEnv.ELECTRON_RUN_AS_NODE;
        // ``args: ["."]`` (the project directory) routes through
        // ``package.json``'s ``main`` field, which sets ``app.getAppPath()``
        // to the repo root. Passing the script path directly
        // (``build/electron.js``) makes ``getAppPath()`` resolve to the
        // ``build/`` directory and breaks the loader-window file path.
        app = await electron.launch({
          args: ["."],
          cwd: REPO_ROOT,
          env: launchEnv,
        });
        // ``firstWindow`` returns the small loader BrowserWindow while the
        // Python supervisor boots. We need the real renderer at
        // ``app://./index.html``; wait until it appears (boot is typically
        // 2–5 s on this machine).
        const window = await waitForMainWindow(app);
        await window.waitForLoadState("domcontentloaded");
        await window.setViewportSize({ width: viewport.width, height: viewport.height });
        // Give the layout a moment to reflow at the new size before the
        // first capture.
        await window.waitForTimeout(250);
        await setLocale(window, locale);

        for (const view of VIEWS) {
          await selectSection(window, view.sidebarIndex);
          await window.screenshot({ path: outputPathFor(locale, viewport, view), fullPage: true });
        }
      } finally {
        await app?.close();
      }
    });
  }
}
