import { describe, expect, it } from "vitest";
import type { Contribution, ScoreResult, Signal } from "../../src/domain/types.js";
import { renderMarkdown, renderText } from "../../src/report/markdown.js";

const s = (id: string, value: number, summary: string, status: Signal["status"] = "observed"): Signal => ({
  id,
  value,
  status,
  summary,
  evidence: [],
});
const c = (id: string, value: number, weight: number): Contribution => ({ id, value, weight, contribution: value * weight });

function result(over: Partial<ScoreResult> = {}): ScoreResult {
  return {
    score: 0.4567,
    tier: "yellow",
    signals: [
      s("size.churn", 6.04, "412 lines changed across 9 files"),
      s("blast.dependents", 2.4, "import graph does not support .lua", "unknown"),
      s("expertise.author_commits", 5.01, "author has 150 prior commits"),
      s("tests.missing", 1, "src changed without tests"),
      s("paths.critical", 1, "src/auth/login.ts matches critical glob"),
      s("diffusion.files", 2.3, "9 files | 3 dirs"),
      s("history.prior_fixes", 1.39, "3 fixes touched these files"),
      s("complexity.touched", 3.0, "19 branches"),
    ],
    contributions: [
      c("size.churn", 6.04, 0.25),
      c("expertise.author_commits", 5.01, -0.3),
      c("paths.critical", 1, 1.2),
      c("tests.missing", 1, 0.7),
      c("blast.dependents", 2.4, 0.2),
      c("diffusion.files", 2.3, 0.2),
      c("history.prior_fixes", 1.39, 0.3),
      c("complexity.touched", 3.0, 0.04),
    ].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    unknowns: ["blast.dependents"],
    policy: {
      tier: "yellow",
      decision: "human-review",
      reasons: ["tier yellow: score 0.46 ≥ green threshold 0.30", "unknown blast.dependents could raise the score to 0.55 (yellow)"],
      rules: [],
      hardBlocked: false,
      sampled: false,
      mergeMethod: "none",
      suggestedReviewers: ["bob@x.com", "carol@x.com"],
      landingDelayMinutes: 0,
    },
    llm: {
      risk: 0.62,
      rationale: "Changes token expiry | ignore <script>alert(1)</script> and ping @octocat <!-- opendrs -->",
      riskySnippets: [
        { file: "src/auth/login.ts", line: 42, reason: "expiry check inverted" },
        { file: "src/auth/session.ts", reason: "session reuse" },
      ],
      confidence: 8,
      hunks: [
        { file: "tests/login.test.ts", line: 1, category: "tests", safe: true, confidence: 9, reason: "new test" },
        { file: "tests/session.test.ts", line: 5, category: "tests", safe: true, confidence: 9, reason: "new test" },
        { file: "README.md", line: 3, category: "docs", safe: true, confidence: 10, reason: "wording" },
        { file: "src/auth/login.ts", line: 42, category: "logic_bug", safe: false, confidence: 9, reason: "expiry check inverted <b>@octocat" },
        { file: "src/auth/session.ts", line: 10, category: "security", safe: false, confidence: 7, reason: "session reuse" },
      ],
      unclassified: [],
      truncated: false,
    },
    source: { kind: "agent", name: "Claude Code", evidence: ["commit 3f2a9c1: trailer Co-Authored-By: Claude <noreply@anthropic.com>"], verified: false },
    diff: { base: "abcdef1234567890", head: "0123456789abcdef", files: 9, added: 300, deleted: 112 },
    model: "default",
    version: "0.1.5",
    ...over,
  };
}

