import { describe, it, expect } from "vitest";

import { parseChangelog } from "../utils/changelog";

describe("parseChangelog", () => {
  it("returns empty result for empty source", () => {
    expect(parseChangelog("")).toEqual({ version: null, releaseDate: null, bullets: [] });
    expect(parseChangelog(null)).toEqual({ version: null, releaseDate: null, bullets: [] });
  });

  it("skips the Unreleased section and returns the first dated release", () => {
    const source = [
      "# Changelog",
      "",
      "## Unreleased",
      "",
      "### Added",
      "- Skipped item",
      "",
      "## [1.2.0](https://example.com) (2026-04-30)",
      "",
      "### Features",
      "- New feature alpha",
      "- Another feature [link](https://x)",
      "",
      "### Bug Fixes",
      "- Fixed beta",
    ].join("\n");
    const result = parseChangelog(source);
    expect(result.version).toBe("1.2.0");
    expect(result.releaseDate).toBe("2026-04-30");
    expect(result.bullets).toEqual(["New feature alpha", "Another feature link", "Fixed beta"]);
  });

  it("limits bullets to maxBullets", () => {
    const lines = ["## [1.0.0] (2026-01-01)", "### Features"];
    for (let i = 0; i < 10; i += 1) lines.push(`- bullet ${i}`);
    const result = parseChangelog(lines.join("\n"), { maxBullets: 3 });
    expect(result.bullets).toHaveLength(3);
    expect(result.bullets[0]).toBe("bullet 0");
  });

  it("strips bold and inline code", () => {
    const source = ["## [0.9.0] (2026-02-02)", "### Notes", "- **Important** `code` change"].join(
      "\n"
    );
    const result = parseChangelog(source);
    expect(result.bullets[0]).toBe("Important code change");
  });
});
