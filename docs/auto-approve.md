---
title: "Auto-approve low-risk pull requests safely"
description: "Auto-approve and auto-merge low-risk, AI-reviewed pull requests with a 0-1 risk score while risky ones wait for a human. Step-by-step GitHub Actions setup."
---

# Auto-approve low-risk pull requests

When AI writes and reviews most of the code, waiting for a person to approve every pull request
becomes the slowest step. Most PRs are low risk, and a few cause most incidents. This guide sets
up a gate that approves the low-risk ones on its own and sends everything else to a human:

> A PR whose risk score is below 0.3, that changes nothing on a blocked path, and whose AI review
> passed is approved and goes to the merge queue. Everything else waits for a reviewer.

The score comes from [opendrs](./), which measures each PR's [blast radius](blast-radius.html),
file history, author experience, size and tests.

## 1. Score every PR without approving anything

Add `.github/workflows/opendrs.yml`. It comments a risk report on each PR and sets a
`risk:green`, `risk:yellow` or `risk:red` label. It approves nothing yet.

{% raw %}
```yaml
name: opendrs
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review, labeled, unlabeled]
concurrency:
  group: opendrs-${{ github.event.pull_request.number }}
  cancel-in-progress: true
permissions:
  contents: read
  pull-requests: write
  checks: read
jobs:
  opendrs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0   # the score reads past commits and authors
      - uses: error-path/opendrs@v0
```
{% endraw %}

Leave it like this for two to four weeks and compare the scores with what reviewers found and what
was reverted.

## 2. Check the threshold against your own history

```sh
npx @error-path/opendrs backtest     # how well the default weights rank your past commits
npx @error-path/opendrs calibrate    # fit the weights to your repository
npx @error-path/opendrs backtest     # compare default and calibrated
```

The backtest reports what share of bug-introducing commits the score would have flagged at each
threshold. Commit the calibrated model through a normal reviewed PR. See
[Calibration and backtesting](calibration.html) for how to read the numbers.

## 3. Turn on the branch rules approval depends on

- **Settings > Actions > General:** allow GitHub Actions to create and approve pull requests.
- **Settings > General > Pull Requests:** allow auto-merge, if you will use it.
- **A ruleset on the default branch** that requires one approval and dismisses stale approvals on
  push. opendrs checks for it before every approval and does not approve without it, so a later
  push can never merge on an earlier approval.
- Require your tests, your AI review and the opendrs job as status checks.

## 4. Approve, but let people press merge

In `.opendrs.yml` on the default branch:

```yaml
autoApprove:
  enabled: true
  requireAiReview:
    checks: [{ name: "claude-review", app: "github-actions" }]   # your AI review's check run
  mergeMethod: none
  sampleRate: 0.2      # one in five eligible PRs still goes to a human
  maxChangedLines: 400
```

Pass a secret as the Action's `sample-salt` input, so nobody can predict which PRs get sampled. Any AI reviewer works if it publishes a check run that fails on a blocking
finding: Claude Code, CodeRabbit, Copilot or your own.

## 5. Merge automatically

Switch `mergeMethod` to `queue` (or `auto-merge`), give the workflow `contents: write`, and lower
`sampleRate`, but keep it above zero, so you keep measuring what the gate lets through. To roll
back, set `enabled: false` on the default branch. On the next run, opendrs withdraws its own
approvals.

### Merge only what the captain would wave through

To auto-merge only PRs that are green *and* a captain "quick confirm", keep `mergeMethod: none`
and let the workflow decide from the same run's outputs. Never from labels: anyone with triage
access can add a label.

{% raw %}
```yaml
      - uses: error-path/opendrs@v0
        id: opendrs
      - if: steps.opendrs.outputs.decision == 'auto-approve' && steps.opendrs.outputs.captain == 'quick'
        env: { GH_TOKEN: "${{ github.token }}", PR: "${{ github.event.pull_request.number }}" }
        run: gh pr merge "$PR" --auto --squash --repo "$GITHUB_REPOSITORY"
      - if: ${{ !cancelled() && !(steps.opendrs.outputs.decision == 'auto-approve' && steps.opendrs.outputs.captain == 'quick') }}
        env: { GH_TOKEN: "${{ github.token }}", PR: "${{ github.event.pull_request.number }}" }
        run: gh pr merge "$PR" --disable-auto --repo "$GITHUB_REPOSITORY" || true
```
{% endraw %}

The second step turns auto-merge off whenever a later push is no longer quick-confirm. Give the
job `contents: write` and allow auto-merge in the repository settings. opendrs's own repository
runs this setup in [`.github/workflows/opendrs.yml`](https://github.com/error-path/opendrs/blob/main/.github/workflows/opendrs.yml),
with a GitHub App token instead of `GITHUB_TOKEN`, so its merges also start workflows on `main`.

## What is never auto-approved

Whatever the score:

- changes to CI workflows, CODEOWNERS, migrations, Terraform, build and install scripts, and the
  opendrs config or model;
- binary files, submodule pointer changes, lockfiles and other ignored files;
- PRs that delete tests or add a line matching a `content.block` pattern;
- PRs whose counted size (after excluding inert docs/comment lines) still exceeds `maxChangedLines`;
  a changed agent-instruction file (`CLAUDE.md`, `.claude/**`, …) always counts in full toward it;
- PRs from forks, drafts, and PRs where a reviewer requested changes;
- PRs where a signal could not be computed and that unknown could have changed the tier.

The full rule order and every option are in the [GitHub Action guide](github-action.html).
