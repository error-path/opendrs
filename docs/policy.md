---
title: "Policy and safety rails: how opendrs decides"
description: "The ordered decision rules opendrs applies to every pull request, how it picks reviewers, and the safety rails that keep the GitHub Action from approving a PR it should not: hard blocks, binary and submodule checks, the self-modification guard, sampling, freeze windows, per-source policy, deferred review, landing delay and prompt-injection defenses."
---

# Policy and safety rails: how opendrs decides

The score is only one input: this page lists the rules the Action runs, in order, to turn a score
into `auto-approve`, `deferred-review`, `waiting-ai-review` or `human-review`, and the rails that
hold when it can approve.

## Decision rules

The decision rules run in this order; the first that matches wins:

1. a changed file matches `paths.block` → `human-review` (hard block);
2. a changed file is ignored (`paths.ignore`), binary, or a submodule pointer (gitlink), the PR
   deletes tests (`tests.deleted`), or an added line matches a `content.block` pattern →
   `human-review`;
3. more than `maxChangedLines` *counted* lines changed (docs, comment-only hunks and
   `autoApprove.sizeCapExempt` paths do not count by default; see
   [Configuration](configuration.md#inert-lines-and-the-size-cap)) → `human-review`;
4. tier is not green (unless `autoApprove.deferredReview` is on and the score is in its band),
   or an active freeze window suspends auto-approval or holds it to a
   stricter green, or the PR's source (human, bot or AI agent) has its own stricter green, has
   hit its daily cap, or lacks the required track record → `human-review`;
5. the [LLM judge](llm-judge.md) failed, or `llm.requireSafe` is on and the judge did not call
   every hunk safe with enough confidence, or the `unknown` [signals](signals.md), all at their
   worst at once, could have changed the tier → `human-review`;
6. the PR is a draft, or a reviewer's latest review requests changes → `human-review`;
7. a required AI-review check has not passed on the head commit → `waiting-ai-review`;
8. the PR is sampled for human review → `human-review`;
9. otherwise `auto-approve`, or `deferred-review` when the tier rule was waived for the deferred
   band.

## Suggested reviewers

The decision also suggests three reviewers: the most frequent recent authors of the changed files.
For a yellow or red PR, authors of earlier fixes and reverts in those files count extra. When the PR
needs a human, the Action requests a review from one of the top three, picked deterministically per
PR, rather than from a team: assigning a group invites the bystander effect (Rigby et al., TOSEM
2025), and the pick spreads the work across the experts.

## Safety rails

The rails that matter when the Action can approve PRs:

| Rail | What it does |
|---|---|
| **Config comes from the base branch.** | The Action reads `.opendrs.yml` and the calibrated model from the PR's base commit, so a PR cannot loosen its own gate. |
| **Hard blocks.** | `paths.block` (by default `.github/**`, `.opendrs.yml`, `.opendrs/**`, `CODEOWNERS`, migrations, Terraform, `.gitmodules`, `.gitattributes`, and files that execute code on install, build or CI; see [Configuration](configuration.md)) always sends the PR to a human. |
| **Binary files cannot pass as text.** | Git's own test only looks for a NUL in the first 8000 bytes and obeys `.gitattributes`, so opendrs also reads every changed file at the PR head and treats it as binary when it holds a NUL anywhere or is not valid UTF-8. With git 2.40 or later the diff reads attributes from the base commit (`--attr-source`), so the PR's own `.gitattributes` has no effect. Older git ignores only the global and system attribute files and still reads the ones in the checkout; the content check above still catches binaries there. |
| **Submodules.** | Moving a submodule pointer pulls in code the diff does not show, so any gitlink change goes to a human, whatever `diff.submodule`, `diff.ignoreSubmodules` or a submodule's `ignore` setting says. Repointing a submodule's URL changes `.gitmodules`, which is blocked. |
| **Self-modification guard.** | Independently of any config, the Action never approves a PR that adds, changes, deletes or renames `.opendrs.yml`, `.opendrs/**`, `.github/**`, `action.yml`, `action/**`, `.gitmodules` or any `.gitattributes`, or the configured model file. It also never approves PRs from forks. |
| **Sampling.** | `sampleRate` (default 10 %) of eligible PRs still go to a human, chosen deterministically from the head commit, so you keep measuring what the gate lets through. |
| **Unknown is not safe.** | A signal that cannot be computed is reported under "Unknowns" and blocks auto-approval when it could have changed the tier. A failed or unparseable LLM answer counts the same way. |
| **Withdrawn approvals.** | When a new push makes the PR ineligible, the Action dismisses its own earlier approval ("Risk increased: yellow 0.45"). A green PR held back by a freeze or a sample names that rule instead. |
| **Freeze windows.** | Meta gates more diffs on weekends and around peak events, when fewer people can respond to an incident. A `freezes` window (weekdays and/or dates in a timezone) suspends auto-approval, or with `green` holds it to a stricter threshold. Tiers and labels do not change. |
| **Per-source policy.** | Like RADAR, opendrs classifies each PR as written by a person, a bot account (Dependabot, Renovate) or an AI coding agent (Claude Code, GitHub Copilot's coding agent, Cursor, Codex, Devin, Jules, Aider, or your own `sources.agent.patterns`). It reads commit trailers, author emails and, in CI, the GitHub account type. The comment shows the source and why. `sources.<human\|bot\|agent>` can set a stricter `green`, `requireSafe` (the LLM gate for that source only), a `dailyCap` on that source's commits landed in the last 24 hours, and a `trackRecord` (by default: at least 10 landed commits in 60 days, at most 5 % of them reverted). These settings can only tighten the gate. Trailers are written by the PR author's tools, so a source must never earn a looser threshold than a person gets. |
| **Deferred review.** | RADAR lets some low-risk human diffs land first and be reviewed after. With `autoApprove.deferredReview` (`enabled`, `below`, `sources`, default `[human]`), a PR whose score is between `green` and `below` and that passes every other rule gets `deferred-review`: the Action approves it and lets it merge, requests a post-merge review from the suggested reviewers, and labels it `opendrs:review-after-merge`. Only the tier rule is waived, and only in that band. |
| **Landing delay.** | With `autoApprove.landingDelayMinutes` (or a longer `sources.<kind>.landingDelayMinutes`), an eligible PR waits that long, on the same head commit, before opendrs approves it. Meanwhile it carries the label `opendrs:landing`, and anyone can veto by requesting changes, pushing a commit (which restarts the clock) or adding `opendrs:hold`. A scheduled run of the Action re-checks waiting PRs; see the [GitHub Action guide](github-action.md#deferred-review-and-landing-delay). |
| **Content blocklist.** | `content.block` regexes are checked against every added line, like Meta's RADAR blocklisted code phrases. A match goes to a human, and the reason names `file:line`. |
| **Agent-instruction files always count.** | `paths.instructions` (by default `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.claude/**`, `.cursor/**`, `SKILL.md`, `*.prompt.md`, `prompts/**`, plus the already-blocked `.github/**`/`.opendrs/**`) is never excluded from the size cap, whatever its extension — additive only, with no `unblock`-style removal. |
| **Stale approvals are blocked by branch rules.** | The Action approves only if the base branch requires at least one approval and dismisses stale approvals on push. Without that rule, an approval for one commit could carry over to a later, riskier push. See the [GitHub Action guide](github-action.md#repository-settings-for-auto-approval) for the ruleset. |
| **Prompt injection.** | The diff, PR title and PR body are untrusted. The LLM prompt wraps them in delimiters and tells the model to ignore instructions inside them; the PR body is not sent at all unless `llm.includeDescription` is true. The answer must be exactly one JSON object and is clamped to [0, 1]. The judge can only raise the score, never lower it, so talking it into "risk 0" gains nothing. Risk claims written in the PR text never change the score directly. |
