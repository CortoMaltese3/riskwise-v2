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
      ".venv/**",
      "playwright-report/**",
      "test-results/**",
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
      // Phase 1 Area 17: production renderer code must route diagnostics
      // through src/lib/logger.ts so records reach the Electron main log
      // (and the structured backend log) instead of dying in DevTools.
      // `console.warn` / `console.error` stay allowed: they're rare and
      // remain visible during development without a bridge.
      "no-console": ["error", { allow: ["warn", "error"] }],
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
    rules: {
      // Tests can log freely (e.g. console.table for baseline output);
      // they don't ship and they're not subject to the Area 17 logger rule.
      "no-console": "off",
    },
  },
  // theme-tokens-enforced (issue #78): every source file under `src/` must
  // consume colours via the MUI theme (palette paths in `sx`, CSS variables,
  // or `theme.palette.*` in styled). Raw hex literals are an error. The only
  // escape hatch is `src/theme/**` where the palette tokens themselves live.
  //
  // density-tokens-enforced (issue #217): the same gate extends to raw `px`
  // and `em` literals in component code. Spacing comes from `theme.spacing(n)`
  // (the MUI 8 px scale); fixed chrome uses the four named-constant escapes
  // (`TOP_BAR_HEIGHT`, `SIDEBAR_WIDTH`, `SIDEBAR_COLLAPSED_WIDTH`,
  // `INPUT_CARD_HEIGHT`). Tests are exempted below — they assert against
  // computed `style.*` values which are inherently in `px`.
  //
  // rgba() is NOT banned here — chart libraries (Chart.js) need raw rgba for
  // per-dataset styling, and the issue's acceptance criteria scope the gate
  // to hex literals only.
  {
    files: ["src/**/*.{js,jsx}"],
    ignores: ["src/theme/**", "src/**/__tests__/**", "src/**/*.test.{js,jsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
          message: "Use a theme token (palette path or CSS variable) instead of a raw hex colour.",
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]",
          message:
            "Use a theme token (palette path or CSS variable) instead of a raw hex colour in template strings.",
        },
        {
          selector: "Literal[value=/\\b\\d+(?:\\.\\d+)?(?:px|em)\\b/]",
          message:
            "Use theme.spacing(n) or a named-constant escape (TOP_BAR_HEIGHT / SIDEBAR_WIDTH / SIDEBAR_COLLAPSED_WIDTH / INPUT_CARD_HEIGHT) instead of a raw px / em literal.",
        },
        {
          selector: "TemplateElement[value.raw=/\\b\\d+(?:\\.\\d+)?(?:px|em)\\b/]",
          message:
            "Use theme.spacing(n) or a named-constant escape (TOP_BAR_HEIGHT / SIDEBAR_WIDTH / SIDEBAR_COLLAPSED_WIDTH / INPUT_CARD_HEIGHT) instead of a raw px / em literal in template strings.",
        },
        // i18n-date-calendar (issue #86): block raw `toLocaleDateString()` /
        // `toLocaleString()` calls that don't pin an explicit `calendar`.
        // Thai locales default to the Buddhist calendar which shifts years by
        // +543 unless callers opt in explicitly. Route through
        // `src/lib/formatDate.ts` instead, which always selects a calendar.
        {
          selector: "CallExpression[callee.property.name='toLocaleDateString'][arguments.length<2]",
          message:
            "Use formatDate() from src/lib/formatDate instead, or pass an explicit { calendar } option.",
        },
        {
          selector:
            "CallExpression[callee.property.name='toLocaleDateString'][arguments.1.type='ObjectExpression']:not([arguments.1.properties.0.key.name='calendar']):not(:has(Property[key.name='calendar']))",
          message:
            "toLocaleDateString() options must include an explicit `calendar` key (e.g. 'gregory' or 'buddhist'). Prefer formatDate() from src/lib/formatDate.",
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
    // electron-builder auto-detects this exact filename (not
    // electron-builder.config.js — see DECISIONS.md and the file's
    // header comment). It's CommonJS and runs under Node.
    files: ["electron-builder.js"],
    languageOptions: {
      sourceType: "commonjs",
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
