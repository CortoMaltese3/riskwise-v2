import { describe, expect, it } from "vitest";

import { bidiIsolate, isRtlLocale } from "./bidi";

const LRI = "⁦";
const RLI = "⁧";
const PDI = "⁩";

describe("isRtlLocale", () => {
  it("recognises RTL languages by prefix", () => {
    expect(isRtlLocale("ar")).toBe(true);
    expect(isRtlLocale("ar-EG")).toBe(true);
    expect(isRtlLocale("he")).toBe(true);
    expect(isRtlLocale("fa-IR")).toBe(true);
    expect(isRtlLocale("ur")).toBe(true);
  });

  it("returns false for LTR languages and falsy input", () => {
    expect(isRtlLocale("en")).toBe(false);
    expect(isRtlLocale("th")).toBe(false);
    expect(isRtlLocale("")).toBe(false);
    expect(isRtlLocale(null)).toBe(false);
    expect(isRtlLocale(undefined)).toBe(false);
  });
});

describe("bidiIsolate", () => {
  it("wraps ASCII runs with LRI/PDI in RTL locales", () => {
    // The ASCII run includes the leading space, matching the i18next
    // post-processor behaviour. The wrap protects the entire ASCII slice
    // (digits + Latin letters + spaces) from RTL reordering.
    expect(bidiIsolate("سعر USD 100", "ar")).toBe(`سعر${LRI} USD 100${PDI}`);
  });

  it("wraps Arabic/Hebrew runs with RLI/PDI in LTR locales", () => {
    expect(bidiIsolate("Total سعر now", "en")).toBe(`Total ${RLI}سعر${PDI} now`);
  });

  it("leaves pure-locale text untouched", () => {
    expect(bidiIsolate("Total cost", "en")).toBe("Total cost");
    expect(bidiIsolate("ราคารวม", "th")).toBe("ราคารวม");
  });

  it("does not wrap whitespace-only matches", () => {
    expect(bidiIsolate("   ", "ar")).toBe("   ");
  });

  it("passes through non-string values unchanged", () => {
    expect(bidiIsolate(null as unknown as string, "ar")).toBeNull();
    expect(bidiIsolate(undefined as unknown as string, "ar")).toBeUndefined();
    expect(bidiIsolate(42 as unknown as string, "ar")).toBe(42);
  });

  it("treats missing locale as LTR", () => {
    expect(bidiIsolate("Total cost", undefined)).toBe("Total cost");
  });
});
