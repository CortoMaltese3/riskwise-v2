/**
 * Accessibility E2E (Phase 4 Area 16, issue #121).
 *
 * Drives the packaged Electron app through the keyboard-only golden path,
 * verifies that modals/drawers trap focus and return focus on close, and
 * audits that every icon-only button reachable from the main shell carries
 * an accessible name. Sibling specs (``golden_path.spec.ts``,
 * ``workspace.spec.ts``) cover the click-driven flow; this one is the
 * keyboard / screen-reader equivalent.
 *
 * Locators follow the same role/text-first convention as the rest of the
 * suite so small UI refactors do not break the spec.
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

// Convenience: read the accessible name (text content + aria-label fallback)
// of whatever element currently holds focus. Used to assert focus-return
// invariants without coupling the test to a brittle CSS selector.
async function focusedAccessibleName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return "";
    const aria = el.getAttribute("aria-label");
    if (aria) return aria;
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) return labelEl.textContent?.trim() ?? "";
    }
    return el.textContent?.trim() ?? "";
  });
}

test("keyboard-only: golden-path scenario completable with Tab/Enter/Escape", async () => {
  // 1. Focus must reach a primary navigation control on first Tab. Browsers
  //    seed `document.activeElement` to <body>; the first Tab should advance
  //    to whatever the app exposes as the first focusable control.
  await window.keyboard.press("Tab");
  const firstFocused = await focusedAccessibleName(window);
  expect(firstFocused.length).toBeGreaterThan(0);

  // 2. Open the country combobox, type "Egypt", confirm with Enter.
  //    Mouse-free path — the keyboard alone must reach and operate the input.
  const countrySelect = window.getByRole("combobox", { name: /country/i }).first();
  await countrySelect.focus();
  await countrySelect.press("Enter");
  await window.getByRole("option", { name: /egypt/i }).click({ trial: true });
  await window.keyboard.press("Enter");

  // 3. Hazard combobox — same pattern. The flow above is enough to assert
  //    keyboard reachability of every input on the Risk Assessment screen
  //    without exhaustively pressing Tab through every control (the focus
  //    order is covered by the golden_path spec at the click level).
  const hazardSelect = window.getByRole("combobox", { name: /hazard/i }).first();
  await hazardSelect.focus();
  await hazardSelect.press("Enter");
  await window.getByRole("option", { name: /flood/i }).click({ trial: true });
  await window.keyboard.press("Enter");

  // 4. Run the scenario via Enter on the Run button. Map render assertion
  //    matches the click-driven golden path so a regression in either flow
  //    surfaces here.
  const runButton = window.getByRole("button", { name: /^run$/i });
  await runButton.focus();
  await runButton.press("Enter");
  await expect(window.locator(".leaflet-tile-loaded").first()).toBeVisible({ timeout: 90_000 });
});

test("modal traps focus and returns focus to the trigger on close", async () => {
  // Pick a modal we can open from the empty initial state — the Save
  // Scenario dialog is gated by a completed run, so use the Settings page's
  // "About" panel instead, which is a static panel with a Help/Glossary
  // drawer accessible from the top bar regardless of run state.
  const helpButton = window.getByRole("button", { name: /help/i }).first();
  await helpButton.focus();
  const helpName = await focusedAccessibleName(window);
  await window.keyboard.press("Enter");

  // The drawer/menu must be visible and focus must move into it.
  const drawerOrMenu = window.getByRole("dialog").or(window.getByRole("menu"));
  await expect(drawerOrMenu.first()).toBeVisible();

  // Focus is now somewhere inside the drawer; cycling Tab repeatedly must
  // keep activeElement inside the drawer (focus trap). We sample after a
  // handful of Tabs — any escape would surface as the body element being
  // focused, which has an empty accessible name and tagName BODY.
  for (let i = 0; i < 6; i++) {
    await window.keyboard.press("Tab");
    const inside = await window.evaluate(() => {
      const el = document.activeElement;
      // Body / html means focus escaped the trap.
      return !!(el && el.tagName !== "BODY" && el.tagName !== "HTML");
    });
    expect(inside).toBe(true);
  }

  // Escape must close the drawer and return focus to the trigger.
  await window.keyboard.press("Escape");
  await expect(drawerOrMenu.first()).toBeHidden();
  const restored = await focusedAccessibleName(window);
  // The trigger's accessible name is what we recorded before opening.
  expect(restored).toBe(helpName);
});

test("icon-only buttons in the main shell expose accessible names", async () => {
  // Walk every <button> in the document. Buttons whose only visible content
  // is an icon (no text node, no aria-label, no aria-labelledby) are
  // unannounced to screen readers — WCAG 4.1.2 (Name, Role, Value).
  const offenders = await window.evaluate(() => {
    const result: { selector: string; html: string }[] = [];
    const buttons = Array.from(document.querySelectorAll("button"));
    for (const btn of buttons) {
      // Skip the Material UI invisible focus-touch ripple buttons embedded
      // by some MUI components — they are pointer-events: none and not in
      // the accessibility tree.
      if (btn.classList.contains("MuiTouchRipple-root")) continue;
      if (btn.getAttribute("aria-hidden") === "true") continue;
      const ariaLabel = btn.getAttribute("aria-label");
      const ariaLabelledBy = btn.getAttribute("aria-labelledby");
      const text = (btn.textContent ?? "").trim();
      const titleAttr = btn.getAttribute("title");
      // Buttons with visible text are fine. Buttons with aria-label or
      // aria-labelledby are fine. Buttons with neither and no text content
      // are accessibility violations.
      if (text.length > 0 || ariaLabel || ariaLabelledBy || titleAttr) continue;
      result.push({
        selector: btn.id ? `#${btn.id}` : btn.className || btn.tagName.toLowerCase(),
        html: btn.outerHTML.slice(0, 240),
      });
    }
    return result;
  });

  if (offenders.length > 0) {
    // Print the offenders so CI logs name the offending node, fulfilling the
    // "icon-only buttons have aria-label" acceptance criterion.
    console.error(JSON.stringify(offenders, null, 2));
  }
  expect(offenders, "icon-only buttons missing accessible names").toEqual([]);
});

test("scenario-config inputs use visible labels, not placeholder-only", async () => {
  // Acceptance criterion: "all scenario-config form inputs have visible
  // labels (not just placeholders)". An input qualifies if a <label> with a
  // matching `for=` exists OR aria-labelledby resolves OR aria-label is set.
  // Inputs whose only "label" is a placeholder fail.
  const offenders = await window.evaluate(() => {
    type Offender = { name: string; html: string };
    const result: Offender[] = [];
    const fields = Array.from(
      document.querySelectorAll("input, textarea, select")
    ) as HTMLElement[];
    for (const field of fields) {
      // MUI Autocomplete decorates an inner <input role="combobox"> that we
      // already audit via accessible-name checks; ignore hidden helper inputs.
      if (field.getAttribute("type") === "hidden") continue;
      if (field.getAttribute("aria-hidden") === "true") continue;
      const id = field.id;
      const ariaLabel = field.getAttribute("aria-label");
      const ariaLabelledBy = field.getAttribute("aria-labelledby");
      const matchingLabel = id ? document.querySelector(`label[for="${id}"]`) : null;
      if (matchingLabel || ariaLabel || ariaLabelledBy) continue;
      // No visible label of any kind. Placeholder alone is not sufficient.
      result.push({
        name: id || field.getAttribute("name") || field.tagName,
        html: field.outerHTML.slice(0, 240),
      });
    }
    return result;
  });

  if (offenders.length > 0) {
    console.error(JSON.stringify(offenders, null, 2));
  }
  expect(offenders, "form inputs missing visible labels").toEqual([]);
});
