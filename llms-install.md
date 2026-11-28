# Installing the opendrs MCP server (for AI agents such as Cline)

opendrs scores a pull request or local diff from 0 to 1 from git history and the import graph. It
runs locally over stdio, needs no API key and no account, and only reads the git repository it is
pointed at.

## Requirements

- Node.js 22 or newer, with `npx` on the PATH.
- A git repository with some history to score (the user's project).

## Add the server

Add this entry to the MCP settings (for Cline: `cline_mcp_settings.json`, opened from the MCP
Servers panel, "Configure MCP Servers"):

```json
{
  "mcpServers": {
    "opendrs": {
      "command": "npx",
      "args": ["-y", "@error-path/opendrs@0.7.1", "mcp"]
    }
  }
}
```

On Windows, `npx` is a `.cmd` file that a stdio launcher cannot start directly. Use `cmd` instead:

```json
{
  "mcpServers": {
    "opendrs": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@error-path/opendrs@0.7.1", "mcp"]
    }
  }
}
```

With the Cline CLI, the same server is added with
`cline mcp add opendrs --yes -- npx -y @error-path/opendrs@0.7.1 mcp` (on Windows, run it from
PowerShell or cmd, and put `cmd /c` before `npx`).

Do not run it from inside a checkout of the opendrs repository itself: there, `npx` resolves the
local, unbuilt package of the same name instead of the published one.

## Check that it works

Call `list_hotspots` with `repoDir` set to the absolute path of the user's repository. It returns
the riskiest files. Then, on a branch with changes, call `score_diff` with the same `repoDir` (and
`base`, such as `main`, if the default `origin/HEAD` is not set) to get the score, tier and the
signals behind them.

## Tools

`score_diff`, `review_brief`, `self_check_items`, `explain_file_risk`, `list_hotspots`,
`suggest_reviewers`. Details: [docs/cli-and-mcp.md](docs/cli-and-mcp.md).