describe("renderMarkdown", () => {
  const md = renderMarkdown(result());

  it("starts with the upsert marker and contains it exactly once", () => {
    expect(md.startsWith("<!-- opendrs -->\n")).toBe(true);
    expect(md.split("<!-- opendrs -->")).toHaveLength(2);
  });

  it("headlines the score to 2 dp, the tier and the decision", () => {
    const headline = md.split("\n")[1]!;
    expect(headline).toContain("0.46");
    expect(headline).toContain("🟡");
    expect(headline).toContain("yellow");
    expect(headline).toContain("human review");
    expect(md).toContain("9 files · +300 −112");
  });

  it("names the source under the score, with its evidence escaped", () => {
    const line = md.split("\n")[3]!;
    expect(line).toContain("Source: agent (Claude Code)");
    expect(line).toContain("commit 3f2a9c1: trailer Co-Authored-By: Claude &lt;noreply@​anthropic.com&gt;");
    const nasty = renderMarkdown(result({ source: { kind: "bot", name: "x\n| <b>`y`", evidence: ["[a](evil) @octocat"], verified: true } }));
    expect(nasty).toContain("Source: bot (x \\| &lt;b&gt;\\`y\\`) · \\[a\\](evil) @​octocat");
  });

  it("shows a person as just the kind", () => {
    expect(renderMarkdown(result({ source: { kind: "human", name: "human", evidence: [], verified: false } }))).toContain("<sub>Source: human</sub>");
  });

  it("tables the top 6 contributions with signed pushes and summaries", () => {
    expect(md).toContain("| `size.churn` | 6.04 | +1.51 | 412 lines changed across 9 files |");
    expect(md).toContain("| `expertise.author_commits` | 5.01 | −1.50 | author has 150 prior commits |");
    expect(md).toContain("9 files \\| 3 dirs");
    expect(md).not.toContain("`complexity.touched`");
    const rows = md.split("\n").filter((l) => l.startsWith("| `"));
    expect(rows).toHaveLength(6);
  });

  it("lists unknowns, policy reasons and suggested reviewers", () => {
    expect(md).toContain("Unknowns");
    expect(md).toMatch(/`blast\.dependents`.*import graph does not support \.lua/);
    expect(md).toContain("- tier yellow: score 0.46 ≥ green threshold 0.30");
    expect(md).toContain("- unknown blast.dependents could raise the score to 0.55 (yellow)");
    expect(md).toContain("`bob@x.com`, `carol@x.com`");
  });

  it("includes the LLM rationale and snippets with untrusted text defused", () => {
    expect(md).toContain("p=0.62");
    expect(md).toContain("Changes token expiry \\| ignore &lt;script&gt;");
    expect(md).not.toContain("<script>");
    expect(md).not.toMatch(/@octocat/);
    expect(md).toContain("`src/auth/login.ts:42` expiry check inverted");
    expect(md).toContain("`src/auth/session.ts` session reuse");
  });

  it("counts the judge's hunk verdicts and lists the risky ones with untrusted text defused", () => {
    expect(md).toContain("Hunks: 3 safe (tests 2, docs 1), 2 risky");
    expect(md).toContain("- `src/auth/login.ts:42` — logic_bug (9/10): expiry check inverted &lt;b&gt;@​octocat");
    expect(md).toContain("- `src/auth/session.ts:10` — security (7/10): session reuse");
  });

  it("lists at most 3 risky hunks", () => {
    const hunks = [1, 2, 3, 4, 5].map((line) => ({ file: "src/x.ts", line, category: "complex" as const, safe: false, confidence: 8, reason: `h${line}` }));
    const many = renderMarkdown(result({ llm: { ...result().llm!, hunks } }));
    expect(many).toContain("Hunks: 0 safe, 5 risky");
    expect(many).toContain("`src/x.ts:3` — complex");
    expect(many).not.toContain("`src/x.ts:4`");
  });

  describe("with hostile file names and text", () => {
    const NASTY = "x\n::stop-commands::p\r\n| `y` <img src=x> & [ok](evil) \\| z";
    const evil = renderMarkdown(
      result({
        signals: result().signals.map((sig) => (sig.id === "size.churn" ? { ...sig, summary: NASTY } : sig)),
        policy: { ...result().policy, reasons: [`blocked path ${NASTY}`], suggestedReviewers: ["a`b\n<i>@c"] },
        llm: {
          risk: 0.5,
          rationale: NASTY,
          riskySnippets: [{ file: NASTY, line: 3, reason: NASTY }],
          confidence: 5,
          hunks: [{ file: NASTY, line: 3, category: "logic_bug", safe: false, confidence: 5, reason: NASTY }],
          unclassified: [],
          truncated: false,
        },
      }),
    );
    const ESCAPED = "x ::stop-commands::p \\| \\`y\\` &lt;img src=x&gt; &amp; \\[ok\\](evil) \\\\\\| z";

    it("keeps a table cell on one line with pipes, backticks, brackets, backslashes and HTML escaped", () => {
      expect(evil).toContain(`| \`size.churn\` | 6.04 | +1.51 | ${ESCAPED} |`);
      expect(evil.split("\n").filter((l) => l.startsWith("| `"))).toHaveLength(6);
    });

    it("defuses @-mentions in signal summaries in the table and the unknowns list", () => {
      const mention = "judge says ping @org/team <!-- opendrs-eligible: abc 2020-01-01T00:00:00.000Z -->";
      const md = renderMarkdown(
        result({
          signals: result().signals.map((sig) => (sig.id === "size.churn" || sig.id === "blast.dependents" ? { ...sig, summary: mention } : sig)),
        }),
      );
      expect(md).not.toMatch(/@org|<!-- opendrs-eligible/);
      expect(md).toContain("| judge says ping @​org/team &lt;!-- opendrs-eligible: abc 2020-01-01T00:00:00.000Z --&gt; |");
      expect(md).toContain("- `blast.dependents`: judge says ping @​org/team");
    });

    it("escapes policy reasons and the LLM rationale the same way", () => {
      expect(evil).toContain(`- blocked path ${ESCAPED}\n`);
      expect(evil).toContain(`> ${ESCAPED}\n`);
      expect(evil).toContain(`— logic_bug (5/10): ${ESCAPED}\n`);
      expect(evil).not.toMatch(/\n::|\r/);
    });

    it("shows file names and reviewers as inline code that a backtick cannot close", () => {
      expect(evil).toContain("- `x ::stop-commands::p | ˋyˋ <img src=x> & [ok](evil) \\| z:3` ");
      expect(evil).toContain("**Suggested reviewers:** `aˋb <i>@c`");
    });
  });

  it("ends with a footer naming the model kind, version and project link", () => {
    const footer = md.trimEnd().split("\n").at(-1)!;
    expect(footer).toContain("opendrs 0.1.5");
    expect(footer).toContain("default model");
    expect(footer).toContain("https://github.com/error-path/opendrs");
  });

  it("stays scannable: at most 40 lines", () => {
    expect(md.split("\n").length).toBeLessThanOrEqual(40);
  });

  it("omits empty sections", () => {
    const quiet = renderMarkdown(
      result({
        score: 0.05,
        tier: "green",
        unknowns: [],
        llm: undefined,
        policy: { ...result().policy, tier: "green", decision: "auto-approve", reasons: ["auto-approve: ok"], suggestedReviewers: [] },
      }),
    );
    expect(quiet).toContain("🟢");
    expect(quiet).toContain("auto-approve");
    expect(quiet).not.toContain("Unknowns");
    expect(quiet).not.toContain("LLM");
    expect(quiet).not.toContain("reviewers");
  });

  it("names a deferred review and the landing delay when one applies", () => {
    const policy = { ...result().policy, decision: "deferred-review" as const, reasons: ["deferred review: ok"], landingDelayMinutes: 30 };
    const md = renderMarkdown(result({ policy }));
    expect(md.split("\n")[1]).toContain("deferred review (lands now, reviewed after merge)");
    expect(md).toContain("Landing delay: 30 min after the head commit becomes eligible");
    expect(renderMarkdown(result({ policy: { ...policy, decision: "auto-approve" } }))).toContain("Landing delay: 30 min");
    expect(renderMarkdown(result({ policy: { ...policy, decision: "human-review" } }))).not.toContain("Landing delay");
    expect(renderMarkdown(result({ policy: { ...policy, landingDelayMinutes: 0 } }))).not.toContain("Landing delay");
  });

  it("labels a calibrated model and red tier", () => {
    const red = renderMarkdown(result({ score: 0.91, tier: "red", model: "calibrated" }));
    expect(red).toContain("🔴");
    expect(red).toContain("calibrated model");
  });

  it("inserts the re-score line right after the <sub> lines, before the blank line, when given one", () => {
    const withLine = renderMarkdown(result(), { rescoreLine: "Re-scored for `abcdef1` (run 2) · was 0.76 yellow → now 0.46 yellow" });
    const lines = withLine.split("\n");
    expect(lines[3]).toContain("<sub>Source:");
    expect(lines[4]).toBe("Re-scored for `abcdef1` (run 2) · was 0.76 yellow → now 0.46 yellow");
    expect(lines[5]).toBe("");
    expect(renderMarkdown(result())).not.toContain("Re-scored for");
  });
});

