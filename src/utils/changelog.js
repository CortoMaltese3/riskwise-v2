// Lightweight Keep-a-Changelog parser. Returns the first ``## [X.Y.Z]``
// section with a release date (Unreleased is skipped). When a release has a
// ``### Highlights`` subsection, only those bullets are returned; otherwise
// bullets aggregate across all subsections.

const VERSION_HEADING =
  /^##\s+\[?([^\]\s]+)\]?(?:\([^)]*\))?\s*(?:-?\s*\(?(\d{4}-\d{2}-\d{2})\)?)?\s*$/;
const SUBSECTION_HEADING = /^###\s+(.+?)\s*$/;
const BULLET = /^\s*[-*]\s+(.+?)\s*$/;
// Strip Markdown link wrappers (`[text](url)`) and bold (`**text**`) so the
// card shows readable lines without rewriting react-markdown's rendering.
const stripMarkdown = (line) =>
  line
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();

// One bullet can carry hash + PR ref + closes-tag in sequence, so iterate
// until a pass changes nothing.
const stripArtifacts = (text) => {
  let out = text;
  let prev;
  do {
    prev = out;
    out = out
      .replace(/,?\s*closes\s+#\d+\s*$/i, "")
      .replace(/\s*\(?#\d+\)?\s*$/, "")
      .replace(/\s*\(?[0-9a-f]{6,40}\)?\s*$/i, "")
      .trim();
  } while (out !== prev);
  return out;
};

const collectRelease = (lines, startIdx, maxBullets) => {
  const highlightBullets = [];
  let inHighlights = false;
  let nextSectionIdx = lines.length;

  for (let i = startIdx; i < lines.length; i += 1) {
    const line = lines[i];
    if (VERSION_HEADING.test(line)) {
      nextSectionIdx = i;
      break;
    }
    const sub = line.match(SUBSECTION_HEADING);
    if (sub) {
      inHighlights = /^highlights\s*$/i.test(sub[1]);
      continue;
    }
    if (!inHighlights) continue;
    const bulletMatch = line.match(BULLET);
    if (bulletMatch) {
      const text = stripArtifacts(stripMarkdown(bulletMatch[1]));
      if (text) highlightBullets.push(text);
      if (highlightBullets.length >= maxBullets) break;
    }
  }

  if (highlightBullets.length > 0) {
    return { bullets: highlightBullets, nextSectionIdx };
  }

  const bullets = [];
  for (let i = startIdx; i < nextSectionIdx; i += 1) {
    const line = lines[i];
    if (SUBSECTION_HEADING.test(line)) continue;
    const bulletMatch = line.match(BULLET);
    if (bulletMatch) {
      const text = stripArtifacts(stripMarkdown(bulletMatch[1]));
      if (text) bullets.push(text);
      if (bullets.length >= maxBullets) break;
    }
  }
  return { bullets, nextSectionIdx };
};

export const parseChangelog = (source, { maxBullets = 5 } = {}) => {
  if (typeof source !== "string" || !source.trim()) {
    return { version: null, releaseDate: null, bullets: [] };
  }
  const lines = source.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const versionMatch = lines[i].match(VERSION_HEADING);
    if (!versionMatch) continue;
    const [, ver, date] = versionMatch;
    // Skip placeholder sections that lack a date (e.g. "Unreleased").
    if (!date || /unreleased/i.test(ver)) continue;
    const { bullets } = collectRelease(lines, i + 1, maxBullets);
    return { version: ver, releaseDate: date, bullets };
  }

  return { version: null, releaseDate: null, bullets: [] };
};

export default parseChangelog;
