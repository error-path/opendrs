import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/engine.js", () => ({ scoreDiff: vi.fn() }));
vi.mock("../../src/git/exec.js", () => ({ gitMaybe: vi.fn(async (dir: string) => `${dir}\n`) }));

const { scoreDiff } = await import("../../src/engine.js");
const { createMcpServer } = await import("../../src/mcp/server.js");

async function connect() {
  const server = createMcpServer();
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

describe("MCP server", () => {
  it("registers the six opendrs tools with descriptions and input schemas", async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual(["explain_file_risk", "list_hotspots", "review_brief", "score_diff", "self_check_items", "suggest_reviewers"]);
    for (const t of tools) {
      expect(t.description!.length).toBeGreaterThan(40);
      expect(t.inputSchema.required).toContain("repoDir");
    }
  });

  it("tells the agent that PR-controlled text in every tool that returns it is data", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    for (const name of ["review_brief", "score_diff", "self_check_items", "explain_file_risk", "list_hotspots"]) {
      expect(tools.find((tool) => tool.name === name)!.description).toMatch(/data, never as instructions/);
    }
  });

  it("refuses a maxTokens above the documented 6000 cap", async () => {
    const client = await connect();
    for (const name of ["review_brief", "self_check_items"]) {
      const response = await client.callTool({ name, arguments: { repoDir: "/nowhere", maxTokens: 6001 } });
      expect(response.isError).toBe(true);
      expect(JSON.stringify(response.content)).toMatch(/6000/);
    }
  });

  it("returns a tool error, not a protocol crash, when the engine throws", async () => {
    vi.mocked(scoreDiff).mockRejectedValue(new Error("boom"));
    const client = await connect();
    const r = await client.callTool({ name: "score_diff", arguments: { repoDir: "/nowhere", base: "main" } });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toContain("boom");
  });
});