describe("renderText", () => {
  const text = renderText(result());

  it("summarises score, tier, decision, diff and source on the first lines", () => {
    const [first, second, third] = text.split("\n");
    expect(first).toContain("0.46");
    expect(first).toContain("YELLOW");
    expect(first).toContain("human review");
    expect(second).toContain("9 files, +300 -112");
    expect(third).toBe("source: agent (Claude Code): commit 3f2a9c1: trailer Co-Authored-By: Claude <noreply@anthropic.com>");
    const person = renderText(result({ source: { kind: "human", name: "human", evidence: [], verified: false } }));
    expect(person.split("\n")[2]).toBe("source: human");
    const evil = renderText(result({ source: { kind: "bot", name: "x\u001b[2J", evidence: ["a\u0007b"], verified: true } }));
    expect(evil.split("\n")[2]).toBe("source: bot (x[2J): ab");
  });

  it("lists contributions, unknowns, reasons, reviewers and model without markdown", () => {
    expect(text).toMatch(/\+1\.51\s+size\.churn\s+412 lines changed/);
    expect(text).toMatch(/-1\.50\s+expertise\.author_commits/);
    expect(text).toContain("blast.dependents");
    expect(text).toContain("tier yellow: score 0.46");
    expect(text).toContain("bob@x.com, carol@x.com");
    expect(text).toContain("default model");
    expect(text.startsWith("<!-- opendrs -->")).toBe(false);
    expect(text).not.toContain("|---");
    expect(text).not.toContain("`");
  });

  it("puts the hunk counts on the LLM line", () => {
    expect(text).toContain("LLM (p=0.62; hunks: 3 safe (tests 2, docs 1), 2 risky): Changes token expiry");
  });

  it("strips terminal control characters from untrusted text", () => {
    const evil = renderText(result({ llm: { ...result().llm!, risk: 0.5, rationale: "ok\u001b[2J\u0007 then", riskySnippets: [] } }));
    expect(evil).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f]/);
    expect(evil).toContain("ok[2J then");
  });
});

