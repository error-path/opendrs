---
title: "Is AI reviewing AI just the author reviewing their own PR?"
description: "Why an AI code review of an AI-written pull request is not independent review, how it turns into a rubber stamp under review fatigue with AI slop PRs, what an AI reviewer is still good for, and where a deterministic risk score that needs no LLM adds a check the author cannot influence."
---

# Is AI reviewing AI just the author reviewing their own PR?

Last reviewed: 23 November 2026.

When a coding agent writes a pull request and an AI code review approves it, the same kind of
system wrote and checked the change. That is closer to self-review than to a second pair of
eyes. This page explains why, what AI review is still good for, and where
[opendrs](./), a risk score that needs no LLM, fits and does not fit.

## Why it can be a rubber stamp

- **Shared blind spots.** Author and reviewer are often models of the same family, reading the same
  diff with similar habits. A mistake one finds plausible, the other tends to find plausible too.
  This is an engineering judgment, not a measurement made for these docs.
- **Shared context.** The reviewer usually sees only the diff and the PR description, which the
  author wrote. If the description frames the change as safe, the review starts from that frame.
- **Review fatigue.** Agents open PRs faster than people can read them, so the human step shrinks
  to "the AI said it was fine". Too many AI slop PRs and the person at the end approves on trust.
  See [Reduce the code review bottleneck](ai-pr-review-bottleneck.md).
- **Approval looks like assurance.** A green AI review reads like a review. A branch rule that
  counts it satisfies "required reviews" on paper; see
  [why a bot approval does not count](bot-approval-required-reviews.md) for what GitHub does and
  does not accept.

## What AI review is still good for

This is not an argument that AI review is useless. A model reading a diff catches typos, missed
edge cases, inconsistent naming and obvious bugs, and it does so on every PR in minutes. That
shortens the human review and keeps defects out of the queue. The claim here is narrower: it does
not make the review independent, so it should not be the only thing that decides whether a person
looks at a PR. For tools that put an AI reviewer in the approval path, see
[Auto-approve alternatives](alternatives.md).

## What a deterministic risk score adds

opendrs gives each PR a 0-1 risk score from facts the author's text cannot change: the
[blast radius](blast-radius.md) in the import graph, the history of the touched files, author
experience, size and tests. It is a statistical model, not an LLM, so the same diff scores the
same way every time and a persuasive PR description does not move it. Each signal's contribution
is shown in the PR comment.

- **Risky PRs go to a person.** Only green PRs, with no blocked path and a passing AI review, can be
  auto-approved. Everything else waits for a human, with a [captain brief](captain.md) that says
  how much attention it needs. A random share of eligible PRs still goes to a human, so you can
  keep measuring what the gate lets through.
- **It still uses your AI review.** opendrs does not replace the reviewer. It decides which PRs
  the AI review alone may clear, and which need a person. See
  [Pairing with an AI reviewer](github-action.md#pairing-with-an-ai-reviewer).
- **An LLM can only add risk.** The optional [LLM judge](llm-judge.md) can raise the score and cannot
  lower it, so talking the judge into calling a diff safe changes nothing.

## What has been measured

From [Benchmark results](results.md):

- On the public ApacheJIT benchmark, calibrated opendrs reaches AUC 0.823, against 0.821 for a
  regression on the classic JIT metrics.
- Untuned, it ranked later-fixed commits better than chance in 17 of 18 open-source repositories.
- On its own repository, it scored 54 PRs and auto-approved 11 of them.

The labels come from reverts and bug-fix commits, not production incidents, and the 54 PRs are one
maintainer's sample: they show how the gate behaves, not how well the score predicts bugs.

## What opendrs does not do

- **It does not read the code for bugs.** The score estimates the chance of an incident. It is not
  a code review, so you still need tests and an AI reviewer.
- **It is not a human.** It routes risky PRs to one; it does not replace the judgment of a person
  on design and intent.
- **It does not see risk across services**, and with little history the default weights are not
  fit to your code. See [Known limitations](limitations.md).

To set up the gate, follow [Auto-approve low-risk pull requests](auto-approve.md).
