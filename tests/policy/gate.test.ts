import { describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../src/domain/config.js";
import type { Authorship, ChangedFile, CommitInfo, Decision, LlmHunkVerdict, LlmJudgement, ModelWeights, Signal, SourceKind } from "../../src/domain/types.js";
import { DEFAULT_WEIGHTS } from "../../src/model/defaults.js";
import { decide, isEmptyDiff, sampleValue, type GateInput } from "../../src/policy/gate.js";
import { NOW, fakeCommit, fakeHistory } from "./fakes.js";

const logit = (p: number) => Math.log(p / (1 - p));

const file = (path: string, added = 10, deleted = 5, ignored = false): ChangedFile => ({
  path,
  status: "modified",
  added,
  deleted,
  binary: false,
  hunks: [],
  ignored,
});

const hunk = (lines: string[]) => ({ oldStart: 1, oldLines: 0, newStart: 1, newLines: lines.length, lines });
const fileWithHunks = (path: string, hunks: ReturnType<typeof hunk>[], added: number, deleted: number): ChangedFile => ({
  path,
  status: "modified",
  added,
  deleted,
  binary: false,
  hunks,
  ignored: false,
});

const unknown = (id: string, value: number): Signal => ({ id, value, status: "unknown", summary: `${id} unknown`, evidence: [] });

const history = fakeHistory([
  fakeCommit("bob@x.com", ["src/a.ts"], 3),
  fakeCommit("me@x.com", ["src/a.ts"], 2),
  fakeCommit("carol@x.com", ["src/a.ts"], 400),
]);

/** A PR that passes every rule unless a test overrides something. Sampling off by default. */
function input(over: Partial<GateInput> & { cfg?: Record<string, unknown>; files?: ChangedFile[] } = {}): GateInput {
  const { cfg, files, ...rest } = over;
  const score = rest.score ?? 0.1;
  return {
    score,
    logit: logit(score),
    signals: [],
    contributions: [],
    diff: { base: "base", head: "head", files: files ?? [file("src/a.ts")], author: { name: "Me", email: "me@x.com" } },
    config: parseConfig({ autoApprove: { sampleRate: 0 }, ...cfg }),
    model: DEFAULT_WEIGHTS,
    history,
    llmFailed: false,
    ...rest,
  };
}

describe("decide: empty diff", () => {
  it("never auto-approves a diff with no changed files: there is nothing to review", () => {
    const policyOutcome = decide(input({ files: [] }));
    expect(policyOutcome.decision).toBe("human-review");
    expect(policyOutcome.rules!.map((firedRule) => firedRule.rule)).toContain("empty-diff");
    expect(isEmptyDiff(policyOutcome)).toBe(true);
  });

  it("does not treat a diff whose files are all ignored as empty", () => {
    const policyOutcome = decide(input({ files: [file("package-lock.json", 3, 3, true)] }));
    expect(policyOutcome.rules!.map((firedRule) => firedRule.rule)).not.toContain("empty-diff");
    expect(isEmptyDiff(policyOutcome)).toBe(false);
  });
});

describe("decide: rule 7 (auto-approve)", () => {
  it("auto-approves a green, unblocked, small PR with the configured merge method", () => {
    const out = decide(input());
    expect(out).toMatchObject({ tier: "green", decision: "auto-approve", hardBlocked: false, sampled: false, mergeMethod: "queue" });
    expect(out.reasons[0]).toMatch(/auto-approve/);
  });

  it("stays informational when autoApprove.enabled=false (dry run line)", () => {
    expect(decide(input()).reasons).toContain("dry run: autoApprove.enabled=false");
    expect(decide(input({ cfg: { autoApprove: { enabled: true, sampleRate: 0 } } })).reasons).not.toContain(
      "dry run: autoApprove.enabled=false",
    );
  });

  it("suggests recent authors of the changed files, excluding the PR author", () => {
    expect(decide(input()).suggestedReviewers).toEqual(["bob@x.com", "carol@x.com"]);
  });

  it("shows enough decimals when the score rounds to the same two decimals as green", () => {
    const out = decide(input({ score: 0.2996 }));
    expect(out.reasons[0]).toContain("score 0.2996 < green 0.30");
    expect(out.reasons[0]).not.toContain("0.30 < green 0.30");
  });

  it("shows enough decimals on both sides when the threshold itself has more than two decimals", () => {
    const out = decide(input({ cfg: { thresholds: { green: 0.3012 } }, score: 0.3004 }));
    expect(out.reasons[0]).toContain("score 0.3004 < green 0.3012");
  });
});

describe("decide: rule 1 (hard block)", () => {
  it("routes a paths.block glob hit to human review, even for ignored files", () => {
    const out = decide(input({ files: [file("src/a.ts"), file(".github/workflows/ci.yml", 1, 0, true)] }));
    expect(out).toMatchObject({ decision: "human-review", hardBlocked: true, mergeMethod: "none" });
    expect(out.reasons[0]).toContain(".github/workflows/ci.yml");
  });

  it("also honours a paths.blocked signal", () => {
    const signals: Signal[] = [{ id: "paths.blocked", value: 1, status: "observed", summary: "infra/main.tf is blocked", evidence: [] }];
    const out = decide(input({ signals }));
    expect(out).toMatchObject({ decision: "human-review", hardBlocked: true });
  });

  it("matches paths.block case-insensitively (makefile, EF Core Migrations/)", () => {
    for (const path of ["makefile", "src/Data/Migrations/20240101_Init.cs"]) {
      expect(decide(input({ files: [file(path)] })), path).toMatchObject({ decision: "human-review", hardBlocked: true });
    }
  });

  it("keeps the default blocks when the config sets its own paths.block", () => {
    const out = decide(input({ cfg: { autoApprove: { sampleRate: 0 }, paths: { block: ["infra/**"] } }, files: [file("package.json", 1, 1)] }));
    expect(out).toMatchObject({ decision: "human-review", hardBlocked: true });
  });

  it("routes a net test deletion to human review, whatever the score", () => {
    const signals: Signal[] = [{ id: "tests.deleted", value: 1, status: "observed", summary: "1 test file deleted", evidence: [] }];
    const out = decide(input({ signals, score: 0.05 }));
    expect(out).toMatchObject({ tier: "green", decision: "human-review", hardBlocked: false });
    expect(out.reasons[0]).toBe("test deletion: 1 test file deleted");
  });

  it("ignores a tests.deleted signal of 0", () => {
    const signals: Signal[] = [{ id: "tests.deleted", value: 0, status: "observed", summary: "no test deletion", evidence: [] }];
    expect(decide(input({ signals })).decision).toBe("auto-approve");
  });

  it("matches the old path of a rename", () => {
    const renamed: ChangedFile = { ...file("src/moved.sql"), status: "renamed", oldPath: "db/migrations/001.sql" };
    expect(decide(input({ files: [renamed] })).hardBlocked).toBe(true);
  });

  it("lists every rule that fired, the decisive one first", () => {
    const out = decide(input({ score: 0.9, files: [file(".opendrs.yml", 600, 0)] }));
    expect(out.reasons[0]).toMatch(/block/);
    expect(out.reasons[1]).toMatch(/600 changed lines/);
    expect(out.reasons[2]).toMatch(/red/);
    expect(out.tier).toBe("red");
  });
});

describe("decide: ignored or binary files", () => {
  const binary = (path: string): ChangedFile => ({ ...file(path, 0, 0), binary: true });

  it("never auto-approves a PR that changes an ignored file, but keeps its green tier", () => {
    const out = decide(input({ files: [file("src/a.ts"), file("package-lock.json", 1, 1, true)] }));
    expect(out).toMatchObject({ tier: "green", decision: "human-review", hardBlocked: false, mergeMethod: "none" });
    expect(out.reasons[0]).toMatch(/ignored or binary/);
    expect(out.reasons[0]).toContain("package-lock.json");
  });

  it("never auto-approves a PR that changes a binary file", () => {
    const out = decide(input({ files: [file("src/a.ts"), binary("gradle/wrapper/gradle-wrapper.jar")] }));
    expect(out.decision).toBe("human-review");
    expect(out.reasons[0]).toContain("gradle/wrapper/gradle-wrapper.jar");
  });

  it("never auto-approves a PR whose paths contain control characters", () => {
    const out = decide(input({ files: [file("src/a.ts"), file("docs/x\n::notice::ok\n.md")] }));
    expect(out.decision).toBe("human-review");
    expect(out.reasons[0]).toMatch(/control characters/);
  });

  it("never auto-approves a PR that moves a submodule pointer, but keeps its green tier", () => {
    const gitlink: ChangedFile = { ...file("libs/core", 1, 1), submodule: true };
    const out = decide(input({ files: [file("src/a.ts"), gitlink] }));
    expect(out).toMatchObject({ tier: "green", decision: "human-review", hardBlocked: false, mergeMethod: "none" });
    expect(out.reasons[0]).toMatch(/submodule/);
    expect(out.reasons[0]).toContain("libs/core");
  });

  it("names at most 3 such files", () => {
    const files = ["a.lock", "b.lock", "c.lock", "d.lock", "e.lock"].map((p) => file(p, 1, 0, true));
    const reason = decide(input({ files })).reasons[0]!;
    expect(reason).toContain("a.lock, b.lock, c.lock (+2 more)");
    expect(reason).not.toContain("d.lock");
  });

  it("fires right after the hard block", () => {
    const out = decide(input({ score: 0.9, files: [file(".github/x.yml"), file("vendor/x.go", 1, 0, true)] }));
    expect(out.reasons[0]).toMatch(/hard block/);
    expect(out.reasons[1]).toMatch(/ignored or binary.*vendor\/x\.go/);
    expect(out.reasons[2]).toMatch(/red/);
  });
});

describe("decide: content.block", () => {
  const hunk = (newStart: number, lines: string[]) => ({ oldStart: newStart, oldLines: 0, newStart, newLines: 0, lines });
  const withHunks = (path: string, ...hunks: ReturnType<typeof hunk>[]): ChangedFile => ({ ...file(path), hunks });
  const blockCfg = (...block: string[]) => ({ cfg: { autoApprove: { sampleRate: 0 }, content: { block } } });

  it("routes an added line matching a pattern to human review, naming the new-side line", () => {
    const f = withHunks("src/a.ts", hunk(10, [" a", "-eval(old)", "+b", " c"]), hunk(40, [" d", "+e", "+x = eval(y)", " f"]));
    const out = decide(input({ files: [f], ...blockCfg("\\beval\\(") }));
    expect(out).toMatchObject({ tier: "green", decision: "human-review", hardBlocked: false, mergeMethod: "none" });
    expect(out.reasons[0]).toBe("content.block /\\beval\\(/ matched src/a.ts:42");
  });

  it("never matches deleted or context lines", () => {
    const f = withHunks("src/a.ts", hunk(1, [" eval(a)", "-eval(b)", "+ok"]));
    expect(decide(input({ files: [f], ...blockCfg("eval") })).decision).toBe("auto-approve");
  });

  it("does not count a \\ No newline marker as a line", () => {
    const f = withHunks("src/a.ts", hunk(5, ["-old", "\\ No newline at end of file", "+new", "+eval(z)"]));
    expect(decide(input({ files: [f], ...blockCfg("eval") })).reasons[0]).toBe("content.block /eval/ matched src/a.ts:6");
  });

  it("counts an empty row as a context line, as the diff parser does", () => {
    const f = withHunks("src/a.ts", hunk(1, [" a", "", "+eval(z)"]));
    expect(decide(input({ files: [f], ...blockCfg("eval") })).reasons[0]).toBe("content.block /eval/ matched src/a.ts:3");
  });

  it("names at most 3 locations", () => {
    const f = withHunks("src/a.ts", hunk(1, ["+eval", "+eval", " x", "+eval", "+eval", "+eval"]));
    expect(decide(input({ files: [f], ...blockCfg("eval") })).reasons[0]).toBe(
      "content.block /eval/ matched src/a.ts:1, src/a.ts:2, src/a.ts:4 (+2 more)",
    );
  });

  it("gives one reason per matching pattern, in config order", () => {
    const f = withHunks("src/a.ts", hunk(1, ["+eval(x)", "+el.innerHTML = y"]));
    const out = decide(input({ files: [f], ...blockCfg("innerHTML", "nope", "eval") }));
    expect(out.reasons.slice(0, 2)).toEqual(["content.block /innerHTML/ matched src/a.ts:2", "content.block /eval/ matched src/a.ts:1"]);
    expect(out.reasons.join("\n")).not.toContain("nope");
  });

  it("has no effect without patterns", () => {
    const f = withHunks("src/a.ts", hunk(1, ["+eval(x)"]));
    expect(decide(input({ files: [f] })).decision).toBe("auto-approve");
  });

  it("skips binary files", () => {
    const f: ChangedFile = { ...withHunks("img.png", hunk(1, ["+eval"])), binary: true };
    expect(decide(input({ files: [f], ...blockCfg("eval") })).reasons.join("\n")).not.toContain("content.block");
  });

  it("scans ignored files too, after the other never-auto-approve rules", () => {
    const f: ChangedFile = { ...withHunks("vendor/x.go", hunk(1, ["+eval"])), ignored: true };
    const out = decide(input({ files: [f], ...blockCfg("eval") }));
    expect(out.reasons[0]).toMatch(/ignored or binary/);
    expect(out.reasons[1]).toBe("content.block /eval/ matched vendor/x.go:1");
  });
});

describe("decide: rule 2 (size cap)", () => {
  it("routes more than maxChangedLines to human review, not counting ignored files", () => {
    expect(decide(input({ files: [file("src/a.ts", 300, 101)] })).decision).toBe("human-review");
    const out = decide(input({ files: [file("src/a.ts", 300, 100), file("package-lock.json", 5000, 0, true)] }));
    expect(out.reasons.some((r) => /maxChangedLines/.test(r))).toBe(false);
  });

  it("counts a binary file as one changed line", () => {
    const bin: ChangedFile = { ...file("img.png", 0, 0), binary: true };
    const out = decide(input({ files: [file("src/a.ts", 300, 100), bin] }));
    expect(out.reasons).toContain("401 changed lines exceeds autoApprove.maxChangedLines (400)");
  });

  it("excludes a pure-docs PR from the size cap entirely", () => {
    const f = fileWithHunks("README.md", [hunk(Array(500).fill("+x"))], 500, 0);
    const out = decide(input({ files: [f], cfg: { autoApprove: { maxChangedLines: 400, sampleRate: 0 } } }));
    expect(out.decision).toBe("auto-approve");
    expect(out.reasons.some((r) => /maxChangedLines/.test(r))).toBe(false);
  });

  it("reports both numbers when inert lines were excluded", () => {
    const docs = fileWithHunks("README.md", [hunk(Array(300).fill("+x"))], 300, 0);
    const code = fileWithHunks("src/a.ts", [hunk(Array(200).fill("+const x = 1;"))], 200, 0);
    const out = decide(input({ files: [docs, code], cfg: { autoApprove: { maxChangedLines: 100, sampleRate: 0 } } }));
    expect(out.reasons).toContain(
      "500 changed lines, 200 counted toward maxChangedLines after excluding 300 inert docs/comment lines (cap 100)",
    );
  });

  it("an instructions file overrides sizeCapExempt and docs-family: it still counts in full", () => {
    const cfg = { autoApprove: { maxChangedLines: 10, sampleRate: 0, sizeCapExempt: ["**/*"] } };
    const f = fileWithHunks("CLAUDE.md", [hunk(Array(50).fill("+x"))], 50, 0);
    const out = decide(input({ files: [f], cfg }));
    expect(out.reasons).toContain("50 changed lines exceeds autoApprove.maxChangedLines (10)");
  });

  it("a test file under sizeCapExempt still counts in full", () => {
    const cfg = { autoApprove: { maxChangedLines: 10, sampleRate: 0, sizeCapExempt: ["**/*"] } };
    const f = fileWithHunks("tests/a.test.ts", [hunk(Array(50).fill("+x"))], 50, 0);
    const out = decide(input({ files: [f], cfg }));
    expect(out.reasons).toContain("50 changed lines exceeds autoApprove.maxChangedLines (10)");
  });

  it("countInertLines: true reproduces today's single-number reason exactly", () => {
    const cfg = { autoApprove: { maxChangedLines: 10, sampleRate: 0, countInertLines: true } };
    const f = fileWithHunks("README.md", [hunk(Array(50).fill("+x"))], 50, 0);
    const out = decide(input({ files: [f], cfg }));
    expect(out.reasons).toContain("50 changed lines exceeds autoApprove.maxChangedLines (10)");
  });

  it("a comment-only hunk excludes only that hunk; a sibling real-code hunk still counts", () => {
    const f = fileWithHunks(
      "src/a.ts",
      [hunk(Array(300).fill("+// comment")), hunk(Array(150).fill("+const x = 1;"))],
      450,
      0,
    );
    const out = decide(input({ files: [f], cfg: { autoApprove: { maxChangedLines: 400, sampleRate: 0 } } }));
    expect(out.reasons.some((r) => /maxChangedLines/.test(r))).toBe(false); // 150 <= 400
  });
});

describe("decide: rule 3 (tier)", () => {
  it("maps absolute thresholds: < green → green, ≥ red → red, else yellow", () => {
    expect(decide(input({ score: 0.29 })).tier).toBe("green");
    expect(decide(input({ score: 0.3 })).tier).toBe("yellow");
    expect(decide(input({ score: 0.79 })).tier).toBe("yellow");
    expect(decide(input({ score: 0.8 })).tier).toBe("red");
  });

  it("routes a non-green tier to human review and says why", () => {
    const out = decide(input({ score: 0.45 }));
    expect(out.decision).toBe("human-review");
    expect(out.reasons[0]).toMatch(/yellow.*0\.45.*0\.30/);
  });

  it("shows enough decimals when the score rounds to the same two decimals as green", () => {
    const out = decide(input({ score: 0.3004 }));
    expect(out.reasons[0]).toContain("score 0.3004 ≥ green threshold 0.30");
  });

  it("maps percentile thresholds through the model's history percentiles, interpolating", () => {
    const model: ModelWeights = { ...DEFAULT_WEIGHTS, percentiles: { "50": 0.1, "75": 0.2, "90": 0.4, "95": 0.5, "99": 0.7 } };
    const cfg = { thresholds: { mode: "percentile", green: 60, yellow: 90, red: 95 } };
    expect(decide(input({ cfg, model, score: 0.13 })).tier).toBe("green");
    expect(decide(input({ cfg, model, score: 0.15 })).tier).toBe("yellow");
    expect(decide(input({ cfg, model, score: 0.5 })).tier).toBe("red");
  });

  it("falls back to absolute defaults when the model has no percentiles", () => {
    const out = decide(input({ cfg: { thresholds: { mode: "percentile", green: 50, yellow: 90, red: 95 } }, score: 0.25 }));
    expect(out.tier).toBe("green");
    expect(out.reasons.some((r) => /percentile.*absolute defaults/.test(r))).toBe(true);
  });
});

describe("decide: freezes", () => {
  // Friday 20:00 in UTC, already Saturday 05:00 in Tokyo.
  const now = Date.UTC(2026, 9, 16, 20);
  const freeze = (window: Record<string, unknown>, cfg: Record<string, unknown> = {}) => ({
    cfg: { autoApprove: { sampleRate: 0 }, ...cfg, freezes: [{ name: "x", ...window }] },
    now,
  });

  it("matches the weekday in the window's own timezone", () => {
    expect(decide(input(freeze({ days: ["sat", "sun"] }))).decision).toBe("auto-approve");
    const out = decide(input(freeze({ name: "weekend", timezone: "Asia/Tokyo", days: ["sat", "sun"] })));
    expect(out).toMatchObject({ tier: "green", decision: "human-review", mergeMethod: "none" });
    expect(out.reasons[0]).toBe('freeze "weekend": auto-approval suspended');
  });

  it("treats from and to as inclusive local dates", () => {
    expect(decide(input(freeze({ from: "2026-10-16", to: "2026-10-16" }))).decision).toBe("human-review");
    expect(decide(input(freeze({ to: "2026-10-15" }))).decision).toBe("auto-approve");
    expect(decide(input(freeze({ from: "2026-10-17" }))).decision).toBe("auto-approve");
    expect(decide(input(freeze({ timezone: "Asia/Tokyo", from: "2026-10-17" }))).decision).toBe("human-review");
  });

  it("needs every condition it sets", () => {
    expect(decide(input(freeze({ days: ["fri"], from: "2026-10-17" }))).decision).toBe("auto-approve");
    expect(decide(input(freeze({ days: ["fri"], from: "2026-10-16" }))).decision).toBe("human-review");
  });

  it("with a green of its own, holds the score to that stricter threshold; the tier stays", () => {
    const window = { name: "black-friday", days: ["fri"], green: 0.15 };
    const out = decide(input({ ...freeze(window), score: 0.2 }));
    expect(out).toMatchObject({ tier: "green", decision: "human-review" });
    expect(out.reasons[0]).toBe('freeze "black-friday": score 0.20 ≥ freeze green 0.15');
    expect(decide(input({ ...freeze(window), score: 0.1 })).decision).toBe("auto-approve");
  });

  it("shows enough decimals when the freeze score rounds to the same two decimals as the freeze green", () => {
    const window = { name: "black-friday", days: ["fri"], green: 0.15 };
    const out = decide(input({ ...freeze(window), score: 0.1504 }));
    expect(out.reasons[0]).toBe('freeze "black-friday": score 0.1504 ≥ freeze green 0.15');
  });

  it("maps a percentile freeze green through the model's percentiles", () => {
    const model: ModelWeights = { ...DEFAULT_WEIGHTS, percentiles: { "50": 0.1, "75": 0.2, "90": 0.4, "95": 0.5, "99": 0.7 } };
    const cfg = { thresholds: { mode: "percentile", green: 60, yellow: 90, red: 95 } };
    const out = decide(input({ ...freeze({ days: ["fri"], green: 50 }, cfg), model, score: 0.12 }));
    expect(out).toMatchObject({ tier: "green", decision: "human-review" });
    expect(out.reasons[0]).toBe('freeze "x": score 0.12 ≥ freeze green 0.10');
    expect(decide(input({ ...freeze({ days: ["fri"], green: 50 }, cfg), model, score: 0.08 })).decision).toBe("auto-approve");
  });

  it("suspends auto-approval when a percentile freeze green cannot be mapped", () => {
    const cfg = { thresholds: { mode: "percentile", green: 50, yellow: 90, red: 95 } };
    const out = decide(input({ ...freeze({ days: ["fri"], green: 25 }, cfg), score: 0.01 }));
    expect(out.decision).toBe("human-review");
    expect(out.reasons[0]).toBe('freeze "x": percentile green 25 needs a calibrated model; auto-approval suspended');
  });

  it("uses the current time when none is given", () => {
    vi.useFakeTimers({ now });
    try {
      expect(decide(input({ cfg: { autoApprove: { sampleRate: 0 }, freezes: [{ name: "x", days: ["fri"] }] } })).decision).toBe("human-review");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("decide: per-source policy", () => {
  const now = NOW * 1000;
  const HOUR = 3600;
  const agent: Authorship = { kind: "agent", name: "Claude Code", evidence: ["commit 3f2a9c1: trailer Co-Authored-By: Claude"], verified: false };
  const human: Authorship = { kind: "human", name: "human", evidence: [], verified: false };
  /** A landed commit of `source`, `hoursAgo` before `now`; sha and revert fields overridable. */
  const landed = (source: SourceKind, hoursAgo: number, over: Partial<CommitInfo> = {}): CommitInfo => ({
    ...fakeCommit(`${source}@x.com`, ["src/a.ts"], 0),
    sha: `${String(hoursAgo).padStart(6, "0")}-${source}`,
    time: NOW - hoursAgo * HOUR,
    source,
    ...over,
  });
  const sources = (agent: Record<string, unknown>, cfg: Record<string, unknown> = {}) => ({
    cfg: { autoApprove: { sampleRate: 0 }, ...cfg, sources: { agent } },
    now,
  });

  it("changes nothing without a sources config, whatever the source", () => {
    expect(decide(input({ source: agent, now })).decision).toBe("auto-approve");
    expect(decide(input({ source: agent, now, score: 0.29 })).decision).toBe("auto-approve");
  });

  it("still applies the human policy to a PR that calls itself an agent in its commits", () => {
    const cfg = { autoApprove: { sampleRate: 0 }, sources: { human: { green: 0.1 } } };
    const out = decide(input({ cfg, now, source: agent, score: 0.2 }));
    expect(out.decision).toBe("human-review");
    expect(out.reasons).toContain("source human: score 0.20 ≥ source green 0.10");
  });

  it("keeps a verified bot account's policy when its commits carry agent trailers", () => {
    const cfg = { autoApprove: { sampleRate: 0 }, sources: { bot: { green: 0.1 } } };
    const raised: Authorship = { ...agent, floor: "bot" };
    expect(decide(input({ cfg, now, source: raised, score: 0.2 })).reasons).toContain("source bot: score 0.20 ≥ source green 0.10");
  });

  it("changes nothing without a source, whatever the config", () => {
    const cfg = { green: 0.1, dailyCap: 1, trackRecord: {} };
    expect(decide(input({ ...sources(cfg), score: 0.2 })).decision).toBe("auto-approve");
  });

  it("holds a source's score to its stricter green; the tier stays", () => {
    const out = decide(input({ ...sources({ green: 0.2 }), source: agent, score: 0.24 }));
    expect(out).toMatchObject({ tier: "green", decision: "human-review" });
    expect(out.reasons[0]).toBe("source agent: score 0.24 ≥ source green 0.20");
    expect(decide(input({ ...sources({ green: 0.2 }), source: agent, score: 0.19 })).decision).toBe("auto-approve");
  });

  it("shows enough decimals when the source score rounds to the same two decimals as the source green", () => {
    const out = decide(input({ ...sources({ green: 0.2 }), source: agent, score: 0.2004 }));
    expect(out.reasons[0]).toBe("source agent: score 0.2004 ≥ source green 0.20");
  });

  it("never fires for another kind", () => {
    expect(decide(input({ ...sources({ green: 0.2, dailyCap: 1, trackRecord: {} }), source: human, score: 0.24 })).decision).toBe("auto-approve");
  });

  it("maps a percentile source green through the model's percentiles", () => {
    const model: ModelWeights = { ...DEFAULT_WEIGHTS, percentiles: { "50": 0.1, "75": 0.2, "90": 0.4, "95": 0.5, "99": 0.7 } };
    const cfg = { thresholds: { mode: "percentile", green: 60, yellow: 90, red: 95 } };
    const out = decide(input({ ...sources({ green: 50 }, cfg), model, source: agent, score: 0.12 }));
    expect(out).toMatchObject({ tier: "green", decision: "human-review" });
    expect(out.reasons[0]).toBe("source agent: score 0.12 ≥ source green 0.10");
    expect(decide(input({ ...sources({ green: 50 }, cfg), model, source: agent, score: 0.08 })).decision).toBe("auto-approve");
  });

  it("suspends auto-approval when a percentile source green cannot be mapped", () => {
    const cfg = { thresholds: { mode: "percentile", green: 50, yellow: 90, red: 95 } };
    const out = decide(input({ ...sources({ green: 25 }, cfg), source: agent, score: 0.01 }));
    expect(out.decision).toBe("human-review");
    expect(out.reasons[0]).toBe("source agent: percentile green 25 needs a calibrated model; auto-approval suspended");
  });

  it("applies requireSafe for the source as if llm.requireSafe were on", () => {
    const cfg = { llm: { enabled: true } };
    const out = decide(input({ ...sources({ requireSafe: true }, cfg), source: agent }));
    expect(out.decision).toBe("human-review");
    expect(out.reasons[0]).toBe("LLM judge did not run; sources.agent.requireSafe needs its verdict");
    expect(decide(input({ ...sources({ requireSafe: true }, cfg), source: human })).decision).toBe("auto-approve");
  });

  describe("dailyCap", () => {
    const history = fakeHistory([
      landed("agent", 1),
      landed("agent", 2),
      landed("agent", 23),
      landed("agent", 25), // outside 24h
      landed("human", 3),
      landed("agent", 4, { sha: "inpr0000001" }),
    ]);

    it("counts only landed commits of that kind inside 24h, excluding the PR's own", () => {
      const out = decide(input({ ...sources({ dailyCap: 3 }), source: agent, history, prCommits: ["inpr0000001"] }));
      expect(out).toMatchObject({ tier: "green", decision: "human-review" });
      expect(out.reasons[0]).toBe("source agent: daily cap reached (3 landed in 24h)");
      expect(decide(input({ ...sources({ dailyCap: 4 }), source: agent, history, prCommits: ["inpr0000001"] })).decision).toBe("auto-approve");
      expect(decide(input({ ...sources({ dailyCap: 4 }), source: agent, history })).decision).toBe("human-review");
    });

    it("ignores commits after now", () => {
      const future = fakeHistory([landed("agent", -1), landed("agent", 1)]);
      expect(decide(input({ ...sources({ dailyCap: 2 }), source: agent, history: future })).decision).toBe("auto-approve");
    });
  });

  describe("trackRecord", () => {
    const days = (n: number) => n * 24;

    it("blocks a source with too few landed commits in the window, not counting the PR's own", () => {
      const history = fakeHistory([landed("agent", days(1)), landed("agent", days(30)), landed("agent", days(61)), landed("agent", 1, { sha: "inpr0000001" })]);
      const out = decide(input({ ...sources({ trackRecord: { minCommits: 3 } }), source: agent, history, prCommits: ["inpr0000001"] }));
      expect(out.decision).toBe("human-review");
      expect(out.reasons[0]).toBe("source agent: track record too short (2 of 3 landed commits in 60 days)");
      expect(decide(input({ ...sources({ trackRecord: { minCommits: 2 } }), source: agent, history })).decision).toBe("auto-approve");
    });

    it("blocks a revert rate above maxRevertRate, matching revertsSha as a prefix in either case", () => {
      const commits = Array.from({ length: 15 }, (_, i) => landed("agent", days(i + 1)));
      const reverts = [
        landed("human", 2, { isRevert: true, revertsSha: commits[0]!.sha.slice(0, 7) }),
        landed("human", 3, { isRevert: true, revertsSha: commits[1]!.sha }),
        landed("human", 4, { isRevert: true, revertsSha: commits[2]!.sha.toUpperCase() }), // "This reverts commit" matches /i
      ];
      const history = fakeHistory([...commits, ...reverts]);
      const out = decide(input({ ...sources({ trackRecord: { days: 60, minCommits: 10, maxRevertRate: 0.05 } }), source: agent, history }));
      expect(out.decision).toBe("human-review");
      expect(out.reasons[0]).toBe("source agent: 3 of 15 landed commits in 60 days reverted (20%) > 5%");
      expect(decide(input({ ...sources({ trackRecord: { maxRevertRate: 0.25 } }), source: agent, history })).decision).toBe("auto-approve");
    });
  });
});

describe("decide: rule 4 (unknowns and LLM failure)", () => {
  it("routes an LLM failure to human review", () => {
    expect(decide(input({ llmFailed: true })).decision).toBe("human-review");
  });

  describe("llm.requireSafe", () => {
    const requireSafe = { llm: { enabled: true, requireSafe: true } };
    const judgement = (over: Partial<LlmJudgement> = {}): LlmJudgement => ({
      risk: 0.1,
      rationale: "",
      riskySnippets: [],
      confidence: 9,
      hunks: [],
      unclassified: [],
      truncated: false,
      ...over,
    });
    const verdict = (over: Partial<LlmHunkVerdict> = {}): LlmHunkVerdict => ({
      file: "src/a.ts",
      line: 1,
      category: "refactor",
      safe: true,
      confidence: 9,
      reason: "renames",
      ...over,
    });
    const risky = verdict({ file: "src/b.ts", line: 7, category: "logic_bug", safe: false, confidence: 9, reason: "off by one" });

    it("is off by default: a risky hunk does not block when requireSafe is false", () => {
      expect(decide(input({ cfg: { llm: { enabled: true } }, llm: judgement({ hunks: [risky] }) })).decision).toBe("auto-approve");
    });

    it("blocks when the judge did not run (e.g. --no-llm): requireSafe needs a verdict", () => {
      const out = decide(input({ cfg: requireSafe }));
      expect(out.decision).toBe("human-review");
      expect(out.reasons).toContain("LLM judge did not run; llm.requireSafe needs its verdict");
    });

    it("passes when every hunk is safe at or above minConfidence", () => {
      const out = decide(input({ cfg: requireSafe, llm: judgement({ hunks: [verdict(), verdict({ line: 20, category: "tests", confidence: 8 })] }) }));
      expect(out.decision).toBe("auto-approve");
    });

    it("blocks on a safe hunk below minConfidence, naming it with its confidence", () => {
      const out = decide(input({ cfg: requireSafe, llm: judgement({ hunks: [verdict({ confidence: 7 })] }) }));
      expect(out.decision).toBe("human-review");
      expect(out.reasons[0]).toBe("LLM judge: not all hunks safe: src/a.ts:1 refactor (confidence 7)");
    });

    it("honours a configured minConfidence", () => {
      const cfg = { llm: { enabled: true, requireSafe: true, minConfidence: 6 } };
      expect(decide(input({ cfg, llm: judgement({ hunks: [verdict({ confidence: 7 })] }) })).decision).toBe("auto-approve");
    });

    it("blocks on a risk-category hunk even at full confidence", () => {
      const out = decide(input({ cfg: requireSafe, llm: judgement({ hunks: [verdict(), risky] }) }));
      expect(out.decision).toBe("human-review");
      expect(out.reasons[0]).toBe("LLM judge: not all hunks safe: src/b.ts:7 logic_bug (confidence 9)");
    });

    it("blocks on a truncated diff", () => {
      const out = decide(input({ cfg: requireSafe, llm: judgement({ truncated: true }) }));
      expect(out.decision).toBe("human-review");
      expect(out.reasons[0]).toBe("LLM judge saw a truncated diff");
    });

    it("blocks on unclassified hunks, naming them", () => {
      const out = decide(input({ cfg: requireSafe, llm: judgement({ unclassified: [{ file: "src/a.ts", line: 3 }, { file: "src/c.ts", line: 9 }] }) }));
      expect(out.decision).toBe("human-review");
      expect(out.reasons[0]).toBe("LLM judge did not classify 2 hunks: src/a.ts:3, src/c.ts:9");
    });

    it("names at most 3 hunks, then counts the rest", () => {
      const hunks = [1, 2, 3, 4, 5].map((line) => verdict({ line, confidence: 2 }));
      const out = decide(input({ cfg: requireSafe, llm: judgement({ hunks }) }));
      expect(out.reasons[0]).toBe(
        "LLM judge: not all hunks safe: src/a.ts:1 refactor (confidence 2), src/a.ts:2 refactor (confidence 2), src/a.ts:3 refactor (confidence 2) and 2 more",
      );
    });

    it("only adds human-review: it never clears another rule or lowers the tier", () => {
      const out = decide(input({ score: 0.5, cfg: requireSafe, llm: judgement({ hunks: [verdict()] }) }));
      expect(out).toMatchObject({ tier: "yellow", decision: "human-review" });
    });
  });

  it("routes an unknown signal that could lift the score out of green", () => {
    const out = decide(input({ score: 0.25, signals: [unknown("blast.dependents", Math.log1p(10))] }));
    expect(out.decision).toBe("human-review");
    expect(out.reasons[0]).toMatch(/blast\.dependents/);
  });

  it("lets an unknown signal pass when even its plausible worst case stays green", () => {
    expect(decide(input({ score: 0.05, signals: [unknown("blast.dependents", Math.log1p(10))] })).decision).toBe("auto-approve");
  });

  it("routes unknowns whose joint worst case changes the tier, though none does alone", () => {
    const signals = [unknown("history.prior_fixes", 0), unknown("diffusion.authors", 0), unknown("history.churn", 0)];
    for (const s of signals) expect(decide(input({ score: 0.15, signals: [s] })).decision, s.id).toBe("auto-approve");

    const out = decide(input({ score: 0.15, signals }));
    expect(out.decision).toBe("human-review");
    expect(out.reasons[0]).toMatch(/together raise the score to 0\.4\d \(yellow\)/);
    for (const s of signals) expect(out.reasons[0]).toContain(s.id);
  });

  it("measures the lift from the value the model used, i.e. the prior for an unknown", () => {
    // blast.dependents is scored at its prior log1p(10), so only the rest of the range is at stake.
    expect(decide(input({ score: 0.15, signals: [unknown("blast.dependents", 0)] })).decision).toBe("auto-approve");
  });

  it("uses the risky end of the range for negative weights", () => {
    const out = decide(input({ score: 0.2, signals: [unknown("expertise.author_commits", Math.log1p(100))] }));
    expect(out.decision).toBe("human-review");
  });

  it("ignores unknowns with zero weight and treats unknowns without a known range as risk", () => {
    expect(decide(input({ signals: [unknown("lang.js", 0)] })).decision).toBe("auto-approve");
    const model: ModelWeights = { ...DEFAULT_WEIGHTS, weights: { ...DEFAULT_WEIGHTS.weights, "custom.feature": 0.1 } };
    expect(decide(input({ model, signals: [unknown("custom.feature", 0)] })).decision).toBe("human-review");
  });
});

describe("decide: PR state (draft, changes requested)", () => {
  it("never auto-approves a draft PR", () => {
    const out = decide(input({ pr: { successfulChecks: [], draft: true } }));
    expect(out).toMatchObject({ decision: "human-review", mergeMethod: "none" });
    expect(out.reasons[0]).toBe("draft PR: never auto-approved while in draft");
  });

  it("never auto-approves while changes are requested, naming every reviewer", () => {
    const out = decide(input({ pr: { successfulChecks: [], changesRequestedBy: ["alice", "bob"] } }));
    expect(out.decision).toBe("human-review");
    expect(out.reasons[0]).toBe("changes requested by @alice, @bob: never auto-approved until resolved");
  });

  it("has no effect when the PR is ready, nobody requests changes, or the state is unknown (local run)", () => {
    expect(decide(input({ pr: { successfulChecks: [], draft: false, changesRequestedBy: [] } })).decision).toBe("auto-approve");
    expect(decide(input({ pr: { successfulChecks: [] } })).decision).toBe("auto-approve");
    expect(decide(input()).decision).toBe("auto-approve");
  });

  it("takes precedence over waiting for the AI review", () => {
    const cfg = { autoApprove: { sampleRate: 0, requireAiReview: { checks: ["claude-review"] } } };
    expect(decide(input({ cfg, pr: { successfulChecks: [], draft: true } })).decision).toBe("human-review");
  });
});

describe("decide: rule 5 (AI review)", () => {
  const cfg = { autoApprove: { sampleRate: 0, requireAiReview: { checks: ["claude-review", "security-review"] } } };

  it("waits when requirements are configured but PR state is unknown (local run)", () => {
    const out = decide(input({ cfg }));
    expect(out.decision).toBe("waiting-ai-review");
    expect(out.reasons[0]).toMatch(/claude-review/);
  });

  it("waits until every listed check has passed on the head commit", () => {
    const out = decide(input({ cfg, pr: { successfulChecks: ["security-review"] } }));
    expect(out.decision).toBe("waiting-ai-review");
    expect(out.reasons[0]).toBe("AI review pending: missing check claude-review");
    expect(decide(input({ cfg, pr: { successfulChecks: ["claude-review", "security-review"] } })).decision).toBe("auto-approve");
  });

  it("accepts { name, app } entries and reports them by name", () => {
    const pinned = { autoApprove: { sampleRate: 0, requireAiReview: { checks: [{ name: "claude-review", app: "coderabbitai" }, "security-review"] } } };
    expect(decide(input({ cfg: pinned, pr: { successfulChecks: ["security-review"] } })).reasons[0]).toBe("AI review pending: missing check claude-review");
    expect(decide(input({ cfg: pinned, pr: { successfulChecks: ["claude-review", "security-review"] } })).decision).toBe("auto-approve");
  });

  it.each([[{ name: "claude-review" }], [{ name: "claude-review", app: "" }], [{ name: "claude-review", app: "x", extra: 1 }]])(
    "rejects a check entry %j that is not a name or { name, app }",
    (entry) => {
      expect(() => parseConfig({ autoApprove: { requireAiReview: { checks: [entry] } } })).toThrow(/requireAiReview/);
    },
  );

  it("passes when no checks are configured", () => {
    expect(decide(input()).decision).toBe("auto-approve");
  });

  it("rejects a config that still lists requireAiReview.labels, even an empty list", () => {
    const removed =
      "requireAiReview.labels was removed in 0.1.1: labels are not tied to a commit and can be added by anyone with triage access; " +
      "require a check run instead (requireAiReview.checks)";
    for (const labels of [["ai-reviewed"], []]) {
      expect(() => parseConfig({ autoApprove: { requireAiReview: { checks: ["claude-review"], labels } } })).toThrow(removed);
    }
  });
});

describe("decide: rule 6 (sampling)", () => {
  it("routes sampled PRs to a human", () => {
    const out = decide(input({ cfg: { autoApprove: { sampleRate: 1 } } }));
    expect(out).toMatchObject({ decision: "human-review", sampled: true, mergeMethod: "none" });
  });

  it("hashes diff.head to a uniform, deterministic value", () => {
    expect(sampleValue("abc")).toBe(sampleValue("abc"));
    const values = Array.from({ length: 2000 }, (_, i) => sampleValue(`sha-${i}`));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const share = values.filter((v) => v < 0.1).length / values.length;
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.12);
  });

  it("is deterministic per head", () => {
    const cfg = { autoApprove: { sampleRate: 0.5 } };
    expect(decide(input({ cfg }))).toEqual(decide(input({ cfg })));
    expect(decide(input({ cfg })).sampled).toBe(sampleValue("head") < 0.5);
  });

  it("hashes pr.samplingKey instead of the head, so a new push cannot re-roll the sample", () => {
    const cfg = { autoApprove: { sampleRate: 0.5 } };
    const pr = { successfulChecks: [], number: 7, samplingKey: "o/r#7#salt" };
    const sampled = Array.from({ length: 20 }, (_, i) => {
      const base = input({ cfg, pr });
      return decide({ ...base, diff: { ...base.diff, head: `sha-${i}` } }).sampled;
    });
    expect(sampled).toEqual(Array(20).fill(sampleValue("o/r#7#salt") < 0.5));
  });
});

describe("decide: deferred review", () => {
  const deferred = (over: Record<string, unknown> = {}, cfg: Record<string, unknown> = {}) => ({
    autoApprove: { sampleRate: 0, deferredReview: { enabled: true, below: 0.45, ...over } },
    ...cfg,
  });
  const agent: Authorship = { kind: "agent", name: "Claude Code", evidence: [], verified: false };

  it("changes nothing by default: a score in the band is still human review", () => {
    expect(decide(input({ score: 0.34 })).decision).toBe("human-review");
    expect(decide(input({ score: 0.34, cfg: { autoApprove: { sampleRate: 0, deferredReview: { below: 0.45 } } } })).decision).toBe("human-review");
  });

  it("defers a PR in [green, below) that passes every other rule, keeping the configured merge method", () => {
    const out = decide(input({ score: 0.34, cfg: deferred() }));
    expect(out).toMatchObject({ tier: "yellow", decision: "deferred-review", mergeMethod: "queue", hardBlocked: false, sampled: false });
    expect(out.reasons[0]).toBe("deferred review: score 0.34 is in the deferred band (0.30–0.45); lands now, reviewed after merge");
    expect(out.reasons).toContain("dry run: autoApprove.enabled=false");
  });

  it("shows enough decimals when the score rounds to the same two decimals as green", () => {
    const out = decide(input({ score: 0.3004, cfg: deferred() }));
    expect(out.reasons[0]).toBe("deferred review: score 0.3004 is in the deferred band (0.30–0.45); lands now, reviewed after merge");
  });

  it("includes the green edge and excludes the below edge", () => {
    expect(decide(input({ score: 0.3, cfg: deferred() })).decision).toBe("deferred-review");
    expect(decide(input({ score: 0.449, cfg: deferred() })).decision).toBe("deferred-review");
    expect(decide(input({ score: 0.45, cfg: deferred() })).decision).toBe("human-review");
    expect(decide(input({ score: 0.29, cfg: deferred() })).decision).toBe("auto-approve");
  });

  it("maps a percentile below through the model's percentiles, and never defers without them", () => {
    const model: ModelWeights = { ...DEFAULT_WEIGHTS, percentiles: { "50": 0.1, "75": 0.2, "90": 0.4, "95": 0.5, "99": 0.7 } };
    const cfg = deferred({ below: 75 }, { thresholds: { mode: "percentile", green: 60, yellow: 90, red: 95 } });
    const out = decide(input({ cfg, model, score: 0.15 }));
    expect(out.decision).toBe("deferred-review");
    expect(out.reasons[0]).toContain("(0.14–0.20)");
    expect(decide(input({ cfg, model, score: 0.2 })).decision).toBe("human-review");
    expect(decide(input({ cfg, score: 0.34 })).decision).toBe("human-review");
  });

  it("says why a percentile below did not defer, only when the tier rule alone fired", () => {
    const cfg = deferred({ below: 75 }, { thresholds: { mode: "percentile", green: 60, yellow: 90, red: 95 } });
    const note = "deferred review: percentile below 75 needs a calibrated model; not deferred";
    const out = decide(input({ cfg, score: 0.34 }));
    expect(out.decision).toBe("human-review");
    expect(out.reasons).toContain(note);
    expect(decide(input({ cfg, score: 0.34, pr: { successfulChecks: [], draft: true } })).reasons).not.toContain(note);
    expect(decide(input({ cfg, score: 0.1 })).reasons).not.toContain(note);
  });

  it("relaxes only the tier rule: every other rule still decides", () => {
    const withAuto = (auto: Record<string, unknown>, cfg: Record<string, unknown> = {}) => ({
      autoApprove: { sampleRate: 0, deferredReview: { enabled: true, below: 0.45 }, ...auto },
      ...cfg,
    });
    const cases: Array<[string, Partial<GateInput> & { cfg?: Record<string, unknown>; files?: ChangedFile[] }, Decision]> = [
      ["sampling", { cfg: withAuto({ sampleRate: 1 }) }, "human-review"],
      ["draft", { cfg: deferred(), pr: { successfulChecks: [], draft: true } }, "human-review"],
      ["changes requested", { cfg: deferred(), pr: { successfulChecks: [], changesRequestedBy: ["ann"] } }, "human-review"],
      ["AI review", { cfg: withAuto({ requireAiReview: { checks: ["ai"] } }) }, "waiting-ai-review"],
      ["freeze", { cfg: deferred({}, { freezes: [{ name: "all", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }] }) }, "human-review"],
      ["size cap", { cfg: withAuto({ maxChangedLines: 5 }) }, "human-review"],
      ["LLM failure", { cfg: deferred(), llmFailed: true }, "human-review"],
      ["unknown", { cfg: deferred(), signals: [unknown("paths.critical", 0)] }, "human-review"],
      ["ignored file", { cfg: deferred(), files: [file("src/a.ts"), file("package-lock.json", 1, 0, true)] }, "human-review"],
      ["source green", { cfg: deferred({ sources: ["human", "agent"] }, { sources: { agent: { green: 0.2 } } }), source: agent, now: NOW * 1000 }, "human-review"],
    ];
    for (const [name, over, want] of cases) expect(decide(input({ score: 0.34, ...over })).decision, name).toBe(want);
  });

  it("requires every kind from the floor to the kind to be a deferrable source", () => {
    expect(decide(input({ score: 0.34, cfg: deferred(), source: agent })).decision).toBe("human-review");
    expect(decide(input({ score: 0.34, cfg: deferred({ sources: ["agent"] }), source: agent })).decision).toBe("human-review");
    expect(decide(input({ score: 0.34, cfg: deferred({ sources: ["human", "agent"] }), source: agent })).decision).toBe("deferred-review");
    expect(decide(input({ score: 0.34, cfg: deferred({ sources: ["human", "agent"] }), source: { ...agent, floor: "bot" } })).decision).toBe("human-review");
    expect(decide(input({ score: 0.34, cfg: deferred({ sources: ["bot", "agent"] }), source: { ...agent, floor: "bot" } })).decision).toBe("deferred-review");
  });

  it("treats a PR without a source as human", () => {
    expect(decide(input({ score: 0.34, cfg: deferred({ sources: ["bot"] }) })).decision).toBe("human-review");
    expect(decide(input({ score: 0.34, cfg: deferred({ sources: ["human"] }) })).decision).toBe("deferred-review");
  });
});

describe("decide: landing delay", () => {
  const agent: Authorship = { kind: "agent", name: "Claude Code", evidence: [], verified: false };
  const cfg = (auto: number, sources: Record<string, unknown> = {}) => ({ autoApprove: { sampleRate: 0, landingDelayMinutes: auto }, sources });

  it("is 0 by default", () => {
    expect(decide(input()).landingDelayMinutes).toBe(0);
    expect(decide(input({ source: agent })).landingDelayMinutes).toBe(0);
  });

  it("is the larger of autoApprove.landingDelayMinutes and every applicable source's own", () => {
    expect(decide(input({ cfg: cfg(30) })).landingDelayMinutes).toBe(30);
    expect(decide(input({ cfg: cfg(30, { agent: { landingDelayMinutes: 60 } }) })).landingDelayMinutes).toBe(30);
    expect(decide(input({ cfg: cfg(30, { agent: { landingDelayMinutes: 60 } }), source: agent })).landingDelayMinutes).toBe(60);
    expect(decide(input({ cfg: cfg(120, { agent: { landingDelayMinutes: 60 } }), source: agent })).landingDelayMinutes).toBe(120);
    expect(decide(input({ cfg: cfg(0, { bot: { landingDelayMinutes: 90 }, agent: { landingDelayMinutes: 60 } }), source: { ...agent, floor: "bot" } })).landingDelayMinutes).toBe(90);
    expect(decide(input({ cfg: cfg(0, { human: { landingDelayMinutes: 15 } }), source: agent })).landingDelayMinutes).toBe(15);
  });

  it("is reported whatever the decision", () => {
    expect(decide(input({ cfg: cfg(30), score: 0.9 })).landingDelayMinutes).toBe(30);
  });
});

describe("rules (tagged subset of reasons, for the brief's needsHuman)", () => {
  it("tags a hard block, a tier miss, a draft and a sample with their rule ids", () => {
    const blocked = decide(input({ files: [file(".github/workflows/x.yml")] }));
    expect(blocked.rules).toContainEqual({ rule: "paths.block", reason: blocked.reasons[0] });

    const tiered = decide(input({ score: 0.9 }));
    expect(tiered.rules!.map((r) => r.rule)).toContain("tier");

    const draft = decide(input({ pr: { successfulChecks: [], draft: true } }));
    expect(draft.rules!.map((r) => r.rule)).toContain("draft");

    const sampled = decide(input({ cfg: { autoApprove: { sampleRate: 1 } } }));
    expect(sampled.rules!.map((r) => r.rule)).toContain("sample");
  });

  it("does not tag the final auto-approve/deferred-review line or dry-run notes", () => {
    const ok = decide(input());
    expect(ok.reasons[0]).toMatch(/auto-approve/);
    expect(ok.rules).toHaveLength(0);
  });

  it("tags every rule id the brief's §5.7 'needs a human' list names", () => {
    const unread = decide(input({ files: [{ ...file("a.bin"), binary: true }] }));
    expect(unread.rules!.map((r) => r.rule)).toContain("unread-files");
    const odd = decide(input({ files: [file("a\u0000b.ts")] }));
    expect(odd.rules!.map((r) => r.rule)).toContain("control-chars");
    const sub = decide(input({ files: [{ ...file("vendor/x"), submodule: true }] }));
    expect(sub.rules!.map((r) => r.rule)).toContain("submodule");
  });
});
