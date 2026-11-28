import { parseArgs } from "node:util";
import type { Command } from "../types.js";

interface McpModule {
  runMcpServer(): Promise<void>;
}

// A variable specifier keeps the server (and the MCP SDK) out of the load path of other commands.
const SERVER_MODULE = "../../mcp/server.js";

/**
 * Creates the `opendrs mcp` command, which serves the MCP tools on stdio.
 *
 * @param load - Loads the server module; tests pass a fake.
 * @returns The command.
 */
export function mcpCommand(load: () => Promise<McpModule> = () => import(SERVER_MODULE) as Promise<McpModule>): Command {
  return {
    name: "mcp",
    summary: "Run the MCP server on stdio (tools: score_diff, review_brief, self_check_items, explain_file_risk, list_hotspots, suggest_reviewers)",
    help: `Usage: opendrs mcp

Run a Model Context Protocol server on stdin/stdout for coding agents.`,

    async run(args, io) {
      parseArgs({ args, options: {} });
      let mod: McpModule;
      try {
        mod = await load();
      } catch (error) {
        io.err(`opendrs mcp: the MCP server is not available in this build (${(error as Error).message})`);
        return 2;
      }
      await mod.runMcpServer();
      return 0;
    },
  };
}