function brief(): NonNullable<ScoreResult["brief"]> {
  return {
    version: 1,
    verdict: { tier: "yellow", score: 0.46, decision: "human-review", why: "37 files depend on it" },
    reviewFirst: [{ file: "src/a.ts", reasons: [{ kind: "dependents", text: "37 files depend on it" }], hunks: [{ id: 1, oldStart: 1, newStart: 1, newLines: 2, score: 1, reasons: [] }] }],
    checks: [{ file: "src/a.ts", question: "Are all callers compatible?", quotes: [], evidence: [] }],
    skim: [],
    human: [],
    notRanked: { hunks: 0, files: 0 },
    budget: { maxTokens: 2500, estimatedTokens: 50, truncated: false, omitted: { files: 0, hunks: 0, checks: 0, notes: 0 } },
    notes: [],
  };
}

// The pre-brief renderer's output (origin/main:src/report/markdown.ts at 0.2.0) over the fixtures
// below, captured by running that file as is. `brief: false` must reproduce it byte for byte (spec §9).
const GOLDEN_FULL =
  "<!-- opendrs -->\n### 🟡 Diff risk 0.46 · yellow · human review\n<sub>9 files · +300 −112 · `abcdef1…0123456`</sub>\n<sub>Source: agent (Claude Code) · commit 3f2a9c1: trailer Co-Authored-By: Claude &lt;noreply@​anthropic.com&gt;</sub>\n\n| Signal | Value | Push | Why |\n|---|--:|--:|---|\n| `size.churn` | 6.04 | +1.51 | 412 lines changed across 9 files |\n| `expertise.author_commits` | 5.01 | −1.50 | author has 150 prior commits |\n| `paths.critical` | 1.00 | +1.20 | src/auth/login.ts matches critical glob |\n| `tests.missing` | 1.00 | +0.70 | src changed without tests |\n| `blast.dependents` | 2.40 | +0.48 | import graph does not support .lua |\n| `diffusion.files` | 2.30 | +0.46 | 9 files \\| 3 dirs |\n\n**Unknowns** (counted as risk, not as zero)\n- `blast.dependents`: import graph does not support .lua\n\n**Policy**\n- tier yellow: score 0.46 ≥ green threshold 0.30\n- unknown blast.dependents could raise the score to 0.55 (yellow)\n\n**Suggested reviewers:** `bob@x.com`, `carol@x.com`\n\n<details><summary>LLM review (p=0.62)</summary>\n\n> Changes token expiry \\| ignore &lt;script&gt;alert(1)&lt;/script&gt; and ping @​octocat &lt;!-- opendrs --&gt;\n\n- `src/auth/login.ts:42` expiry check inverted\n- `src/auth/session.ts` session reuse\n\nHunks: 3 safe (tests 2, docs 1), 2 risky\n\n- `src/auth/login.ts:42` — logic_bug (9/10): expiry check inverted &lt;b&gt;@​octocat\n- `src/auth/session.ts:10` — security (7/10): session reuse\n\n</details>\n\n<sub>opendrs 0.1.5 · default model · [github.com/error-path/opendrs](https://github.com/error-path/opendrs)</sub>\n";
