---
title: "Why a bot or GitHub Actions approval does not count as a required review"
description: "Why an approval from GitHub Actions, a GitHub App or a coding agent does not satisfy a required review or let auto-merge go ahead: the repository setting, self-approval, code owners, last-push approval, stale approvals, Dependabot's read-only token, and what to do about each."
---

# Why a bot approval does not count as a required review

You add a workflow step that approves pull requests, the approval shows up, and the PR still says
"Review required", or auto-merge never fires. GitHub checks who approved, what that account wrote,
and when, before it counts an approval. This page lists the causes, each with GitHub's own
documentation, and then how [opendrs](./) approves.

## The causes, in the order to check them

| Symptom | Cause | Fix |
|---|---|---|
| The approve call fails with 403 | The repository blocks workflows from approving PRs. Repositories in a personal account block it by default; repositories in an organization inherit the organization's setting ([GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)). | **Settings > Actions > General > Workflow permissions:** enable *Allow GitHub Actions to create and approve pull requests*. If it is greyed out, the setting is inherited from the organization (or enterprise); an owner there has to allow it first. Give the job `pull-requests: write`. |
| The approve call fails on a PR the same bot opened | "Pull request authors cannot approve their own pull requests" ([GitHub](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews)). A workflow that opens a PR with `GITHUB_TOKEN` and approves it with `GITHUB_TOKEN` is one account approving its own PR. The same holds for an agent's GitHub App approving a PR that app opened. | Approve with a different identity: a separate GitHub App token, or a person. |
| The approval shows, but the PR still needs a review | The approval came from GitHub Copilot. Its approvals are shown, but they "do not count toward those requirements" ([GitHub](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews)). | Have a person, or an approver that counts, approve. |
| "Review required from code owners" | With *Require review from Code Owners*, "any pull request that affects code with a code owner must be approved by that code owner" ([GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)). A bot that is not the code owner for those files does not satisfy it. | Keep code owner review for the paths that need a person, or drop the requirement on paths you want a bot to approve. |
| The approval counted, then a bot pushed a commit and it stopped counting | With *Require approval of the most recent reviewable push*, the last push must be approved by someone other than the person who pushed it ([GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)). An autofix or formatting bot that pushes and then approves is approving its own push. | Approve from a different identity than the one that pushes. |
| The approval disappeared after a push | With *Dismiss stale pull request approvals when new commits are pushed*, a push that changes the diff dismisses the approval, and the PR "cannot be merged until someone approves the work again" ([GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)). | Expected: run the approving workflow on every push (`synchronize`), so it decides again for the new commit. |
| The approve step fails only on Dependabot PRs | Workflows triggered by Dependabot get a read-only `GITHUB_TOKEN` by default, and only Dependabot secrets, not Actions secrets ([GitHub](https://docs.github.com/en/code-security/dependabot/troubleshooting-dependabot/troubleshooting-dependabot-on-github-actions)). | Set `permissions:` in the workflow, and add the secrets the job needs as Dependabot secrets. |
| Approved, checks green, auto-merge does nothing | Auto-merge must be allowed in the repository settings, and it merges "after all required reviews and status checks pass" ([GitHub](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/automatically-merging-a-pull-request)). It is also turned off when someone without write access pushes to the head branch, or the base branch changes. | Enable *Allow auto-merge*, check that every required check has reported on the head commit, and turn auto-merge on again after such a push. |
| The PR does not join the merge queue | "The built-in `GITHUB_TOKEN` cannot add pull requests to the queue" ([GitHub](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/automating-dependabot-with-github-actions)). | Use a GitHub App token or a personal access token with merge permission. |
| It merged, but nothing ran on `main` | Events caused by `GITHUB_TOKEN` do not start new workflow runs (the exceptions are `workflow_dispatch`, `repository_dispatch`, and `pull_request` runs that then wait for approval) ([GitHub](https://docs.github.com/en/actions/concepts/security/github_token)). | Merge with a GitHub App installation token or a personal access token. |

Approvals that count toward a required review come from accounts with write permission
([GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)).
GitHub's documentation does not say in one sentence whether a `github-actions[bot]` approval
counts; with the repository setting above turned on, opendrs relies on it counting.

## "Require review, but not for bots"

Branch protection and rulesets have no "required reviews apply to humans only" option. The
closest is the ruleset bypass list: it accepts GitHub Apps and Dependabot, and *For pull requests
only* lets an actor merge its own PR past the rules without pushing to the branch directly
([GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository)).
A bypass skips every rule in that ruleset, though, including required status checks, and it
applies to every PR that actor opens, whatever it changes. Approving from a separate identity
keeps the rules in force and lets you decide per PR.

## Which PRs a bot should approve

The mechanics above decide whether an approval counts. They do not decide whether a PR should be
approved without a person. That is a policy question: which paths, how large a change, which
authors, and what has to pass first.

opendrs answers it with a risk score and a fixed set of rails, then approves through the token you
give it:

- It approves as the account behind its `github-token` input: `github-actions[bot]` by default, or
  a GitHub App, as in opendrs's own [workflow](https://github.com/error-path/opendrs/blob/main/.github/workflows/opendrs.yml).
  A PR opened by that same account cannot be approved by it, as above.
- It does not approve unless the base branch requires an approval and dismisses stale approvals on
  push, so an approval never carries over to a later commit. See
  [Required: dismiss stale approvals on push](github-action.md#required-dismiss-stale-approvals-on-push).
- It cannot satisfy *Require review from Code Owners*, because the bot is not a code owner.
- It never approves PRs that change CI workflows, CODEOWNERS, its own config, lockfiles, package
  manifests, migrations or infrastructure files, PRs from forks, or drafts. The full list is in
  [What is never auto-approved](auto-approve.md#what-is-never-auto-approved).

To set it up, follow [Auto-approve low-risk pull requests](auto-approve.md). The settings it needs
are in [Repository settings for auto-approval](github-action.md#repository-settings-for-auto-approval).
