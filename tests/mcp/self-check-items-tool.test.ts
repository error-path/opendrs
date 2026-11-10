import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import type { ReviewBrief } from "../../src/domain/types.js";

vi.mock("../../src/engine.js", () => ({ scoreDiff: vi.fn() }));
vi.mock("../../src/git/exec.js", () => ({ gitMaybe: vi.fn(async (dir: string) => `${dir}\n`) }));

const { scoreDiff } = await import("../../src/engine.js");
const { selfCheckItemsTool } = await import("../../src/mcp/tools.js");

// The tools resolve repoDir, which on Windows turns /tmp/... into a C: drive path, so compare against that.
const REPO = resolve("/tmp/opendrs-mcp-self-check-test-repo-does-not-exist");

const brief = (): ReviewBrief => ({
  version: 1,
  verdict: { tier: "green", score: 0.1, decision: "auto-approve", why: "ok" },
  reviewFirst: [{ file: "a.ts", reasons: [], hunks: [{ id: 1, oldStart: 1, newStart: 1, newLines: 2, score: 1, reasons: [{ kind: "critical", text: "critical path" }] }] }],
  checks: [],
  skim: [],
  human: [],
  notRanked: { hunks: 0, files: 0 },
  budget: { maxTokens: 2500, estimatedTokens: 10, truncated: false, omitted: { files: 0, hunks: 0, checks: 0, notes: 0 } },
  notes: [],
});

beforeEach(() => vi.clearAllMocks());

describe("selfCheckItemsTool", () => {
  it("returns the brief's self-check items as JSON text content", async () => {
    vi.mocked(scoreDiff).mockResolvedValue({ brief: brief() } as never);
    const result = await selfCheckItemsTool({ repoDir: REPO, base: "main" });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({ items: [{ id: "hunk:a.ts:1", file: "a.ts", line: 1, text: "critical path" }] });
    expect(vi.mocked(scoreDiff).mock.calls[0]![0]).toMatchObject({ repoDir: REPO, base: "main", head: "HEAD" });
  });

  it("returns isError on failure", async () => {
    vi.mocked(scoreDiff).mockRejectedValue(new Error("boom"));
    const result = await selfCheckItemsTool({ repoDir: REPO });
    expect(result.isError).toBe(true);
  });
});
