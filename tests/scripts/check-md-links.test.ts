import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAll, findLinks, headingSlugs, slugify } from "../../scripts/check-md-links.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function withFiles(files: Record<string, string>, run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "check-md-links-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("slugify", () => {
  it("matches GitHub's heading-to-anchor rules", () => {
    expect(slugify("Calibration and backtesting")).toBe("calibration-and-backtesting");
    expect(slugify("4. The facts")).toBe("4-the-facts");
    expect(slugify("`coupling.missing`")).toBe("couplingmissing");
  });
});

describe("findLinks", () => {
  it("ignores links inside fenced code blocks", () => {
    const md = "[real](a.md)\n```md\n[fake](b.md)\n```\n[also real](c.md)";
    expect(findLinks(md).map((link) => link.url)).toEqual(["a.md", "c.md"]);
  });

  it("ignores a bracket/paren pair inside an inline code span", () => {
    const md = "Add `/\\bos\\.LookupEnv\\((['\"])([A-Za-z_]\\w*)\\1\\)/` to `ENV_PATTERNS`.";
    expect(findLinks(md)).toEqual([]);
  });
});

describe("headingSlugs", () => {
  it("de-duplicates repeated headings with a numeric suffix", () => {
    const slugs = headingSlugs("# Notes\n## Notes\n## Notes");
    expect(slugs).toEqual(new Set(["notes", "notes-1", "notes-2"]));
  });
});

describe("checkAll", () => {
  it("reports a relative link to a file that does not exist", () => {
    withFiles({ "docs/a.md": "[gone](missing.md)" }, (dir) => {
      const problems = checkAll(dir);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/missing\.md$/);
    });
  });

  it("reports the exact bug class this check exists for: a .html link where only the .md exists", () => {
    withFiles(
      { "docs/a.md": "[Calibration](calibration.html)", "docs/calibration.md": "# Calibration" },
      (dir) => {
        const problems = checkAll(dir);
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain("calibration.html");
      },
    );
  });

  it("reports a fragment that matches no heading in the target file", () => {
    withFiles(
      { "docs/a.md": "[x](b.md#no-such-heading)", "docs/b.md": "# Real heading" },
      (dir) => {
        const problems = checkAll(dir);
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain("no-such-heading");
      },
    );
  });

  it("accepts a same-file fragment that matches an existing heading", () => {
    withFiles({ "docs/a.md": "# Top\n\n[x](#top)" }, (dir) => {
      expect(checkAll(dir)).toEqual([]);
    });
  });

  it("skips external URLs and templated Liquid expressions", () => {
    withFiles(
      {
        "docs/a.md": "[ext](https://example.com/x.html)\n[loop]({{ note.url | relative_url }})",
      },
      (dir) => {
        expect(checkAll(dir)).toEqual([]);
      },
    );
  });

  it("passes on the repo's own README, CHANGELOG, docs and skills", () => {
    expect(checkAll(REPO_ROOT)).toEqual([]);
  });
});
