#!/usr/bin/env node
/* eslint-env node */
/*
 * Locale completeness check.
 *
 * Compares src/locales/{en,ar,th}.json against the English baseline and
 * fails when any non-English locale is missing keys or has extra keys.
 * Issue #123: this is the CI gate that keeps the three locale files in
 * lockstep before each release.
 *
 * Run with `--fix` to add missing keys to the non-English locales using
 * the English value as a placeholder. The fallbackWhitespace post-processor
 * in src/i18nConfig.js then substitutes the English value at runtime if the
 * placeholder is left untranslated.
 */

const fs = require("node:fs");
const path = require("node:path");

const LOCALES_DIR = path.join(__dirname, "..", "src", "locales");
const BASE_LOCALE = "en";
const TARGET_LOCALES = ["ar", "th"];
const FIX = process.argv.includes("--fix");

function readLocale(code) {
  const file = path.join(LOCALES_DIR, `${code}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeLocale(code, data) {
  const file = path.join(LOCALES_DIR, `${code}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 4) + "\n", "utf8");
}

const base = readLocale(BASE_LOCALE);
const baseKeys = new Set(Object.keys(base));

// Per i18next CLDR rules, non-English locales legitimately carry plural
// variants the English file does not (Arabic uses zero/one/two/few/many/other,
// English uses one/other). i18nConfig.js sets pluralSeparator = "_", so a
// key like `foo_zero` is valid in ar.json when `foo_one` exists in en.json.
const PLURAL_SUFFIXES = ["zero", "one", "two", "few", "many", "other"];
const NON_ENGLISH_PLURAL_SUFFIXES = ["zero", "two", "few", "many"];

function pluralBaseKey(key) {
  for (const suffix of PLURAL_SUFFIXES) {
    if (key.endsWith(`_${suffix}`)) return key.slice(0, -(suffix.length + 1));
  }
  return null;
}
function hasAnyPluralVariantInBase(key) {
  const stem = pluralBaseKey(key);
  if (!stem) return false;
  return PLURAL_SUFFIXES.some((s) => baseKeys.has(`${stem}_${s}`));
}

function reportDiff(label, glyph, keys) {
  console.error(`  ${label} ${keys.length} key(s):`);
  for (const key of keys) console.error(`    ${glyph} ${key}`);
}

let hasFailures = false;

for (const code of TARGET_LOCALES) {
  const target = readLocale(code);
  const targetKeys = new Set(Object.keys(target));

  const missing = [...baseKeys].filter((k) => !targetKeys.has(k));
  const extra = [...targetKeys].filter((k) => !baseKeys.has(k) && !hasAnyPluralVariantInBase(k));

  if (missing.length === 0 && extra.length === 0) {
    console.log(
      `[locale-lint] OK  ${code}.json — ${targetKeys.size} keys, in sync with ${BASE_LOCALE}.json`
    );
    continue;
  }

  if (FIX) {
    const merged = { ...target };
    for (const key of missing) {
      merged[key] = base[key];
    }
    for (const key of extra) {
      delete merged[key];
    }
    // Stable order: follow the English key order, but place each language's
    // legitimate plural variants (zero/two/few/many) directly after the
    // matching `_one` key from English so plural groups stay adjacent. Any
    // remaining merged key without an English anchor (rare: a non-English
    // plural variant whose stem has no `_one` form in English) is appended
    // at the end so it isn't silently dropped on write.
    const orderedMerged = {};
    const emittedKeys = new Set();
    for (const key of Object.keys(base)) {
      orderedMerged[key] = merged[key];
      emittedKeys.add(key);
      if (key.endsWith("_one")) {
        const stem = key.slice(0, -"_one".length);
        for (const suffix of NON_ENGLISH_PLURAL_SUFFIXES) {
          const variant = `${stem}_${suffix}`;
          if (variant in merged && !emittedKeys.has(variant)) {
            orderedMerged[variant] = merged[variant];
            emittedKeys.add(variant);
          }
        }
      }
    }
    for (const key of Object.keys(merged)) {
      if (!emittedKeys.has(key)) {
        orderedMerged[key] = merged[key];
        emittedKeys.add(key);
      }
    }
    writeLocale(code, orderedMerged);
    console.log(
      `[locale-lint] FIX ${code}.json — added ${missing.length} missing key(s), removed ${extra.length} extra key(s)`
    );
    continue;
  }

  hasFailures = true;
  console.error(`[locale-lint] FAIL ${code}.json out of sync with ${BASE_LOCALE}.json:`);
  if (missing.length > 0) reportDiff("Missing", "-", missing);
  if (extra.length > 0) reportDiff("Extra", "+", extra);
}

if (hasFailures) {
  console.error(
    "\n[locale-lint] Locale files are out of sync. Run `node scripts/check-locales.js --fix` to add missing keys with the English value as a placeholder."
  );
  process.exit(1);
}

console.log("[locale-lint] All locales are in sync with the English baseline.");