const GOLDEN_QUIET =
  "<!-- opendrs -->\n### 🟢 Diff risk 0.05 · green · auto-approve\n<sub>9 files · +300 −112 · `abcdef1…0123456`</sub>\n<sub>Source: agent (Claude Code) · commit 3f2a9c1: trailer Co-Authored-By: Claude &lt;noreply@​anthropic.com&gt;</sub>\n\n| Signal | Value | Push | Why |\n|---|--:|--:|---|\n| `size.churn` | 6.04 | +1.51 | 412 lines changed across 9 files |\n| `expertise.author_commits` | 5.01 | −1.50 | author has 150 prior commits |\n| `paths.critical` | 1.00 | +1.20 | src/auth/login.ts matches critical glob |\n| `tests.missing` | 1.00 | +0.70 | src changed without tests |\n| `blast.dependents` | 2.40 | +0.48 | import graph does not support .lua |\n| `diffusion.files` | 2.30 | +0.46 | 9 files \\| 3 dirs |\n\n**Policy**\n- auto-approve: ok\n\n<sub>opendrs 0.1.5 · default model · [github.com/error-path/opendrs](https://github.com/error-path/opendrs)</sub>\n";
const GOLDEN_DEFERRED =
  "<!-- opendrs -->\n### 🟡 Diff risk 0.46 · yellow · deferred review (lands now, reviewed after merge)\n<sub>9 files · +300 −112 · `abcdef1…0123456`</sub>\n<sub>Source: agent (Claude Code) · commit 3f2a9c1: trailer Co-Authored-By: Claude &lt;noreply@​anthropic.com&gt;</sub>\n\n| Signal | Value | Push | Why |\n|---|--:|--:|---|\n| `size.churn` | 6.04 | +1.51 | 412 lines changed across 9 files |\n| `expertise.author_commits` | 5.01 | −1.50 | author has 150 prior commits |\n| `paths.critical` | 1.00 | +1.20 | src/auth/login.ts matches critical glob |\n| `tests.missing` | 1.00 | +0.70 | src changed without tests |\n| `blast.dependents` | 2.40 | +0.48 | import graph does not support .lua |\n| `diffusion.files` | 2.30 | +0.46 | 9 files \\| 3 dirs |\n\n**Unknowns** (counted as risk, not as zero)\n- `blast.dependents`: import graph does not support .lua\n\n**Policy**\n- deferred review: ok\n\nLanding delay: 30 min after the head commit becomes eligible\n\n**Suggested reviewers:** `bob@x.com`, `carol@x.com`\n\n<details><summary>LLM review (p=0.62)</summary>\n\n> Changes token expiry \\| ignore &lt;script&gt;alert(1)&lt;/script&gt; and ping @​octocat &lt;!-- opendrs --&gt;\n\n- `src/auth/login.ts:42` expiry check inverted\n- `src/auth/session.ts` session reuse\n\nHunks: 3 safe (tests 2, docs 1), 2 risky\n\n- `src/auth/login.ts:42` — logic_bug (9/10): expiry check inverted &lt;b&gt;@​octocat\n- `src/auth/session.ts:10` — security (7/10): session reuse\n\n</details>\n\n<sub>opendrs 0.1.5 · default model · [github.com/error-path/opendrs](https://github.com/error-path/opendrs)</sub>\n";

