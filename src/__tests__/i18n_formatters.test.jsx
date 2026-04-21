import { describe, expect, it, beforeEach } from "vitest";

import { formatNumber, formatNumberDivisor } from "../lib/formatNumber";
import { formatDate } from "../lib/formatDate";
import i18n, { applyDocumentDirection, isRtl } from "../i18nConfig";

describe("formatNumber", () => {
  it("uses Western digits for Arabic to match scientific data display", () => {
    expect(formatNumber(1234567, "ar")).toBe("1,234,567");
  });

  it("inserts grouping separators for English", () => {
    expect(formatNumber(1234567, "en")).toBe("1,234,567");
  });

  it("caps fractional output at two decimal places by default", () => {
    expect(formatNumber(1.23456, "en")).toBe("1.23");
  });

  it("renders zero as a bare '0'", () => {
    expect(formatNumber(0, "en")).toBe("0");
  });

  it("preserves the sign of negative values", () => {
    expect(formatNumber(-4200.5, "en")).toBe("-4,200.5");
  });

  it("honours an opt-in numberingSystem override without mutating the default", () => {
    // The "auto" escape hatch skips our Latin override; the concrete glyph
    // depends on the runtime's ICU data (Node bundles varying locale sets),
    // so we only assert the override path does not throw and the default
    // path stays Latin.
    expect(() => formatNumber(5, "ar", { numberingSystem: "auto" })).not.toThrow();
    expect(formatNumber(5, "ar")).toBe("5");
  });
});

describe("formatNumberDivisor", () => {
  it("divides before formatting and keeps the default precision cap", () => {
    expect(formatNumberDivisor(10000, 1000, "en")).toBe("10");
    expect(formatNumberDivisor(12345, 10, "en")).toBe("1,234.5");
  });

  it("emits Western digits for Arabic divisor output", () => {
    expect(formatNumberDivisor(2000, 1000, "ar")).toBe("2");
  });
});

describe("formatDate", () => {
  it("renders Thai dates in the Buddhist Era (CE + 543)", () => {
    const result = formatDate(new Date("2025-01-01"), "th", { year: "numeric" });
    expect(result).toContain("2568");
  });

  it("pins Gregorian calendar for English", () => {
    const result = formatDate(new Date("2025-01-01"), "en", { year: "numeric" });
    expect(result).toBe("2025");
  });

  it("pins Gregorian calendar for Arabic (Western year)", () => {
    const result = formatDate(new Date("2025-01-01"), "ar", { year: "numeric" });
    expect(result).toContain("2025");
  });

  it("returns an empty string for a null/undefined input", () => {
    expect(formatDate(null, "en")).toBe("");
    expect(formatDate(undefined, "en")).toBe("");
  });
});

describe("isRtl", () => {
  it("detects Arabic/Hebrew/Farsi as RTL", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("ar-EG")).toBe(true);
    expect(isRtl("he")).toBe(true);
  });

  it("treats English/Thai/Unknown as LTR", () => {
    expect(isRtl("en")).toBe(false);
    expect(isRtl("th")).toBe(false);
    expect(isRtl("fr-FR")).toBe(false);
  });
});

describe("applyDocumentDirection", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("dir");
    document.documentElement.removeAttribute("lang");
  });

  it("sets <html dir='rtl'> for Arabic", () => {
    applyDocumentDirection("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    expect(document.documentElement.getAttribute("lang")).toBe("ar");
  });

  it("sets <html dir='ltr'> for English", () => {
    applyDocumentDirection("en");
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
    expect(document.documentElement.getAttribute("lang")).toBe("en");
  });

  it("reacts to i18n.changeLanguage() through the registered listener", async () => {
    await i18n.changeLanguage("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    await i18n.changeLanguage("en");
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
  });
});

describe("i18next plural resolution", () => {
  it("English picks _one for count=1 and _other for count=N", () => {
    expect(i18n.t("workspace_scenarios_selected", { count: 1, lng: "en" })).toContain(
      "1 scenario selected"
    );
    expect(i18n.t("workspace_scenarios_selected", { count: 5, lng: "en" })).toContain(
      "5 scenarios selected"
    );
  });

  it("Arabic resolves zero/one/two/few/many forms to distinct strings", () => {
    const forms = [0, 1, 2, 3, 11].map((count) =>
      i18n.t("workspace_scenarios_selected", { count, lng: "ar" })
    );
    // BiDi post-processor may wrap the number in LRI/PDI; ignore those markers.
    const unique = new Set(forms.map((s) => s.replace(/[\u2066-\u2069]/g, "")));
    expect(unique.size).toBeGreaterThanOrEqual(4);
  });

  it("Thai falls back to _other (no separate plural forms)", () => {
    const singular = i18n.t("workspace_scenarios_selected", { count: 1, lng: "th" });
    const plural = i18n.t("workspace_scenarios_selected", { count: 5, lng: "th" });
    expect(singular).toContain("1");
    expect(plural).toContain("5");
  });
});
