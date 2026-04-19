import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/700.css";

import "./i18nConfig";
import "./index.css";

if (import.meta.env.DEV) {
  const axe = await import("@axe-core/react");
  axe.default(React, ReactDOM, 1000);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
