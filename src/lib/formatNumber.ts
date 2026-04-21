// Locale-aware number formatting. Western (latn) digits are used regardless of
// locale so numeric magnitudes read identically across en/ar/th — scientific
// data display. Only grouping/decimal separators follow the locale.
//
// Example: formatNumber(1234567, "ar") → "1,234,567" (not "١٬٢٣٤٬٥٦٧").

export interface FormatNumberOptions extends Omit<Intl.NumberFormatOptions, "numberingSystem"> {
  /**
   * Override the numbering system. Defaults to `"latn"` (Western digits). Pass
   * `"auto"` to fall back to the locale default (opt-in only).
   */
  numberingSystem?: "latn" | "auto";
}

const DEFAULT_OPTIONS: Intl.NumberFormatOptions = {
  style: "decimal",
  maximumFractionDigits: 2,
};

export function formatNumber(
  value: number,
  locale: string | undefined = "en",
  options: FormatNumberOptions = {}
): string {
  if (value == null || Number.isNaN(value)) return "";

  const { numberingSystem = "latn", ...rest } = options;
  const intlOptions: Intl.NumberFormatOptions = { ...DEFAULT_OPTIONS, ...rest };
  if (numberingSystem !== "auto") {
    intlOptions.numberingSystem = numberingSystem;
  }

  return new Intl.NumberFormat(locale, intlOptions).format(value);
}

export function formatNumberDivisor(
  value: number,
  divisor: number,
  locale: string | undefined = "en",
  options: FormatNumberOptions = {}
): string {
  if (!divisor) return "";
  return formatNumber(value / divisor, locale, options);
}

export default formatNumber;
