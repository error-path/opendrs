import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import type { HistoryIndex, ScoreResult } from "../../src/domain/types.js";
import { OpendrsError } from "../../src/domain/types.js";

vi.mock("../../src/engine.js", () => ({ scoreDiff: vi.fn() }));
vi.mock("../../src/explain.js", () => ({ explainFile: vi.fn() }));
vi.mock("../../src/hotspots.js", () => ({ hotspots: vi.fn() }));
vi.mock("../../src/git/history.js", () => ({ buildHistoryIndex: vi.fn() }));
vi.mock("../../src/policy/reviewers.js", () => ({ suggestReviewers: vi.fn() }));
vi.mock("../../src/git/exec.js", () => ({ gitMaybe: vi.fn() }));

const { scoreDiff } = await import("../../src/engine.js");
const { explainFile } = await import("../../src/explain.js");
const { hotspots } = await import("../../src/hotspots.js");
const { buildHistoryIndex } = await import("../../src/git/history.js");
const { suggestReviewers } = await import("../../src/policy/reviewers.js");
const { gitMaybe } = await import("../../src/git/exec.js");
const { scoreDiffTool, explainFileRiskTool, listHotspotsTool, suggestReviewersTool } = await import("../../src/mcp/tools.js");

// The tools resolve repoDir, which on Windows turns /tmp/... into a C: drive path, so compare against that.
const REPO = resolve("/tmp/opendrs-mcp-test-repo-does-not-exist");

function result(): ScoreResult {
  const contributions = Array.from({ length: 9 }, (_, i) => ({ id: `sig.${i}`, value: i, weight: 0.5, contribution: 9 - i }));
  return {
    score: 0.71234,
    tier: "yellow",
    signals: contributions.map((c) => ({
      id: c.id,
      value: c.value,
      status: "observed",
      summary: `summary ${c.id}`,
      evidence: [{ file: "src/a.ts", detail: `ev ${c.id}` }],
    })),
    contributions,
    unknowns: ["blast.dependents"],
    policy: {
      tier: "yellow",
      decision: "human-review",
      reasons: ["tier yellow"],
      rules: [],
      hardBlocked: false,
      sampled: false,
      mergeMethod: "queue",
      suggestedReviewers: ["ana@example.com"],
      landingDelayMinutes: 0,
    },
    llm: { risk: 0.6, rationale: "changes locking", riskySnippets: [], confidence: 7, hunks: [], unclassified: [], truncated: false },
    source: { kind: "agent", name: "Claude Code", evidence: ['commit 3f2a9c1: trailer "Co-Authored-By: Claude <noreply@anthropic.com>"'], verified: false },
    diff: { base: "b", head: "h", files: 3, added: 40, deleted: 2 },
    model: "default",
    version: "0.1.5",
  };
}

const json = (r: { content: Array<{ type: string; text?: string }> }) => JSON.parse(r.content[0]!.text!);

/** The repo root is the given dir; `originHead` answers the origin/HEAD probe. */
const gitAnswers = (originHead?: string) =>
  vi.mocked(gitMaybe).mockImplementation(async (dir, args) => (args.includes("--show-toplevel") ? `${dir}\n` : originHead));

beforeEach(() => {
  vi.clearAllMocks();
  gitAnswers();
});

