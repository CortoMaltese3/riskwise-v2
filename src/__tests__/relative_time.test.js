import { describe, it, expect } from "vitest";

import { formatRelativeTime } from "../lib/relativeTime";

const NOW = new Date("2026-05-06T12:00:00Z").getTime();

describe("formatRelativeTime", () => {
  it("returns empty string for null/invalid input", () => {
    expect(formatRelativeTime(null, "en", { now: NOW })).toBe("");
    expect(formatRelativeTime("not-a-date", "en", { now: NOW })).toBe("");
  });

  it("formats hours ago in English", () => {
    const past = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(past, "en", { now: NOW })).toBe("2 hours ago");
  });

  it("formats minutes ago in English", () => {
    const past = new Date(NOW - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(past, "en", { now: NOW })).toBe("5 minutes ago");
  });

  it("falls back to en for unsupported locales", () => {
    const past = new Date(NOW - 60 * 60 * 1000).toISOString();
    const result = formatRelativeTime(past, "xx-XX", { now: NOW });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
