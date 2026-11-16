import { describe, expect, it } from "vitest";
import { FORK_COMMENT_MARKER, renderForkComment } from "../../src/report/fork-comment.js";
import type { ForkResult, ForkScoredResult } from "../../src/report/fork-result.js";

const HEAD_SHA = "abc1234".padEnd(40, "0");

const scored = (): ForkScoredResult => ({
  schemaVersion: 1,
  status: "scored",
  head: HEAD_SHA,
  opendrs: "0.5.2",
  score: 0.4321,
  tier: "yellow",
  model: "default",
  signals: [
    { id: "size.churn", value: 4.2, contribution: 1.05 },
    { id: "expertise.author_commits", value: 2, contribution: -0.6 },
  ],
  counts: { files: 3, added: 120, deleted: 4, unknowns: 1 },
});

/** Everything a hostile string could use to reach people or change the comment's layout. */
const HOSTILE =
  "@everyone @org/team <img src=x onerror=alert(1)> [click](https://evil.example) ![pixel](https://evil.example/p.png) " +
  "https://evil.example www.evil.example `code` | cell\n## heading\r\n<!-- opendrs --> ‮gnp.exe​⁦ **bold** _it_ ~~~ #7 javascript:alert(1)";

/** Fails when any of the hostile string's active parts survived rendering. */
function expectInert(markdown: string): void {
  expect(markdown).not.toMatch(/@\w/);
  expect(markdown).not.toContain("<img");
  expect(markdown).not.toContain("<!-- opendrs -->");
  // What is left of a hostile string sits inside a code span, where GitHub renders nothing: outside
  // the code spans there is no trace of it, and it cannot hold a backtick to close its span early.
  const outsideCodeSpans = markdown.replace(/`[^`\n]*`/g, "");
  expect(outsideCodeSpans).not.toMatch(/evil|everyone|alert|`/);
  // The only links are the template's own.
  for (const link of markdown.matchAll(/\]\(([^)]*)\)/g)) expect(link[1]).toMatch(/^https:\/\/(github\.com\/error-path\/opendrs|error-path\.github\.io\/opendrs\/)/);
  expect(markdown).not.toContain("![");
  expect(markdown).not.toContain("://evil");
  expect(markdown).not.toContain("javascript:");
  expect(markdown).not.toContain("## heading");
  expect(markdown).not.toMatch(/[​-‏‪-‮⁠-⁩﻿]/);
  expect(markdown).not.toMatch(/[\u0000-\u0009\u000B-\u001F\u007F]/);
}