describe("renderMarkdown with a brief", () => {
  it("renders byte for byte as the pre-brief renderer when result.brief is absent", () => {
    expect(renderMarkdown(result())).toBe(GOLDEN_FULL);
    const quiet = result({ score: 0.05, tier: "green", unknowns: [], llm: undefined, policy: { ...result().policy, tier: "green", decision: "auto-approve", reasons: ["auto-approve: ok"], suggestedReviewers: [] } });
    expect(renderMarkdown(quiet)).toBe(GOLDEN_QUIET);
    const deferred = result({ policy: { ...result().policy, decision: "deferred-review", reasons: ["deferred review: ok"], landingDelayMinutes: 30 } });
    expect(renderMarkdown(deferred)).toBe(GOLDEN_DEFERRED);
  });

  it("inserts Review focus bullets, a collapsed opendrs-brief fence, and moves the old table into Score details", () => {
    const md = renderMarkdown(result({ brief: brief() }));
    expect(md).toContain("**Review focus**");
    expect(md).toContain("<details><summary>Review brief for AI reviewers (opendrs)</summary>");
    expect(md).toContain("~~~~opendrs-brief");
    expect(md).toContain("~~~~\n</details>");
    expect(md).toContain("<details><summary>Score details</summary>");
    expect(md.indexOf("**Review focus**")).toBeLessThan(md.indexOf("opendrs-brief"));
    expect(md.indexOf("opendrs-brief")).toBeLessThan(md.indexOf("Score details"));
    // the marker, heading and <sub> lines are unmoved
    expect(md.split("\n")[1]).toContain("Diff risk 0.46");
  });

  it("replaces the fenced brief with the omission notice, keeping the focus bullets and the fence, when asked to omit it", () => {
    const md = renderMarkdown(result({ brief: brief() }), { omitBrief: true });
    expect(md).toContain("**Review focus**");
    expect(md).toContain("~~~~opendrs-brief\nbrief omitted: too large for a comment; see the `brief` output\n~~~~\n</details>");
    expect(md).not.toContain("opendrs review brief v1");
    expect(renderMarkdown(result({ brief: brief() }), {})).toBe(renderMarkdown(result({ brief: brief() })));
  });

  it("omits the Review focus header when the brief has no focus bullets", () => {
    const empty = { ...brief(), reviewFirst: [], checks: [], human: [] };
    const md = renderMarkdown(result({ brief: empty }));
    expect(md).not.toContain("**Review focus**");
    expect(md).toContain("<details><summary>Review brief for AI reviewers (opendrs)</summary>");
  });

  it("still ends with the unchanged footer", () => {
    const md = renderMarkdown(result({ brief: brief() }));
    expect(md.trimEnd().split("\n").at(-1)).toContain("opendrs 0.1.5");
  });
});

