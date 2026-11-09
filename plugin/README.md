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
  machine, for the MCP server, for `/opendrs-review`, and for the CLI commands the skill tells Claude
  to run.
- **Reads:** your repository's git history, diff and source files, plus `.opendrs.yml` and
  `.opendrs/` if present.
- **Writes:** a cache of the import graph under `.opendrs/`.
- **Sends:** nothing by default. There is no telemetry, and scoring needs no API key or account.
- **Optional LLM signals:** these are controlled by `llm.enabled` in the `.opendrs.yml` of the
  repository being analysed, so a repository you cloned can turn them on. When they are on, the diff
  (and, with `llm.verify`, excerpts of related files) goes to the endpoint that file names, with the
  API key from the environment variable it names. Read `.opendrs.yml` before running opendrs in a
  repository you don't trust.

Full documentation: <https://github.com/error-path/opendrs>. Licensed under MIT.
