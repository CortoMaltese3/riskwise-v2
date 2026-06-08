import { describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.resolve(here, "..", "..", "public", "updateResolver.js");
const requireCjs = createRequire(import.meta.url);
const {
  versionFromTag,
  parseApiRelease,
  parseAtomFeed,
  resolveLatestRelease,
  isTransientError,
  withRetry,
} = requireCjs(modulePath);

const ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>tag:github.com,2008:Repository/1212847065/v2.1.9</id>
    <link rel="alternate" type="text/html" href="https://github.com/CortoMaltese3/riskwise-v2/releases/tag/v2.1.9"/>
    <title>2.1.9</title>
  </entry>
  <entry>
    <id>tag:github.com,2008:Repository/1212847065/v2.1.8</id>
    <link rel="alternate" type="text/html" href="https://github.com/CortoMaltese3/riskwise-v2/releases/tag/v2.1.8"/>
    <title>v2.1.8</title>
  </entry>
</feed>`;

describe("versionFromTag", () => {
  it("strips a leading v (any case)", () => {
    expect(versionFromTag("v2.1.9")).toBe("2.1.9");
    expect(versionFromTag("V2.1.9")).toBe("2.1.9");
    expect(versionFromTag("2.1.9")).toBe("2.1.9");
  });

  it("returns an empty string for non-strings", () => {
    expect(versionFromTag(null)).toBe("");
    expect(versionFromTag(undefined)).toBe("");
  });
});

describe("parseApiRelease", () => {
  it("extracts tag and version from a GitHub API release payload", () => {
    expect(parseApiRelease(JSON.stringify({ tag_name: "v2.1.9", name: "2.1.9" }))).toEqual({
      tag: "v2.1.9",
      version: "2.1.9",
    });
  });

  it("returns null for malformed JSON or a missing tag", () => {
    expect(parseApiRelease("not json")).toBeNull();
    expect(parseApiRelease(JSON.stringify({ name: "no tag" }))).toBeNull();
  });
});

describe("parseAtomFeed", () => {
  it("reads the newest entry's tag from the link href", () => {
    expect(parseAtomFeed(ATOM_FEED)).toEqual({ tag: "v2.1.9", version: "2.1.9" });
  });

  it("falls back to the <id> when no tag link is present", () => {
    const xml = `<feed><entry><id>tag:github.com,2008:Repository/1/v3.0.0</id></entry></feed>`;
    expect(parseAtomFeed(xml)).toEqual({ tag: "v3.0.0", version: "3.0.0" });
  });

  it("returns null when there are no entries", () => {
    expect(parseAtomFeed("<feed></feed>")).toBeNull();
    expect(parseAtomFeed(null)).toBeNull();
  });
});

describe("resolveLatestRelease", () => {
  const apiLatestUrl = "https://api.github.com/repos/o/r/releases/latest";
  const atomUrl = "https://github.com/o/r/releases.atom";

  it("prefers the API and does not touch the atom feed when it succeeds", async () => {
    const fetchText = vi.fn(async (url) => {
      if (url === apiLatestUrl) return JSON.stringify({ tag_name: "v2.1.9" });
      throw new Error("atom should not be called");
    });
    const result = await resolveLatestRelease({ apiLatestUrl, atomUrl, fetchText });
    expect(result).toEqual({ tag: "v2.1.9", version: "2.1.9", source: "api" });
    expect(fetchText).toHaveBeenCalledTimes(1);
  });

  it("falls back to the atom feed when the API fails (the 504 case)", async () => {
    const fetchText = vi.fn(async (url) => {
      if (url === apiLatestUrl) throw new Error("HTTP 504 Gateway Time-out");
      return ATOM_FEED;
    });
    const result = await resolveLatestRelease({ apiLatestUrl, atomUrl, fetchText });
    expect(result).toEqual({ tag: "v2.1.9", version: "2.1.9", source: "atom" });
    expect(fetchText).toHaveBeenCalledTimes(2);
  });

  it("returns null when both the API and the atom feed fail", async () => {
    const fetchText = vi.fn(async () => {
      throw new Error("HTTP 504");
    });
    expect(await resolveLatestRelease({ apiLatestUrl, atomUrl, fetchText })).toBeNull();
  });
});

describe("isTransientError", () => {
  it("treats 5xx / 408 / 429 HTTP errors as transient", () => {
    expect(isTransientError(new Error("HTTP 504 Gateway Time-out"))).toBe(true);
    expect(isTransientError(new Error("HTTP 500"))).toBe(true);
    expect(isTransientError(new Error("HTTP 429"))).toBe(true);
    expect(isTransientError(new Error("HTTP 408"))).toBe(true);
  });

  it("does not retry 4xx (other than 408/429) or unknown errors", () => {
    expect(isTransientError(new Error("HTTP 404 Not Found"))).toBe(false);
    expect(isTransientError(new Error("boom"))).toBe(false);
  });

  it("treats transient socket error codes as retryable", () => {
    const err = new Error("connection reset");
    err.code = "ECONNRESET";
    expect(isTransientError(err)).toBe(true);
  });
});

describe("withRetry", () => {
  const noSleep = vi.fn().mockResolvedValue(undefined);

  it("returns the first successful result without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await withRetry(fn, { sleepFn: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures up to the limit, then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 504"))
      .mockRejectedValueOnce(new Error("HTTP 502"))
      .mockResolvedValue("ok");
    expect(await withRetry(fn, { retries: 2, sleepFn: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up after exhausting retries and rethrows the last error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("HTTP 504"));
    await expect(withRetry(fn, { retries: 2, sleepFn: noSleep })).rejects.toThrow("HTTP 504");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-transient errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("HTTP 404"));
    await expect(withRetry(fn, { retries: 3, sleepFn: noSleep })).rejects.toThrow("HTTP 404");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
