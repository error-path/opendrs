# opendrs for Claude Code

opendrs gives a code change a calibrated 0-1 risk score and shows its blast radius, so low-risk,
AI-reviewed pull requests can be approved automatically while risky ones wait for a person. This
plugin lets Claude score a change before you open a pull request, explain why a file is risky,
suggest reviewers and build a review brief that says what to read first.

It adds:

- the `opendrs` skill, which tells Claude when and how to use opendrs;
- the `/opendrs-review` command, which reviews the current diff using the brief as a reading order;
- the `opendrs` MCP server, which exposes the same analysis as tools.

## Install

In Claude Code:

```
/plugin marketplace add error-path/opendrs
/plugin install opendrs@opendrs
```

## What it runs and what it sends

- **Runs:** `npx` downloads the pinned `@error-path/opendrs` package from npm and runs it on your
  machine, for the MCP server and for `/opendrs-review`.
- **Reads:** your repository's git history, diff and source files, plus `.opendrs.yml` and
  `.opendrs/` if present.
- **Sends:** nothing by default. There is no telemetry, and scoring needs no API key or account.
- **Optional LLM signals:** only if you turn on `llm` in `.opendrs.yml` and supply an API key, the
  diff is sent to the provider you configure (Anthropic or an OpenAI-compatible endpoint).

Full documentation: <https://github.com/error-path/opendrs>. Licensed under MIT.
