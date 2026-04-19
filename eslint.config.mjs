// ESLint v9 flat config.
// Source set is intentionally narrow: the React app under `src/` plus root
// Vite/Vitest config files. The Electron main-process entry under `build/`
// is generated output and excluded from the ignore list below.
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    // TypeScript files are excluded until a dedicated TS parser is wired up
    // (#<tbd>). The v2 React surface is still authored as .jsx; .ts lives in
    // src/lib/ for generated types and a handful of thin clients.
    ignores: [
      "node_modules/**",
      "build/**",
      "dist/**",
      "public/**",
      "backend/**",
      "data/**",
      "docs/**",
      "spike/**",
      "translations/**",
      "**/*.ts",
      "**/*.tsx",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // Vite/React convention: allow unused args that start with `_`.
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // `{false && (...)}` is used throughout the v1 cards to gate UI
      // sections pending a product decision (search: "Remove until further
      // notice"). Promoting that pattern from warn to error is out of scope
      // for the tooling baseline; re-enable once the gated sections are
      // either deleted or feature-flagged.
      "no-constant-binary-expression": "off",
    },
  },
  {
    files: ["src/**/__tests__/**/*.{js,jsx}", "src/**/*.test.{js,jsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
    },
  },
  // theme-tokens-enforced: component files listed here must consume colours
  // via the MUI theme (e.g. `bgcolor: "header.main"`). Raw hex or rgb() in
  // source literals is an error. Issue #15 migrates Header first; add files
  // to this glob list as each component is converted to tokens.
  {
    files: ["src/components/nav/Header.jsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^\\s*#[0-9a-fA-F]{3,8}\\s*$/]",
          message: "Use a theme token (palette path or CSS variable) instead of a raw hex colour.",
        },
        {
          selector: "Literal[value=/rgba?\\(/]",
          message: "Use a theme token instead of a raw rgb()/rgba() colour.",
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}|rgba?\\(/]",
          message:
            "Use a theme token (palette path or CSS variable) instead of a raw hex/rgb colour in template strings.",
        },
      ],
    },
  },
  {
    files: ["*.config.{js,mjs,cjs}", "*.config.*.{js,mjs,cjs}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Build/packaging scripts run under Node directly (e.g. electron-builder
    // afterPack hooks). They aren't part of the renderer source tree but
    // need Node globals like `require`, `module`, and `console`.
    files: ["scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
];
