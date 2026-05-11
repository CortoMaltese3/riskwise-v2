import { describe, expect, it } from "vitest";

import { formatCurrency, formatNumber, formatNumberDivisor } from "./formatNumber";

describe("formatNumber", () => {
  it("formats integers and decimals with locale grouping", () => {
    expect(formatNumber(1234567, "en-US")).toBe("1,234,567");
    expect(formatNumber(1234.567, "en-US")).toBe("1,234.57");
    expect(formatNumber(1234567, "de-DE")).toBe("1.234.567");
  });

  it("returns empty string for null, undefined, NaN", () => {
    expect(formatNumber(null as unknown as number, "en-US")).toBe("");
    expect(formatNumber(undefined as unknown as number, "en-US")).toBe("");
    expect(formatNumber(Number.NaN, "en-US")).toBe("");
  });

  it("handles zero, negatives and large magnitudes", () => {
    expect(formatNumber(0, "en-US")).toBe("0");
    expect(formatNumber(-12345.67, "en-US")).toBe("-12,345.67");
    expect(formatNumber(1e12, "en-US")).toBe("1,000,000,000,000");
  });

  it("falls back to String(value) on an invalid locale", () => {
    // `not_a_locale!` is rejected by `Intl.NumberFormat` so the try/catch
    // path must keep the renderer from crashing.
    expect(formatNumber(1234, "not_a_locale!")).toBe("1234");
  });
});

describe("formatNumberDivisor", () => {
  it("divides before formatting", () => {
    expect(formatNumberDivisor(1500, 1000, "en-US")).toBe("1.5");
  });

  it("returns empty string when divisor is zero", () => {
    expect(formatNumberDivisor(1500, 0, "en-US")).toBe("");
  });
});

describe("formatCurrency", () => {
  it("formats positive amounts with the requested currency symbol", () => {
    expect(formatCurrency(1234.5, "en-US", "USD")).toBe("$1,234.50");
    expect(formatCurrency(1234.5, "en-US", "EUR")).toBe("€1,234.50");
  });

  it("formats negatives, zero, and large values", () => {
    expect(formatCurrency(0, "en-US", "USD")).toBe("$0.00");
    expect(formatCurrency(-1234.5, "en-US", "USD")).toBe("-$1,234.50");
    expect(formatCurrency(1e9, "en-US", "USD")).toBe("$1,000,000,000.00");
  });

  it("returns empty string for null, undefined, NaN", () => {
    expect(formatCurrency(null as unknown as number, "en-US", "USD")).toBe("");
    expect(formatCurrency(undefined as unknown as number, "en-US", "USD")).toBe("");
    expect(formatCurrency(Number.NaN, "en-US", "USD")).toBe("");
  });

  it("falls back to String(value) on an invalid currency code", () => {
    // `XXX` would be accepted by Intl but a clearly bogus code throws.
    expect(formatCurrency(1234, "en-US", "not-a-currency!")).toBe("1234");
  });

  it("falls back to String(value) on an invalid locale", () => {
    expect(formatCurrency(1234, "not_a_locale!", "USD")).toBe("1234");
  });
});
