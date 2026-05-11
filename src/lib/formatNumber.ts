// Locale-aware number and currency formatting.
//
// Western (latn) digits are used by default regardless of locale so numeric
// magnitudes read identically across en/ar/th — required for scientific
// data display. Only grouping/decimal separators follow the locale. Pass
// `numberingSystem: "auto"` to opt into the locale-default digits.
//
// Both helpers fall back to `String(value)` when the locale/currency is
// invalid — same try/catch shape as `formatDate.ts` so a typo in a user
// setting never breaks the renderer (#351).

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

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

export function formatNumber(
  value: number,
  locale: string | undefined = "en-US",
  options: FormatNumberOptions = {}
): string {
  if (!isValidNumber(value)) return "";

  const { numberingSystem = "latn", ...rest } = options;
  const intlOptions: Intl.NumberFormatOptions = { ...DEFAULT_OPTIONS, ...rest };
  if (numberingSystem !== "auto") {
    intlOptions.numberingSystem = numberingSystem;
  }

  try {
    return new Intl.NumberFormat(locale, intlOptions).format(value);
  } catch {
    return String(value);
  }
}

export function formatNumberDivisor(
  value: number,
  divisor: number,
  locale: string | undefined = "en-US",
  options: FormatNumberOptions = {}
): string {
  if (!divisor) return "";
  return formatNumber(value / divisor, locale, options);
}

export function formatNumberWithUnit(
  value: number,
  unit: string,
  locale: string | undefined = "en-US",
  options: FormatNumberOptions = {}
): string {
  const formatted = formatNumber(value, locale, options);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatCurrency(
  value: number,
  locale: string | undefined = "en-US",
  currency: string = "EUR",
  options: FormatNumberOptions = {}
): string {
  if (!isValidNumber(value)) return "";

  const { numberingSystem = "latn", ...rest } = options;
  const intlOptions: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    ...rest,
  };
  if (numberingSystem !== "auto") {
    intlOptions.numberingSystem = numberingSystem;
  }

  try {
    return new Intl.NumberFormat(locale, intlOptions).format(value);
  } catch {
    return String(value);
  }
}

export default formatNumber;
