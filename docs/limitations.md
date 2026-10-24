---
title: "Known limitations"
description: "What opendrs cannot see or measure: unfit default weights, noisy incident labels, a regex-based import graph, line-counting test signals, a prompted LLM judge, name-matched required checks and a GitHub-only Action."
---

# Known limitations

opendrs estimates incident risk from git history and a diff, and these are the places where that
estimate is weaker than it looks, grouped by the model, the [signals](signals.md), the
[LLM judge](llm-judge.md) and the GitHub Action.

## The model and its labels

- **The default weights are not fit to your code.** They are priors chosen to rank obvious cases
  sensibly. Run `backtest` before trusting them, and `calibrate` when you have enough history.
- **Labels are proxies.** Reverts and SZZ-blamed fixes are noisy stand-ins for incidents: SZZ
  blames refactors and formatting, and many incidents are fixed by config changes or never touch
  git. `.opendrs/incidents.jsonl` improves this only as far as you keep it current.
- **Small repositories give unstable numbers.** With a few dozen positive commits, calibrated
  weights and capture rates swing widely between runs.

## What the signals miss

- **The import graph is regex-based.** It misses dynamic imports, reflection, dependency
  injection, code generation, and dependencies across services or repositories.
- **Complexity is a heuristic** that counts branch keywords; it does not parse code.
- **Test signals count lines, not assertions.** `tests.missing` and `tests.deleted` see only files
  matching `paths.tests`. A PR that weakens a test without shrinking it (an assertion edited into a
  no-op) is not flagged by them, and tests outside those globs are not seen at all. Splitting a test
  file into new ones counts as deleting a test file and goes to a human.

## The LLM judge

- **The LLM judge is prompted, not trained.** Meta's LLM variants were fine-tuned on Meta's own
  incidents; a general model reading a diff is a weaker signal, and it costs money per PR.

## What the score is not

- **The score is not a code review.** It estimates the chance of an incident, not whether the
  change is correct. Auto-approval still depends on your tests and your AI reviewer.

## The GitHub Action

- **Required checks are matched by name.** opendrs does not verify which app produced a check run,
  so protect the names you list (see the [GitHub Action guide](github-action.md)).
- **GitHub only.** The core is host-agnostic, but only a GitHub Action exists today. The Action
  needs full history (`fetch-depth: 0`). In a shallow clone, `diffusion.authors` and `history.*`
  are reported as `unknown` ("shallow clone: history incomplete"), keeping what they saw as a lower
  bound, so a missing history never reads as low risk.
- **The one-time history scan can be slow on a large or blobless clone.** A blobless clone's
  on-demand blob fetch, or a repo with a very long history, can make the single `git log` scan that
  `history.*`/`diffusion.authors`/`coupling.missing` depend on take minutes of wall-clock time rather
  than seconds, especially under host I/O contention. Raise `history.gitTimeoutMs` (default 600000,
  i.e. 10 minutes) or lower `history.maxCommits` if `brief`/`score` fails with a
  "git log timed out ..." error.
