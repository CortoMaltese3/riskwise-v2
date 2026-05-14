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

  it("strips trailing commit hashes, PR refs, and closes-tags", () => {
    const source = [
      "## [1.1.0](https://example.com) (2026-05-04)",
      "",
      "### Features",
      "* Add CHANGELOG.md ([03ac2cd](https://example.com/03ac2cd))",
      "* Add new Application release workflow ([#21](https://example.com/21)) ([6085a20](https://example.com/6085a20))",
      "* shareable export ([#144](https://example.com/144)) ([cca8b90](https://example.com/cca8b90)), closes [#122](https://example.com/122)",
    ].join("\n");
    const result = parseChangelog(source);
    expect(result.bullets).toEqual([
      "Add CHANGELOG.md",
      "Add new Application release workflow",
      "shareable export",
    ]);
  });

  it("returns ONLY the Highlights bullets when that subsection is present", () => {
    const source = [
      "## [1.1.0](https://example.com) (2026-05-04)",
      "",
      "### Highlights",
      "",
      "- Shareable scenario exports",
      "- New auto-update workflow",
      "",
      "### Features",
      "",
      "* Some auto-generated feature ([abc1234](https://example.com))",
    ].join("\n");
    const result = parseChangelog(source);
    expect(result.version).toBe("1.1.0");
    expect(result.bullets).toEqual(["Shareable scenario exports", "New auto-update workflow"]);
  });

  it("falls back to default aggregation when no Highlights subsection is present", () => {
    const source = [
      "## [1.1.0] (2026-05-04)",
      "",
      "### Features",
      "- Feature one",
      "",
      "### Bug Fixes",
      "- Fixed something",
    ].join("\n");
    const result = parseChangelog(source);
    expect(result.bullets).toEqual(["Feature one", "Fixed something"]);
  });

  it("stops at the next release heading even when collecting Highlights", () => {
    const source = [
      "## [1.1.0] (2026-05-04)",
      "",
      "### Highlights",
      "- new release",
      "",
      "## [1.0.0] (2025-01-01)",
      "",
      "### Highlights",
      "- old release",
    ].join("\n");
    const result = parseChangelog(source);
    expect(result.version).toBe("1.1.0");
    expect(result.bullets).toEqual(["new release"]);
  });
});
