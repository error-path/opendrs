---
title: "What is the blast radius of a pull request?"
description: "PR blast radius is how much can break if a change is wrong: how many files depend on it and which public symbols changed, scored 0-1 by opendrs."
---

# What is the blast radius of a pull request?

The blast radius of a pull request is how much can break if the change is wrong. A one-line fix in
a file that nothing imports has a small blast radius. The same line in a utility that 200 files
import, or in an exported function other services call, has a large one.

Blast radius alone does not make a change risky. A large, well-tested change by someone who knows
the code is often safer than a small, untested change to fragile code. So opendrs reports blast
radius as two signals and combines them with the others into one score.

## How opendrs measures it

`blast.dependents`
: How many files transitively import the changed files, up to three levels deep by default
  (`graph.maxDepth`). The graph is built at the PR's base commit, so a renamed or deleted file is
  found under its old path.

`blast.public_surface`
: Whether the PR adds, changes or removes an exported or public declaration, such as `export`,
  `pub`, `public`, a top-level Python `def`, a top-level Ruby `class`/`module`/`def`, or a Swift
  `public`/`open` declaration, in a file that has dependents. The evidence names the file and line.

The import graph covers TypeScript, JavaScript, Python, Go, Java, Kotlin, Rust and Ruby. For other
languages, and when the repository is larger than `graph.maxFiles`, the blast-radius signals are
reported as `unknown`. Unknown is treated as risk: it blocks auto-approval whenever it could have
changed the tier. Swift's public/open declarations are recognized (so the review brief can still
label them), but Swift has no import-graph extractor yet, so `blast.public_surface` and
`contract.api` still report `unknown`/never fire for Swift-only changes, since both also require a
dependents count from the graph.

The dependents count drives `blast.dependents` and `blast.public_surface` in the score above, and
it also shows up in the AI-facing review brief's hunk reasons. It reaches the
[captain brief](captain.md) only once: as the "imported by N files" evidence on a
`contract.api` fact, when a deleted public declaration has dependents. The captain brief does not
otherwise repeat a raw dependents count — that is editor trivia the captain can see in one click.

## The other signals in the score

| Signal | What it measures |
|---|---|
| `size.*` | Changed lines relative to file size, new-files-only and comment-only changes |
| `diffusion.*` | How many files, top-level folders and past authors the change spans |
| `history.*` | Past fixes, reverts and recorded incidents in the touched files and folders |
| `expertise.*` | How much the author has changed these files before |
| `complexity.touched` | Branching in the touched files |
| `tests.*` | Source changed without tests, or tests deleted |
| `paths.critical` | Files you mark as critical |
| `llm.semantic` | Optional LLM judge; it can only raise the score |

A logistic model turns the signals into a probability between 0 and 1. Each signal's contribution
is shown in the PR comment, so you can see why a PR scored what it did. The default weights are
priors; `opendrs calibrate` fits them to your repository's history. The full feature table and
its link to Meta's Diff Risk Score are in the
[signal reference](signals.md#metas-drs-features-and-their-opendrs-signals).

## Check a change's blast radius yourself

```sh
npx @error-path/opendrs score                # this branch against the default branch
npx @error-path/opendrs explain src/auth.ts  # one file's dependents, history and owners
```

Coding agents can call the same checks through the MCP server (`score_diff`,
`explain_file_risk`, `suggest_reviewers`) before they open a PR, and split a change whose blast
radius is large. To use the score as an approval gate, see
[Auto-approve low-risk pull requests](auto-approve.md).