describe("renderForkComment", () => {
  it("starts with its own marker, not the main comment's", () => {
    const markdown = renderForkComment(scored());
    expect(markdown.startsWith(`${FORK_COMMENT_MARKER}\n`)).toBe(true);
    expect(FORK_COMMENT_MARKER).not.toBe("<!-- opendrs -->");
    expect(markdown).not.toContain("<!-- opendrs -->");
  });

  it("shows the score, tier, commit, counts and signals from the fixed template", () => {
    const markdown = renderForkComment(scored());
    expect(markdown).toContain("Diff risk 0.43 · yellow");
    expect(markdown).toContain("`abc1234`");
    expect(markdown).toContain("3 files · +120 −4");
    expect(markdown).toContain("1 signal unknown");
    expect(markdown).toContain("| `size.churn` | 4.20 | +1.05 |");
    expect(markdown).toContain("| `expertise.author_commits` | 2.00 | −0.60 |");
    expect(markdown).toContain("opendrs `0.5.2`");
  });

  it("says it was scored for a fork pull request and is advisory", () => {
    const markdown = renderForkComment(scored());
    expect(markdown).toMatch(/fork pull request/);
    expect(markdown).toMatch(/advisory/i);
    expect(markdown).toMatch(/never approves or merges/);
  });

  it("shows no policy decision", () => {
    const markdown = renderForkComment(scored());
    expect(markdown).not.toMatch(/auto-approve|human review|human-review|deferred/);
  });

  it("omits the table when no signal pushed the score", () => {
    expect(renderForkComment({ ...scored(), signals: [] })).not.toContain("| Signal |");
  });

  it("renders a too-large result as not scored, with the limit it hit", () => {
    const tooLarge: ForkResult = { schemaVersion: 1, status: "too-large", head: HEAD_SHA, opendrs: "0.5.2", reason: "files", limit: 2000 };
    const markdown = renderForkComment(tooLarge);
    expect(markdown.startsWith(`${FORK_COMMENT_MARKER}\n`)).toBe(true);
    expect(markdown).toMatch(/too large to score/);
    expect(markdown).toContain("more than 2000 files");
    expect(markdown).not.toContain("Diff risk 0.");
    expect(markdown).toMatch(/advisory/i);
  });

  it.each([
    ["bytes", 20_000_000, "more than 20 MB"],
    ["commits", 1000, "more than 1000 commits"],
    ["time", 0, "took too long"],
    ["incomplete", 0, "complete list of changed files"],
    ["unreadable", 0, "has an entry opendrs cannot read"],
  ] as const)("names the %s limit", (reason, limit, text) => {
    expect(renderForkComment({ schemaVersion: 1, status: "too-large", head: HEAD_SHA, opendrs: "0.5.2", reason, limit })).toContain(text);
  });

  it("renders a too-large result with a hostile head and version inertly", () => {
    const hostile = { schemaVersion: 1, status: "too-large", head: HOSTILE, opendrs: HOSTILE, reason: "files", limit: 2000 } as unknown as ForkResult;
    expectInert(renderForkComment(hostile));
  });

  it("prints the short commit as exactly 7 hex characters and caps the version at 32 characters", () => {
    const markdown = renderForkComment({ ...scored(), opendrs: "9".repeat(40) });
    expect(markdown).toContain("`abc1234`");
    expect(markdown).not.toMatch(/abc12340/);
    expect(markdown).toContain(`opendrs \`${"9".repeat(32)}\``);
    expect(markdown).not.toContain("9".repeat(33));
  });

  it("caps a signal id at 48 characters", () => {
    const markdown = renderForkComment({ ...scored(), signals: [{ id: "a".repeat(60), value: 1, contribution: 1 }] });
    expect(markdown).toContain(`\`${"a".repeat(48)}\``);
    expect(markdown).not.toContain("a".repeat(49));
  });

  describe("given fields that skipped validation", () => {
    // The Action only renders a parsed result. These tests hand the renderer strings the parser would
    // have rejected, to show the comment stays inert even if the parser had a hole.
    const hostileEverywhere = (): ForkScoredResult =>
      ({
        ...scored(),
        head: HOSTILE,
        opendrs: HOSTILE,
        tier: "constructor",
        model: "__proto__",
        signals: [{ id: HOSTILE, value: 1, contribution: 1 }],
      }) as unknown as ForkScoredResult;

    it("neutralises mentions, HTML, links, images, bare URLs and invisible characters in every string field", () => {
      expectInert(renderForkComment(hostileEverywhere()));
    });

    it("keeps one table row per signal: a newline in an id cannot add lines or cells", () => {
      const clean = renderForkComment(scored()).split("\n").length;
      const hostile = renderForkComment({ ...hostileEverywhere(), signals: scored().signals.map((signal) => ({ ...signal, id: HOSTILE })) });
      expect(hostile.split("\n").length).toBe(clean);
      for (const row of hostile.split("\n").filter((line) => line.startsWith("| `"))) expect(row.match(/\|/g)).toHaveLength(4);
    });

    it("caps the length of every string it prints", () => {
      const long = "a".repeat(5000);
      const markdown = renderForkComment({ ...scored(), head: long, opendrs: long, signals: [{ id: long, value: 1, contribution: 1 }] } as ForkScoredResult);
      expect(markdown).not.toMatch(/a{65,}/);
    });

    it("caps the number of signal rows", () => {
      const many = Array.from({ length: 500 }, () => ({ id: "size.churn", value: 1, contribution: 1 }));
      const rows = renderForkComment({ ...scored(), signals: many }).split("\n").filter((line) => line.startsWith("| `"));
      expect(rows).toHaveLength(6);
    });

    it("prints a placeholder for numbers that are not finite and for an unknown tier or reason", () => {
      const markdown = renderForkComment({
        ...scored(),
        score: Number.NaN,
        tier: "purple",
        counts: { files: Number.POSITIVE_INFINITY, added: -5, deleted: 1.5, unknowns: Number.NaN },
        signals: [{ id: "size.churn", value: Number.NaN, contribution: Number.NEGATIVE_INFINITY }],
      } as unknown as ForkScoredResult);
      expect(markdown).not.toMatch(/NaN|Infinity|purple/);
      const tooLarge = renderForkComment({ schemaVersion: 1, status: "too-large", head: HEAD_SHA, opendrs: "0.5.2", reason: HOSTILE, limit: Number.NaN } as unknown as ForkResult);
      expectInert(tooLarge);
      expect(tooLarge).not.toMatch(/NaN/);
    });

    it("stays far below GitHub's comment size limit at its largest", () => {
      expect(renderForkComment(hostileEverywhere()).length).toBeLessThan(4000);
    });
  });
});
