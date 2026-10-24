---
title: "PR risk scoring and auto-approval tools compared"
description: "Tools that score pull request risk and auto-approve or auto-merge low-risk PRs, compared: opendrs, Cursor approval agents, PR-Agent, Merge Steward and more."
---

# PR risk scoring and auto-approval tools compared

Several tools now score how risky a pull request is, and some can approve the low-risk ones. They
differ in where the score comes from (an LLM reading the diff, or measurements from git history
and the dependency graph), whether they can approve and merge, and whether your code leaves your
CI. This page was written by the opendrs maintainers from each project's public documentation in
October 2026. If something here is out of date, please
[open an issue](https://github.com/error-path/opendrs/issues).

**In short:** of the tools below, opendrs, Cursor's approval agents, PR-Agent and Merge Steward can
approve low-risk pull requests, and opendrs and Merge Steward can also merge them. Of those,
opendrs is the one that runs entirely in your CI with no service or API key, and whose score you
can backtest against your own repository's history. To see
what it measures, read [what PR blast radius is](blast-radius.md); to set it up, see
[auto-approve low-risk pull requests](auto-approve.md).

| Tool | How it scores | Auto-approve or merge | Runs where |
|---|---|---|---|
| **opendrs** | Logistic model over git-history, dependency-graph, size and test signals, calibrated on your repository; optional LLM judge that can only raise the score | Yes: approves green PRs after your AI review passes, then auto-merge or merge queue | Your CI or machine; no service or API key needed |
| [Cursor approval agents](https://cursor.com/docs/approval-agents) | Policy rules, ownership and history signals, findings from Cursor's review agents, and LLM analysis | Approves low-risk PRs and routes the rest to reviewers; does not merge | Cursor's cloud; team and enterprise plans |
| [PR-Agent](https://github.com/qodo-ai/pr-agent) | An LLM reviews the PR and estimates review effort (1-5) | Optional: approves PRs below an effort threshold, or with no findings (`enable_auto_approval`) | GitHub App, Action or CLI; needs an LLM key |
| [MergeShield Risk Check](https://github.com/mergeshield/risk-check) | Claude reads the change and scores six dimensions, 0-100 | No: passes or fails a check against a threshold | Calls the MergeShield API; needs an account and API key |
| [Merge Steward](https://github.com/performer220/merge-steward-pr-review) | Gemini scores six dimensions 0-3, including blast radius | Yes: approves low-risk changes and can request auto-merge | GitHub Action; needs a Gemini API key |
| [Blast-Radius](https://github.com/bipu-biz/Blast-Radius) | Dependency graph from the TypeScript AST plus an AI summary | No: analysis for reviewers | Hosted web app |
| [CodeRabbit](https://www.coderabbit.ai/) | LLM review, plus a "Merge Risk" label and an "Estimated code review effort" on every PR; the method behind either is not published | No: labels and an effort estimate, not a gate | Hosted service; reads your code |
| [DRS-OSS](https://arxiv.org/abs/2511.21964) | Fine-tuned Llama 3.1 8B classifier over the diff and commit message | Flags risky diffs in CI | Self-hosted model service with a REST API |
| Meta's Diff Risk Score | Models trained on Meta's own incidents | Gates code at Meta | Internal to Meta; described in [papers](https://arxiv.org/abs/2410.06351), not released |

## Choosing

- **You want a gate that approves or merges low-risk PRs, and your code must stay in your CI:**
  opendrs. The score is measured on your own history (`opendrs backtest`), a PR cannot change the
  config it is judged by, and an LLM is optional.
- **You already use Cursor on a team plan:** its approval agents approve low-risk PRs inside
  Cursor's cloud. opendrs gives you a score you can backtest and keep in your own CI, and it can
  merge or queue what it approves.
- **You want an LLM's judgment of each PR as the gate:** PR-Agent, Merge Steward or MergeShield
  Risk Check. They read the change like a reviewer would. opendrs's optional LLM judge does the
  same, but it can only raise the score, so a diff that talks the model into "safe" gains nothing.
- **You want a picture of what a change touches:** Blast-Radius draws the dependency graph.
  `opendrs explain <file>` gives the same facts as text.
- **You want code review comments:** use an AI reviewer such as PR-Agent, CodeRabbit or Claude
  Code. opendrs is designed to run after one of them and can require that its check passed before
  it approves anything.
- **You've seen CodeRabbit's "Merge Risk" label and "Estimated code review effort":** they are
  useful, but CodeRabbit does not publish how either is computed. opendrs's score is calibrated on
  your own repository's history (`opendrs backtest`), every signal's contribution to it is shown in
  the comment, and the [captain brief](captain.md) names the actual facts behind a verdict — a
  new import edge, a broken contract, a file that usually changes with one this PR didn't — instead
  of a label alone. It is also open source, with no service to host or account to create.
- **You want the single highest accuracy number, and can host a model:** DRS-OSS reports AUC 0.895
  on ApacheJIT's official split; opendrs's calibrated model reports AUC 0.823 on the same benchmark
  (a different split; see [Calibration and backtesting](calibration.md)). That gap is the
  trade-off: DRS-OSS needs a fine-tuned Llama 3.1 8B classifier running behind a REST API you host
  and keep up; opendrs runs as a CLI, GitHub Action or MCP server with no model service to deploy.
