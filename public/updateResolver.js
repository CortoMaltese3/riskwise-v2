// Resolve the latest GitHub release WITHOUT depending on
// `github.com/<owner>/<repo>/releases/latest`. electron-updater's
// `GitHubProvider` hits that web endpoint to pin the latest *stable* tag, and
// it has returned persistent `504 Gateway Time-out`s for this repo while every
// other release endpoint stays healthy (the `releases.atom` feed,
// `api.github.com`, and the *direct* `releases/download/<tag>/...` asset
// paths). A single 504 there aborts the whole update check before
// `update-available` can fire, so no prompt ever shows.
//
// This module resolves the tag via `api.github.com` (canonical — its
// `/releases/latest` excludes drafts and prereleases) with the `releases.atom`
// feed as a fallback. The caller then points electron-updater's *generic*
// provider at the resolved tag's direct download path, which serves
// `latest.yml` + the installer reliably — so the whole check → download →
// install flow avoids the flaky endpoint.
//
// Kept electron-free (no `require("electron")`) so it can be unit-tested in
// isolation; the caller injects a `fetchText(url, headers)` function.

// Normalize a release tag (`v2.1.9`) to a bare semver string (`2.1.9`).
const versionFromTag = (tag) =>
  typeof tag === "string" ? tag.trim().replace(/^v/i, "") : "";

// Parse an `api.github.com` release object → `{ tag, version }`, or `null` if
// the payload is malformed or has no tag.
const parseApiRelease = (jsonText) => {
  try {
    const data = JSON.parse(jsonText);
    const tag = data && typeof data.tag_name === "string" ? data.tag_name.trim() : "";
    if (!tag) return null;
    return { tag, version: versionFromTag(tag) };
  } catch {
    return null;
  }
};

// Parse a `releases.atom` feed → `{ tag, version }` for the newest entry, or
// `null`. Atom entries are ordered newest-first. The `<link href>` ends in
// `/releases/tag/<tag>`; we prefer it over the `<id>` because the id embeds a
// numeric repo id that is awkward to split on. Note: the atom feed lists
// prereleases too (with no flag to tell them apart), so an atom-resolved tag is
// only trusted because the downstream `latest.yml` fetch acts as a guard — a
// prerelease tag publishes `beta.yml`, not `latest.yml`, so the generic
// provider 404s instead of offering a false update.
const parseAtomFeed = (xmlText) => {
  if (typeof xmlText !== "string") return null;
  const entry = xmlText.match(/<entry>[\s\S]*?<\/entry>/);
  if (!entry) return null;
  let tag = "";
  const href = entry[0].match(/<link[^>]*href="([^"]*\/releases\/tag\/[^"]+)"/);
  if (href) {
    const m = href[1].match(/\/releases\/tag\/(.+)$/);
    if (m) tag = decodeURIComponent(m[1].trim());
  }
  if (!tag) {
    const id = entry[0].match(/<id>[^<]*\/([^/<]+)<\/id>/);
    if (id) tag = id[1].trim();
  }
  if (!tag) return null;
  return { tag, version: versionFromTag(tag) };
};

// Resolve the latest release tag via the API (preferred) with the atom feed as
// a fallback. `fetchText(url, headers)` must resolve to the response body as a
// string or reject. Returns `{ tag, version, source }` or `null` when both
// sources fail.
const resolveLatestRelease = async ({ apiLatestUrl, atomUrl, fetchText }) => {
  try {
    const body = await fetchText(apiLatestUrl, { Accept: "application/vnd.github+json" });
    const parsed = parseApiRelease(body);
    if (parsed) return { ...parsed, source: "api" };
  } catch {
    // API unavailable/rate-limited — fall through to the atom feed.
  }
  try {
    const body = await fetchText(atomUrl, {
      Accept: "application/atom+xml, application/xml, text/xml",
    });
    const parsed = parseAtomFeed(body);
    if (parsed) return { ...parsed, source: "atom" };
  } catch {
    // Both sources failed — caller decides how to report it.
  }
  return null;
};

// True for errors worth retrying: HTTP 5xx / 408 / 429, or transient socket
// failures. `fetchBuffer` rejects non-2xx as `Error("HTTP <code> ...")`, so we
// match on the message as well as `err.code`.
const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ENETUNREACH",
]);

const isTransientError = (err) => {
  const message = String(err && err.message ? err.message : err || "");
  if (/HTTP\s+(5\d\d|408|429)\b/.test(message)) return true;
  return Boolean(err && err.code && TRANSIENT_CODES.has(err.code));
};

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retry `fn` on transient failures with linear backoff. `sleepFn` is injectable
// so tests run without real timers. Non-retryable errors (and the final
// attempt) reject immediately.
const withRetry = async (
  fn,
  { retries = 2, baseDelayMs = 500, isRetryable = isTransientError, sleepFn = defaultSleep } = {}
) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries || !isRetryable(err)) throw err;
      await sleepFn(baseDelayMs * (attempt + 1));
    }
  }
  throw lastError;
};

module.exports = {
  versionFromTag,
  parseApiRelease,
  parseAtomFeed,
  resolveLatestRelease,
  isTransientError,
  withRetry,
};
