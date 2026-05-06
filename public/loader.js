// Splash loader bootstrap. Runs in the loader BrowserWindow with
// `public/preload.js` providing `window.electron.onLoaderInit` and
// `window.electron.onLoaderStatus` (parallel to `onProgress`). All visible
// strings, colours and asset paths come from `loader-themes/<theme>/`; this
// file only wires events to DOM nodes.
//
// Theme selection: the main process passes the theme name via the URL hash
// (e.g. `loader.html#default`). Reading the hash synchronously at script
// start lets us inject the theme stylesheet into <head> before the body
// paints — no flash of unstyled content while we wait for IPC. Wordmark,
// asset src and version are filled in once `loader:init` arrives; status
// text updates per `loader:status` event.

(function () {
  "use strict";

  // Restrict theme slug to safe filename characters before building a path.
  const safeThemeName = (raw) => {
    if (typeof raw !== "string") return "default";
    return /^[a-z0-9_-]+$/i.test(raw) ? raw : "default";
  };

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (ch) => {
      switch (ch) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
        default:
          return ch;
      }
    });

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  // Inject the theme stylesheet immediately. Running in <head> means
  // `document.head` exists and the link is a render-blocking resource, so
  // the body never paints with the default white background.
  const themeName = safeThemeName(
    typeof window !== "undefined" && window.location ? window.location.hash.slice(1) : ""
  );
  const themeLink = document.createElement("link");
  themeLink.rel = "stylesheet";
  themeLink.href = "loader-themes/" + themeName + "/theme.css";
  document.head.appendChild(themeLink);

  const applyInit = (init) => {
    if (!init || typeof init !== "object") return;

    const wordmarkEl = document.getElementById("wordmark");
    if (wordmarkEl) {
      const head = init.wordmark ? escapeHtml(init.wordmark) : "";
      const tail = init.wordmarkAccent ? escapeHtml(init.wordmarkAccent) : "";
      wordmarkEl.innerHTML = tail
        ? head + '<span class="accent">' + tail + "</span>"
        : head;
    }

    const markEl = document.getElementById("mark");
    if (markEl) {
      if (init.assetUrl) markEl.setAttribute("src", init.assetUrl);
      markEl.setAttribute("alt", init.assetAlt || "Loading");
    }

    if (init.version) setText("version", init.version);
    if (init.initialMessage) setText("status", init.initialMessage);
  };

  const applyStatus = (payload) => {
    if (payload && typeof payload.message === "string") {
      setText("status", payload.message);
    }
  };

  const start = () => {
    const bridge = window.electron;
    if (!bridge) return;
    if (typeof bridge.onLoaderInit === "function") {
      bridge.onLoaderInit(applyInit);
    }
    if (typeof bridge.onLoaderStatus === "function") {
      bridge.onLoaderStatus(applyStatus);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
