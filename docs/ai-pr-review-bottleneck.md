---
title: "Reduce the code review bottleneck for AI-generated pull requests"
description: "Ways to cut the human review queue when AI writes and reviews most pull requests: smaller PRs, AI reviewers, rule-based auto-merge, risk-based auto-approval, CODEOWNERS and merge queues, and when each fits."
---

# Reduce the code review bottleneck for AI-generated pull requests

When coding agents write most of the pull requests, the number of PRs grows faster than the number
of people who can review them. The human review becomes the slowest step. There is no single fix.
Teams usually combine a few of the options below, and each one helps with a different part of the
queue. opendrs, the tool these docs are for, is one of them: it scores each PR's risk from git
history without an LLM and can approve the low-risk ones; it does not leave review comments.

## The options

### Make pull requests smaller

Small changes are faster and easier to review well. Google's code review guide says small changes
are reviewed more quickly and more thoroughly, hide fewer bugs and are easier to roll back, and it
suggests about 100 lines as usually reasonable
([Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html)).

**Fits when:** agents open large, mixed PRs. Ask the agent for one change per PR. This costs
nothing, but it does not lower the number of reviews; it raises it.

### Let an AI reviewer go first

An AI reviewer such as Claude Code, CodeRabbit, Copilot code review or PR-Agent comments on every
PR before a person looks. The author, often another agent, fixes what it finds.

**Fits when:** human reviewers spend their time on mistakes a model can catch. It makes each human
review shorter, but a person still reviews every PR. Some hosted reviewers can also approve what
their own review rates low risk; see [Auto-approve alternatives](alternatives.md).

### Merge dependency updates by rule

Renovate automerge, or Dependabot with GitHub auto-merge, merge dependency-update PRs once tests
pass, by update type (patch, minor, major).

**Fits when:** many of your automated PRs are dependency bumps. A rule is simple and easy to audit.
It does not help with PRs that change your own code.

### Approve by rule for other safe classes

A filtered [auto-approve-action](https://github.com/hmarr/auto-approve-action) step, a Mergify rule
or a gitStream rule approves PRs that match conditions you write, such as docs-only changes or a
given bot's PRs.

**Fits when:** you can say in a rule which PRs are safe. A rule approves anything that matches it,
however risky the change inside, so keep the conditions narrow.

### Triage by risk, and auto-approve the low-risk ones

A risk-scoring tool estimates each PR's risk from its content and history. Low-risk PRs are
approved without a person, and the rest wait for a reviewer. Some tools use an LLM reading the diff,
others measure git history and the dependency graph. opendrs is in the second group.

**Fits when:** your PRs are your own code, not only dependency bumps, and most of them are low
risk, but no simple rule says which. Check the score on your own history before you let it approve
anything.

### Route reviews with CODEOWNERS

A `CODEOWNERS` file requests a review from the owners of the changed code automatically, and branch
protection can require their approval
([GitHub docs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)).

**Fits when:** PRs wait because nobody knows who should review them. It sends each PR to the right
person, but it adds required reviews rather than removing them.

### Use a merge queue

A merge queue merges approved PRs into a busy branch one batch at a time and keeps the branch from
breaking ([GitHub docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)).

**Fits when:** approved PRs wait on rebases and CI before they can merge. It shortens the wait after
approval, not the review itself.

## Where opendrs fits

opendrs is the risk-triage option. It gives every PR a 0-1 risk score from its
[blast radius](blast-radius.md), file history, author experience, size and tests, with a statistical
model; no LLM is needed (an optional [LLM judge](llm-judge.md) can only raise it). When a PR is green, changes no blocked path and your AI review check has passed,
it approves the PR and can hand it to auto-merge or the merge queue. Everything else waits for a
person, with a [captain brief](captain.md) that says how much attention it needs. A random share of
eligible PRs still goes to a human, so you keep measuring what the gate lets through. Setup is in
[Auto-approve low-risk pull requests](auto-approve.md).

What has been measured, from [Benchmark results](results.md):

- On the public ApacheJIT benchmark, calibrated opendrs reaches AUC 0.823, against 0.821 for a
  regression on the classic JIT metrics.
- Untuned, it ranked later-fixed commits better than chance in 17 of 18 open-source repositories.
- On its own repository, it scored 54 PRs and auto-approved 11 of them. That is a small,
  single-maintainer sample: it shows how the gate behaves, not how well the score predicts bugs.

The labels in these runs come from reverts and bug-fix commits, not production incidents.

## Where opendrs does not fit

- **Dependency updates.** By default, opendrs never auto-approves a PR that changes a lockfile. Use Renovate or
  Dependabot automation for those.
- **Required code owner review.** opendrs's approval cannot satisfy it, because the bot is not a
  code owner.
- **Code not on GitHub.** Only a GitHub Action exists today.
- **Little history, or risk that lives across services.** The default weights are not fit to your
  code, and the import graph does not see dependencies across services or repositories.
- **Checking that a change is correct.** The score estimates the chance of an incident. It is not a
  code review, so you still need tests and an AI reviewer.

The full lists are in [Known limitations](limitations.md) and
[Auto-approve alternatives](alternatives.md#when-not-to-use-opendrs).