describe("score_diff", () => {
  it("scores against origin/HEAD by default and returns compact JSON", async () => {
    gitAnswers("abc123\n");
    vi.mocked(scoreDiff).mockResolvedValue(result());

    const r = await scoreDiffTool({ repoDir: REPO });

    expect(r.isError).toBeFalsy();
    expect(vi.mocked(scoreDiff).mock.calls[0]![0]).toMatchObject({ repoDir: REPO, base: "origin/HEAD", head: "HEAD" });
    const out = json(r);
    expect(out).toMatchObject({
      score: 0.712,
      tier: "yellow",
      decision: "human-review",
      reasons: ["tier yellow"],
      unknowns: ["blast.dependents"],
      suggestedReviewers: ["ana@example.com"],
      llmRationale: "changes locking",
      source: { kind: "agent", name: "Claude Code" },
    });
    expect(out.contributions).toHaveLength(6);
    expect(out.contributions[0]).toMatchObject({ id: "sig.0", contribution: 9, summary: "summary sig.0" });
    expect(out.contributions[0].evidence[0].detail).toBe("ev sig.0");
  });

  it("falls back to main when origin/HEAD does not resolve", async () => {
    gitAnswers(undefined);
    vi.mocked(scoreDiff).mockResolvedValue(result());
    await scoreDiffTool({ repoDir: REPO });
    expect(vi.mocked(scoreDiff).mock.calls[0]![0]).toMatchObject({ base: "main" });
  });

  it("passes explicit refs through without probing origin/HEAD", async () => {
    vi.mocked(scoreDiff).mockResolvedValue(result());
    await scoreDiffTool({ repoDir: REPO, base: "release", head: "feature" });
    expect(vi.mocked(gitMaybe).mock.calls.filter(([, args]) => args.includes("origin/HEAD^{commit}"))).toEqual([]);
    expect(vi.mocked(scoreDiff).mock.calls[0]![0]).toMatchObject({ base: "release", head: "feature" });
  });

  it("returns engine failures as a tool error instead of throwing", async () => {
    gitAnswers("abc");
    vi.mocked(scoreDiff).mockRejectedValue(new OpendrsError("git diff failed: bad revision", "git"));
    const r = await scoreDiffTool({ repoDir: REPO });
    expect(r.isError).toBe(true);
    expect(r.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("bad revision") });
  });
});

describe("explain_file_risk", () => {
  it("returns the file explanation", async () => {
    vi.mocked(explainFile).mockResolvedValue({
      path: "src/a.ts",
      commits: 4,
      fixCommits: 1,
      authors: 2,
      directDependents: 3,
      transitiveDependents: 9,
      critical: false,
      blocked: false,
      topAuthors: ["ana@example.com"],
    });
    const r = await explainFileRiskTool({ repoDir: REPO, path: "src/a.ts" });
    expect(vi.mocked(explainFile).mock.calls[0]!.slice(0, 2)).toEqual([REPO, "src/a.ts"]);
    expect(json(r)).toMatchObject({ path: "src/a.ts", transitiveDependents: 9 });
  });

  it("reports failures as a tool error", async () => {
    vi.mocked(explainFile).mockRejectedValue(new Error("not implemented"));
    expect((await explainFileRiskTool({ repoDir: REPO, path: "x" })).isError).toBe(true);
  });
});

describe("list_hotspots", () => {
  it("returns the ranked files and passes top through", async () => {
    const row = { rank: 1, score: 3.2, path: "src/a.ts", commits: 4, fixCommits: 2, authors: 2, transitiveDependents: 9, critical: false, blocked: false };
    const warnings = ["import graph failed: boom; dependents not shown"];
    vi.mocked(hotspots).mockResolvedValue({ hotspots: [row], warnings });
    const r = await listHotspotsTool({ repoDir: REPO, top: 5 });
    expect(vi.mocked(hotspots).mock.calls[0]![0]).toBe(REPO);
    expect(vi.mocked(hotspots).mock.calls[0]![2]).toBe(5);
    expect(json(r)).toEqual({ hotspots: [row], warnings });
  });

  it("reports failures as a tool error", async () => {
    vi.mocked(hotspots).mockRejectedValue(new Error("not implemented"));
    expect((await listHotspotsTool({ repoDir: REPO })).isError).toBe(true);
  });
});

describe("suggest_reviewers", () => {
  it("builds the history index at HEAD and suggests reviewers for the paths", async () => {
    const history = { commits: [] } as unknown as HistoryIndex;
    vi.mocked(buildHistoryIndex).mockResolvedValue(history);
    vi.mocked(suggestReviewers).mockReturnValue(["ana@example.com", "bo@example.com"]);

    const r = await suggestReviewersTool({ repoDir: REPO, paths: ["src/a.ts"] });

    expect(vi.mocked(buildHistoryIndex).mock.calls[0]!.slice(0, 2)).toEqual([REPO, "HEAD"]);
    expect(vi.mocked(suggestReviewers).mock.calls[0]!.slice(0, 2)).toEqual([history, ["src/a.ts"]]);
    expect(json(r)).toEqual({ reviewers: ["ana@example.com", "bo@example.com"] });
  });

  it("reports failures as a tool error", async () => {
    vi.mocked(buildHistoryIndex).mockRejectedValue(new OpendrsError("not a git repository", "git"));
    const r = await suggestReviewersTool({ repoDir: REPO, paths: ["a"] });
    expect(r.isError).toBe(true);
    expect(r.content[0]).toMatchObject({ text: expect.stringContaining("not a git repository") });
  });
});
