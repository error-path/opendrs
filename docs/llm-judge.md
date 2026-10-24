---
title: "LLM judge: optional semantic risk signal and safe-hunk gate"
description: "How the optional opendrs LLM judge works: a prompted model returns an incident probability that can only raise the PR risk score, classifies every hunk into RADAR-style safe or risk categories, and can gate auto-approval. Configuration for Anthropic, OpenAI and OpenAI-compatible providers."
---

# LLM judge (optional)

This page explains what the optional LLM judge adds to the opendrs risk score, how to configure it, and how its hunk categories rank and gate pull requests, for anyone deciding whether to turn it on.

## How the judge enters the score

opendrs works without an LLM. With one, a prompted model reads the title and diff and returns a
probability of incident `p`; it enters the model as one more signal (`llm.semantic`, prior weight
0.8) with the value `max(0, logit(p) − logit(0.2))`. The judge can only add risk above a 0.2
baseline: an answer of 0.2 or less adds nothing, and no answer can lower the score. A diff that
someone talks the judge into calling safe therefore scores exactly as it would without an LLM.
The reply must contain exactly one JSON object. When the diff exceeds `maxDiffChars`, every file
first gets its first hunk and only then do larger files get more, and truncated files are marked.

## Configuration

```yaml
llm:
  enabled: true
  provider: anthropic        # reads ANTHROPIC_API_KEY
  model: claude-sonnet-5
  requireSafe: true          # optional: RADAR-style gate, see below
  minConfidence: 8
```

## Hunk categories: ranking and gate

The judge also classifies every hunk it sees, marked `[hunk N]` in the diff, into one category,
following Meta's RADAR reviewer. The safe categories are `refactor`, `dead_code`, `defensive`,
`logging`, `formatting`, `docs`, `imports`, `tests` and `static_resources`. The risk categories
are `logic_bug`, `security`, `performance`, `structural` and `complex`. Each verdict carries a 0-10
confidence. The categories are used twice:

- **Ranking.** Each risk category is a signal (`llm.risk.logic_bug` and so on, 0 or 1) with a
  positive weight. `calibrate` never lets an `llm.*` weight turn negative, so no answer lowers a score.
- **Gate.** With `requireSafe: true`, a PR is auto-approved only if the judge called every hunk
  it saw safe with at least `minConfidence`, classified all of them, and saw the whole diff (no
  truncation). Otherwise it goes to a human, and the comment names the hunks. Like RADAR, this is
  a necessary condition, never a sufficient one: every other rule still applies.

Whether the category is safe is decided by opendrs from the category name, not by the model.

## Providers

For OpenAI or any OpenAI-compatible server (Azure OpenAI, Ollama, vLLM), set `provider: openai`,
`model`, and `baseUrl`; the key is read from `OPENAI_API_KEY`, or from the variable named in
`apiKeyEnv`. In the Action, pass the key as the `llm-api-key` input. The diff is sent to the
provider you configure. If the call fails, the signal is `unknown`, and the PR cannot be
auto-approved on that run.

The same provider can also run the optional [verification pass](verification.md)
(`llm.verify.enabled: true`): a second, batched call that reads the review brief's facts, hunks
and checks with fresh context and keeps, drops or downgrades each one. Unlike the judge, it never
enters the score: it changes what the brief shows, never the gate or the captain priority.

The `llm.semantic` and `llm.risk.*` signals sit alongside the git-derived ones listed on
[Risk signals: what opendrs measures](signals.md). The other rules that apply before a PR is
auto-approved are on [Auto-approve low-risk pull requests](auto-approve.md), and the full
project is at the [README](https://github.com/error-path/opendrs).
