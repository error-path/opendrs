import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { resolve } from "node:path";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewBrief } from "../../src/domain/types.js";

vi.mock("../../src/engine.js", () => ({ scoreDiff: vi.fn() }));
vi.mock("../../src/git/exec.js", () => ({ gitMaybe: vi.fn(async (dir: string) => `${dir}\n`) }));

const { scoreDiff } = await import("../../src/engine.js");
const { reviewBriefTool } = await import("../../src/mcp/tools.js");
const { createMcpServer } = await import("../../src/mcp/server.js");

// The tools resolve repoDir, which on Windows turns /tmp/... into a C: drive path, so compare against that.
const REPO = resolve("/tmp/opendrs-mcp-brief-test-repo-does-not-exist");

const brief = (): ReviewBrief => ({
  version: 1,
  verdict: { tier: "green", score: 0.1, decision: "auto-approve", why: "ok" },
  reviewFirst: [{ file: "a.ts", reasons: [], hunks: [] }],
  checks: [],
  skim: [],
  human: [],
  notRanked: { hunks: 0, files: 0 },
  budget: { maxTokens: 2500, estimatedTokens: 10, truncated: false, omitted: { files: 0, hunks: 0, checks: 0, notes: 0 } },
  notes: [],
});

beforeEach(() => vi.clearAllMocks());

describe("reviewBriefTool", () => {
  it("asks scoreDiff for a brief and returns the markdown as text and the brief as structured content", async () => {
    vi.mocked(scoreDiff).mockResolvedValue({ brief: brief() } as never);
    const result = await reviewBriefTool({ repoDir: REPO, base: "main", maxTokens: 900 });
    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([{ type: "text", text: expect.stringMatching(/^opendrs review brief v1 · 🟢 0\.10 green · auto-approve · ok\n/) }]);
    expect(result.structuredContent).toEqual(brief());
    expect(vi.mocked(scoreDiff).mock.calls[0]![0]).toMatchObject({ repoDir: REPO, base: "main", head: "HEAD", brief: { maxTokens: 900 } });
  });

  it("returns isError on failure", async () => {
    vi.mocked(scoreDiff).mockRejectedValue(new Error("boom"));
    const result = await reviewBriefTool({ repoDir: REPO });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: "boom" }]);
  });

  it("is served over MCP with its structured content validated by the output schema", async () => {
    vi.mocked(scoreDiff).mockResolvedValue({ brief: brief() } as never);
    const server = createMcpServer();
    const client = new Client({ name: "test", version: "0.0.0" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

    const tool = (await client.listTools()).tools.find((t) => t.name === "review_brief")!;
    expect(tool.inputSchema.required).toEqual(["repoDir"]);
    expect(tool.outputSchema).toBeDefined();
    const r = await client.callTool({ name: "review_brief", arguments: { repoDir: REPO } });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toEqual(brief());
    expect(JSON.stringify(r.content)).toContain("opendrs review brief v1");
  });

  it("rejects a maxTokens too small to fit the brief's mandatory sections", async () => {
    vi.mocked(scoreDiff).mockResolvedValue({ brief: brief() } as never);
    const server = createMcpServer();
    const client = new Client({ name: "test", version: "0.0.0" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

    const r = await client.callTool({ name: "review_brief", arguments: { repoDir: REPO, maxTokens: 100 } });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toMatch(/at least 300/);
  });
});
