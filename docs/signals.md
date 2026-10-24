---
title: "Risk signals: what opendrs measures"
description: "Every signal in the opendrs PR risk score, mapped to the features of Meta's Diff Risk Score: size, diffusion, file history, critical paths, complexity, author expertise, tests, blast radius and the optional LLM judge, with how each one is computed from git."
---

# Risk signals: what opendrs measures

This page lists every signal that goes into the opendrs risk score and how each one is computed, for anyone who wants to read a PR comment's breakdown or tune the model.

## Meta's DRS features and their opendrs signals

Meta's baseline is a logistic regression over about a dozen features, chosen from about 100
([paper](https://arxiv.org/abs/2410.06351)). opendrs computes each one from git alone:

| Meta DRS feature | opendrs signal | How it is computed |
|---|---|---|
| Log of added/deleted lines relative to file size | `size.churn`, `size.relative` | `log1p` of changed lines, and of changed lines over base file length; lockfiles, generated and vendored files excluded |
| Diff creates new files only | `size.new_files_only` | 1 when every changed file is new |
| Comment-only change ("has no risk", §II-B) | `size.comment_only` | 1 when every added or deleted line is blank or a plain comment in the file's own syntax (not a lone `/*` or `*/`, not a directive such as `//go:embed` or `// @ts-nocheck`), with no renames or binary files |
| Log of number of files | `diffusion.files`, `diffusion.dirs` | `log1p` of changed files and of distinct top-level directories |
| Log of distinct authors of the changed files | `diffusion.authors` | `log1p` of distinct authors in the files' history |
| Previous SEV in the file | `history.incident`, `history.prior_fixes` | a recorded incident or revert touched the exact file (or an explicit `incidents.jsonl` `paths` prefix); `log1p` of fix and revert commits in the lookback window |
| High-criticality service | `paths.critical` | changed file matches `paths.critical` globs |
| Total logical complexity | `complexity.touched` | `log1p` of branch keywords in the touched files (language-agnostic heuristic) |
| Language indicators | `lang.*` | one indicator per language family present |
| Author created the file | `expertise.owner_ratio` | share of changed files the author created or mostly wrote |
| Author's landed diffs | `expertise.author_commits` | `log1p` of the author's prior commits; negative weight |
| Test plan | `tests.missing` | 1 when source changed and no test lines were added; otherwise `max(0, 1 − addedTestLines / (0.3 · sourceLines))` (a proxy). Deleted test lines never count |
| (not in Meta's list) | `tests.deleted` | 1 when a test file is deleted (or renamed out of `paths.tests`), or 10 or more test lines more are deleted than added. Also a policy rule: such a PR always goes to a human |
| LLM risk model (iDiffLlama) | `llm.semantic` | `max(0, logit(p) − logit(0.2))` from an optional prompted LLM judge: it can only raise risk |
| (RADAR's LLM reviewer) | `llm.risk.*` | 1 when the judge puts any hunk in that risk category (`logic_bug`, `security`, `performance`, `structural`, `complex`); weights are never negative |
| (not in Meta's list) | `blast.dependents`, `blast.public_surface` | transitive dependents of the changed files (depth 3) from the import graph; exported symbols changed in a file that has dependents |
| (not in Meta's list) | `history.churn` | `log1p` of commits touching the files in the lookback window |

## Import-graph languages

The import graph uses regex-based extractors for TypeScript/JavaScript, Python, Go, Java/Kotlin,
Rust and Ruby. Files in other languages get `unknown` blast-radius signals, which the policy
treats as risk, not as zero. How the blast-radius signals are measured is explained in
[What is the blast radius of a pull request?](blast-radius.md).

## LLM signals

The `llm.semantic` and `llm.risk.*` signals come from the optional LLM judge, which can only raise
a score, never lower it. How it is configured, how it classifies hunks and how it can gate
auto-approval are on [LLM judge](llm-judge.md).

The signals are combined by a logistic model whose weights `opendrs calibrate` fits to your
repository's history; see [Calibration and backtesting](calibration.md) and the
[README](https://github.com/error-path/opendrs).
