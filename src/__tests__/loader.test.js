import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// `public/loader.js` is the splash bootstrap that runs inside the loader
// BrowserWindow. It is not a module (plain IIFE using `window.electron` and
// the DOM), so — like `preload.test.js` — we read the source and evaluate it
// against the jsdom globals after wiring a fake bridge.
//
// These tests pin the contract the main process relies on: the splash must
// render `loader:init`'s `initialMessage` into the status line (the field
// `sendLoaderInit` seeds so the first phase survives the subscribe race) and
// update it on every `loader:status` event.

const loaderBodyMarkup = `
  <div class="wordmark" id="wordmark"></div>
  <img class="mark" id="mark" alt="" />
  <div class="status" id="status"></div>
  <div class="version" id="version"></div>
`;

const loadSplash = () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const loaderPath = path.resolve(here, "..", "..", "public", "loader.js");
  const source = readFileSync(loaderPath, "utf8");

  const captured = { init: null, status: null };
  window.electron = {
    onLoaderInit: vi.fn((cb) => {
      captured.init = cb;
    }),
    onLoaderStatus: vi.fn((cb) => {
      captured.status = cb;
    }),
  };

  // jsdom's document is "complete" during tests, so the IIFE runs `start()`
  // synchronously on evaluation — the bridge must already be in place.
  new Function(source)();
  return captured;
};

describe("splash loader bootstrap", () => {
  beforeEach(() => {
    document.body.innerHTML = loaderBodyMarkup;
  });

  it("subscribes to both loader channels on start", () => {
    loadSplash();
    expect(window.electron.onLoaderInit).toHaveBeenCalledTimes(1);
    expect(window.electron.onLoaderStatus).toHaveBeenCalledTimes(1);
  });

  it("renders the seeded initialMessage from loader:init", () => {
    const { init } = loadSplash();

    init({
      wordmark: "RISK ",
      wordmarkAccent: "WISE",
      assetUrl: "loader-themes/default/mark.svg",
      assetAlt: "Loading",
      version: "v1.2.3",
      initialMessage: "Starting application engine...",
    });

    expect(document.getElementById("status").textContent).toBe("Starting application engine...");
    expect(document.getElementById("version").textContent).toBe("v1.2.3");
    const wordmark = document.getElementById("wordmark");
    expect(wordmark.textContent).toBe("RISK WISE");
    expect(wordmark.querySelector(".accent").textContent).toBe("WISE");
    expect(document.getElementById("mark").getAttribute("src")).toBe(
      "loader-themes/default/mark.svg"
    );
  });

  it("updates the status line on each loader:status event", () => {
    const { init, status } = loadSplash();

    init({ initialMessage: "Starting application engine..." });
    status({ phase: "engine-ready", message: "Engine ready..." });
    expect(document.getElementById("status").textContent).toBe("Engine ready...");

    status({ phase: "finalizing", message: "Almost ready..." });
    expect(document.getElementById("status").textContent).toBe("Almost ready...");
  });

  it("leaves the status untouched when a status event carries no message", () => {
    const { init, status } = loadSplash();

    init({ initialMessage: "Starting application engine..." });
    status({ phase: "tiles" });
    expect(document.getElementById("status").textContent).toBe("Starting application engine...");
  });

  it("ignores a malformed init payload without throwing", () => {
    const { init } = loadSplash();
    expect(() => init(null)).not.toThrow();
    expect(document.getElementById("status").textContent).toBe("");
  });
});
