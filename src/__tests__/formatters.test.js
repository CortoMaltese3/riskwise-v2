import { describe, expect, it } from "vitest";

import { formatNumber, formatNumberDivisor } from "../utils/formatters";

describe("formatNumber", () => {
  it("inserts grouping commas for thousand separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("caps fractional output at two decimal places", () => {
    expect(formatNumber(1.23456)).toBe("1.23");
  });

  it("renders zero as a bare '0' (no scientific notation)", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("preserves the sign of negative values", () => {
    expect(formatNumber(-4200.5)).toBe("-4,200.5");
  });
});

describe("formatNumberDivisor", () => {
  it("divides before formatting and keeps up to two decimals", () => {
    expect(formatNumberDivisor(10000, 1000)).toBe("10");
    expect(formatNumberDivisor(12345, 10)).toBe("1,234.5");
  });

  it("rounds the divided value to two decimal places", () => {
    expect(formatNumberDivisor(10, 3)).toBe("3.33");
  });
});
