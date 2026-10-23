---
title: "CLI, MCP server, Claude Code plugin and agent skill"
description: "Every opendrs command and flag, the MCP server that lets coding agents score a diff before they open a PR, the Claude Code plugin and the agent skill."
---

# CLI, MCP server, Claude Code plugin and agent skill

opendrs runs as a command-line tool, as a Model Context Protocol server for coding agents, and as an agent skill that tells an agent when to use it.

## CLI

| Command | What it does |
|---|---|
| `opendrs score [--base ref] [--head ref] [--json \| --markdown] [--fail-above x] [--no-llm] [--title t]` | Score `merge-base(base, head)..head`. Base defaults to `origin/HEAD`, then `main`, then `master`. |
| `opendrs brief [--base ref] [--head ref] [--json] [--max-tokens n] [--no-llm] [--self-check-template]` | Build the review brief: ranked hunks, check questions, safe-to-skim list and hard-rule reasons. `--self-check-template` prints the ids a pre-PR self-check should address instead. Informational; always exits 0. |
| `opendrs explain <file> [--json]` | A file's history, fixes, authors, dependents and path policy. |
| `opendrs hotspots [--top n] [--json]` | Rank the repository's files by risk at rest (ranks by fixes, churn, dependents and critical paths; shows authors): where refactoring pays off. |
| `opendrs feedback --inducing <sha> [--fix <sha>] [--note text]`, or `--pr <n> --was-incident` | Record an incident in `.opendrs/incidents.jsonl`, the strongest label for `calibrate`. |
| `opendrs calibrate [--since date] [--max-commits n] [--label-horizon-days n]` | Fit the model and write it to `config.model`. |
| `opendrs backtest [--since date] [--max-commits n] [--label-horizon-days n] [--json]` | Compare default and calibrated models on your history. |
| `opendrs init [--force]` | Write a commented `.opendrs.yml` and a comment-only workflow. |
| `opendrs mcp` | Run the MCP server. |

Exit codes: 0 success, 1 score above `--fail-above`, 2 error. Set `OPENDRS_DEBUG=1` for stack traces.

## MCP server

`opendrs mcp` runs a Model Context Protocol server on stdio, so coding agents can check risk
before they open a PR. It exposes `score_diff` (base, head, cwd), `review_brief` (base, head,
maxTokens), `self_check_items` (base, head, maxTokens), `explain_file_risk` (path),
`suggest_reviewers` (paths) and `list_hotspots` (top). For Claude Code:

```sh
claude mcp add opendrs -- npx -y @error-path/opendrs mcp
```

Other clients take the same command: `{"command": "npx", "args": ["-y", "@error-path/opendrs", "mcp"]}`.

The repository also has a `Dockerfile` that runs the MCP server over stdio. Mount the repository to
score at `/repo`: `docker build -t opendrs . && docker run -i --rm -v "$PWD:/repo" opendrs`.

### MCP tools

Every tool also takes `repoDir`, the absolute path to the git repository (any directory inside the work tree). All six are read-only.

| Tool | Arguments | Returns |
|---|---|---|
| `score_diff` | `base` (base ref to diff against; defaults to `origin/HEAD`, or `main` when that is not set), `head` (head ref to score; defaults to `HEAD`) | The Diff Risk Score (0-1, calibrated probability that the change causes an incident) for the changes between the two refs: the score, tier (green/yellow/red), the gate decision and its reasons, the top contributing signals with evidence, signals that could not be computed (unknowns), suggested reviewers, and the LLM judge's rationale when enabled. Use it before opening a pull request, or to decide whether a change should be split. |
| `review_brief` | `base`, `head` (as `score_diff`), `maxTokens` (override the token budget) | The review brief as Markdown text content and structured `ReviewBrief` JSON. Call it before reviewing a diff. |
| `self_check_items` | `base`, `head`, `maxTokens` (as `review_brief`) | The ids (captain facts, reviewFirst hunks, check questions) a pre-PR self-check should fix or explain, as `{ items: [{ id, file, line?, text }] }`. Write verdicts into the head commit's message as described in [docs/llm-reviewers.md](llm-reviewers.html#self-check-before-you-open-the-pr); advisory only, never part of the gate. |
| `explain_file_risk` | `path` (repo-relative file path with forward slashes, e.g. `src/auth/session.ts`) | The standing risk profile of one file at HEAD: commit and bug-fix history, number of authors, direct and transitive dependents (blast radius; null when the language is not supported), whether it is on a critical or blocked path, and its top authors. Use it before editing a file you do not know, or to explain a high `blast.dependents` contribution. |
| `list_hotspots` | `top` (how many files to return; defaults to 20) | The files tracked at HEAD ranked by code-at-rest risk: bug-fix commits, churn, dependents and critical paths in the history lookback window (authors shown, not scored), as `{ hotspots, warnings }`, with transitive dependents in the import graph (null when the language is not supported) and critical or blocked path flags. Use it to find where a codebase is most likely to break, or to pick files for reengineering or extra test coverage. |
| `suggest_reviewers` | `paths` (repo-relative file paths the change touches; at least one) | Up to three reviewers (author emails) for the files, ranked by how often they recently changed them in git history. Use it to pick human reviewers for a risky change. |

## Claude Code plugin

The plugin bundles the agent skill and the MCP server, so Claude Code checks a change's risk before
it opens a pull request. Install it from inside Claude Code:

```text
/plugin marketplace add error-path/opendrs
/plugin install opendrs@opendrs
```

## Agent skill

The agent skill in [`skills/opendrs/SKILL.md`](https://github.com/error-path/opendrs/blob/main/skills/opendrs/SKILL.md) tells an agent to run
`opendrs score` before opening a PR and to split changes with a large blast radius.
