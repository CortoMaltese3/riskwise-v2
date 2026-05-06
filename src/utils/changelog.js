// Lightweight Keep-a-Changelog parser. Pulls the most recent released version
// (the first ``## [X.Y.Z]`` heading with a date) and up to N bullets across
// its grouped subsections. The "Unreleased" section is skipped because it
// lacks a release date and would mislead the Home "What's new" card.

const VERSION_HEADING =
  /^##\s+\[?([^\]\s]+)\]?(?:\([^)]*\))?\s*(?:-?\s*\(?(\d{4}-\d{2}-\d{2})\)?)?\s*$/;
const SUBSECTION_HEADING = /^###\s+/;
const BULLET = /^\s*[-*]\s+(.+?)\s*$/;
// Strip Markdown link wrappers (`[text](url)`) and bold (`**text**`) so the
// card shows readable lines without rewriting react-markdown's rendering.
const stripMarkdown = (line) =>
  line
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();

export const parseChangelog = (source, { maxBullets = 5 } = {}) => {
  if (typeof source !== "string" || !source.trim()) {
    return { version: null, releaseDate: null, bullets: [] };
  }
  const lines = source.split(/\r?\n/);
  let inSection = false;
  let version = null;
  let releaseDate = null;
  const bullets = [];

  for (const line of lines) {
    const versionMatch = line.match(VERSION_HEADING);
    if (versionMatch) {
      const [, ver, date] = versionMatch;
      if (inSection) break;
      // Skip placeholder sections that lack a date (e.g. "Unreleased").
      if (!date || /unreleased/i.test(ver)) continue;
      inSection = true;
      version = ver;
      releaseDate = date;
      continue;
    }
    if (!inSection) continue;
    if (SUBSECTION_HEADING.test(line)) continue;
    const bulletMatch = line.match(BULLET);
    if (bulletMatch) {
      const text = stripMarkdown(bulletMatch[1]);
      if (text) bullets.push(text);
      if (bullets.length >= maxBullets) break;
    }
  }

  return { version, releaseDate, bullets };
};

export default parseChangelog;
