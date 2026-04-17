import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import "./i18nConfig";
import "./index.css";

if (import.meta.env.DEV) {
  const axe = await import("@axe-core/react");
  axe.default(React, ReactDOM, 1000);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