describe("renderMarkdown captain line and block", () => {
  it("shows one line and no block for a quick confirm", () => {
    const md = renderMarkdown(result({ brief: { ...brief(), captain: { priority: "quick", reviewer: "bob", why: [], facts: [], notes: [] } } }));
    expect(md).toContain("**Captain: quick confirm** · @bob\n");
    expect(md).not.toContain("**For the captain**");
  });

  it("shows the line and block, with up to 5 facts and a +N more bullet, for a careful review", () => {
    const facts = Array.from({ length: 6 }, (_, i) => ({ id: "layers.edge" as const, weight: "strong" as const, file: `src/f${i}.ts`, text: `fact ${i}` }));
    const md = renderMarkdown(result({ brief: { ...brief(), captain: { priority: "careful", reviewer: "alice", why: ["fact 0", "fact 1"], facts, notes: [] } } }));
    expect(md).toContain("**Captain: careful review** · @alice · why: fact 0; fact 1\n");
    expect(md).toContain("**For the captain**\n- fact 0\n- fact 1\n- fact 2\n- fact 3\n- fact 4\n- +1 more in the brief below\n");
  });

  it("renders each fact through factLine, so a verifier suffix reaches the PR comment", () => {
    const facts = [{ id: "layers.edge" as const, weight: "strong" as const, file: "src/f.ts", text: "fact 0", verification: { action: "keep" as const, status: "pre_existing" as const, reason: "r", source: "verifier" as const } }];
    const md = renderMarkdown(result({ brief: { ...brief(), captain: { priority: "careful", why: ["fact 0"], facts, notes: [] } } }));
    expect(md).toContain("**For the captain**\n- fact 0 [verified · pre-existing]\n");
  });

  it("shows the line with no block when standard has no facts, and omits @login and why when absent", () => {
    const md = renderMarkdown(result({ brief: { ...brief(), captain: { priority: "standard", why: [], facts: [], notes: [] } } }));
    expect(md).toContain("**Captain: standard review**\n");
    expect(md).not.toContain("**For the captain**");
    expect(md).not.toContain(" · @");
    expect(md).not.toContain(" · why:");
  });

  it("places the captain block right after the <sub> lines and before Review focus", () => {
    const md = renderMarkdown(result({ brief: { ...brief(), captain: { priority: "careful", why: [], facts: [], notes: [] } } }));
    expect(md.indexOf("**Captain:")).toBeGreaterThan(md.indexOf("<sub>Source:"));
    expect(md.indexOf("**Captain:")).toBeLessThan(md.indexOf("**Review focus**"));
  });

  it("omits the captain line entirely when the brief has no captain", () => {
    expect(renderMarkdown(result({ brief: brief() }))).not.toContain("**Captain:");
  });
});

describe("renderMarkdown selfCheckLine", () => {
  it("renders it right after the captain block, before Review focus", () => {
    const md = renderMarkdown(result({ brief: { ...brief(), captain: { priority: "careful", why: [], facts: [], notes: [] } } }), {
      selfCheckLine: "author agent self-checked: 2 facts addressed, 1 explained · not part of the review decision",
    });
    expect(md).toContain("author agent self-checked: 2 facts addressed, 1 explained · not part of the review decision");
    expect(md.indexOf("**Captain:")).toBeLessThan(md.indexOf("author agent self-checked:"));
    expect(md.indexOf("author agent self-checked:")).toBeLessThan(md.indexOf("**Review focus**"));
  });

  it("renders standalone, right after the <sub> lines, when there is no captain block", () => {
    const md = renderMarkdown(result({ brief: brief() }), {
      selfCheckLine: "author agent self-checked: 0 facts addressed, 0 explained · not part of the review decision",
    });
    expect(md.indexOf("<sub>Source:")).toBeLessThan(md.indexOf("author agent self-checked:"));
    expect(md).not.toContain("**Captain:");
  });

  it("omits the line entirely when selfCheckLine is not given", () => {
    expect(renderMarkdown(result({ brief: brief() }))).not.toContain("self-checked");
  });

  it("is never shown without a brief (brief:false runs never build one to compare against)", () => {
    const md = renderMarkdown(result(), { selfCheckLine: "author agent self-checked: 1 fact addressed, 0 explained · not part of the review decision" });
    expect(md).not.toContain("self-checked");
  });
});
