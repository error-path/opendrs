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

The score comes from [opendrs](./), a free, open-source risk scorer that runs in your CI and needs
no LLM (the AI review is a separate check you can require). It measures each PR's [blast radius](blast-radius.md),
file history, author experience, size and tests. Auto-approval is one of several ways to
[reduce the review bottleneck for AI-generated PRs](ai-pr-review-bottleneck.md); that page compares
them.

Meta runs the same kind of gate at scale. Its RADAR system has reviewed more than 535,000 diffs,
and auto-approved diffs had about a third of the revert rate and a fiftieth of the incident rate
of other diffs. Those numbers are observational, not from a controlled trial (Adams et al.,
[Automating Low-Risk Code Review at Meta](https://arxiv.org/abs/2605.30208), 2026). The
[policy](policy.md) page lists which of RADAR's rules opendrs follows.

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
[Calibration and backtesting](calibration.md) for how to read the numbers, and
[Benchmark results](results.md) for how the score did on 27 open-source repositories.

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
      - if: steps.opendrs.outputs.approved == 'true' && steps.opendrs.outputs.captain == 'quick'
        env: { GH_TOKEN: "${{ github.token }}", PR: "${{ github.event.pull_request.number }}" }
        run: gh pr merge "$PR" --auto --squash --repo "$GITHUB_REPOSITORY"
      - if: ${{ !cancelled() && !(steps.opendrs.outputs.approved == 'true' && steps.opendrs.outputs.captain == 'quick') }}
        env: { GH_TOKEN: "${{ github.token }}", PR: "${{ github.event.pull_request.number }}" }
        run: gh pr merge "$PR" --disable-auto --repo "$GITHUB_REPOSITORY" || true
```
{% endraw %}

Gate on `approved`, not on `decision`: `decision` is the policy verdict before the safety rails,
so a PR the self-modification guard refused still reads `auto-approve`. `approved` is new after
0.7.0; with 0.7.0 or older it is empty and the first step never merges. The second step turns
auto-merge off whenever a later push is no longer quick-confirm. Give the
job `contents: write` and allow auto-merge in the repository settings. opendrs's own repository
runs this setup in [`.github/workflows/opendrs.yml`](https://github.com/error-path/opendrs/blob/main/.github/workflows/opendrs.yml),
with a GitHub App token instead of `GITHUB_TOKEN`, so its merges also start workflows on `main`.

## What is never auto-approved

Whatever the score:

- changes to CI workflows, CODEOWNERS and OWNERS files, migrations, Terraform and other
  infrastructure files, build and install scripts, AI agent config that can run commands
  (`.claude/**`, `.mcp.json`, plugin manifests and hooks), and the opendrs config
  or model;
- binary files, submodule pointer changes, lockfiles and other ignored files;
- PRs with no changed files, which have nothing to review;
- PRs that delete tests or add a line matching a `content.block` pattern;
- PRs whose counted size (after excluding inert docs/comment lines) still exceeds `maxChangedLines`;
  a changed agent-instruction file (`CLAUDE.md`, `.claude/**`, …) always counts in full toward it;
- PRs from forks, drafts, and PRs where a reviewer requested changes;
- PRs where a signal could not be computed and that unknown could have changed the tier.

The full rule order and every option are in the [GitHub Action guide](github-action.md), and what
each rail guards against is in [Policy and safety rails](policy.md).

If the approval shows up but GitHub still says a review is required, or auto-merge never fires,
see [Why a bot approval does not count as a required review](bot-approval-required-reviews.md).

## Audit what the gate approved

A backtest tells you how the score did on past commits. Once the gate runs, check what it actually
let through, on a fixed schedule, for example monthly.

1. **List the PRs opendrs approved.** Every opendrs approval is a review whose body starts with
   `<!-- opendrs-approval -->`, and it stays on the PR after merge:

   ```sh
   gh pr list --state merged --limit 200 --json number,title,reviews --jq \
     '.[] | select(any(.reviews[]; .state == "APPROVED" and (.body | contains("opendrs-approval")))) | "\(.number) \(.title)"'
   ```

2. **Look for what went wrong after merge:** a revert of the PR, a fix to the same files soon
   after, or an incident traced to it. Record each one with
   `opendrs feedback --pr <number> --was-incident` (see
   [Recording incidents](calibration.md#recording-incidents-with-opendrs-feedback)). That labels
   the PR's commits as incident-linked for `calibrate` and `backtest`.
3. **Read the sampled PRs.** `sampleRate` sends a share of the PRs the gate would have approved to
   a person. What reviewers find there is what the gate passes unseen on the rest. Keep
   `sampleRate` above zero for this reason.
4. **Re-run `opendrs backtest`.** It leaves out the newest `history.labelHorizonDays` (60 by
   default), because their bugs may not be found yet, so it trails the live list above.
5. **Tighten or stop.** Lower `thresholds.green` or `maxChangedLines`, add paths to
   `paths.block`, tighten one source with `sources.<human|bot|agent>` (a `trackRecord` stops approvals
   for a source whose landed commits were reverted too often), or set
   `enabled: false`; opendrs then withdraws its approvals on the next run.

To export this record for an auditor, and for what it does not settle, see
[What auto-approval leaves for auditors](auto-approval-audit-evidence.md).

## Dependabot and Renovate PRs

With the default config, opendrs never auto-approves a typical dependency update. The lockfile is
in `paths.ignore`, the manifest (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`,
`requirements*.txt` and others) is in `paths.block`, an update to GitHub Actions changes
`.github/**`, and Renovate's own config files are blocked. A version bump brings in code that the
diff does not show, so opendrs's score cannot measure it. opendrs still scores and comments these
PRs and labels their source `bot`. When a coding agent adds a dependency, see
[Review pull requests where a coding agent adds a dependency](agent-added-dependencies.md).

To merge dependency updates without a person, use Renovate automerge, or GitHub's
[Dependabot recipe](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/automating-dependabot-with-github-actions)
with `dependabot/fetch-metadata`, which reports the semver `update-type`. To make the opendrs tier
one more condition, approve only when both agree, in the same job after the opendrs step:

{% raw %}
```yaml
      - uses: error-path/opendrs@v0
        id: opendrs
        with:
          sample-salt: ${{ secrets.OPENDRS_SAMPLE_SALT }}
      - if: github.event.pull_request.user.login == 'dependabot[bot]'
        id: metadata
        uses: dependabot/fetch-metadata@v2   # pin to a commit, as GitHub's example does
      - if: steps.metadata.outputs.update-type == 'version-update:semver-patch' && steps.opendrs.outputs.tier == 'green'
        env: { GH_TOKEN: "${{ github.token }}", PR_URL: "${{ github.event.pull_request.html_url }}" }
        run: gh pr review --approve "$PR_URL"
```
{% endraw %}

The `tier` output comes from the score alone, so blocked paths do not change it, and ignored files are left out of it. For
a version bump it reflects the manifest's history, the size and the author, not the new
dependency's code. Use `tier`, never the `risk:green` label, which anyone with triage access can
add.

Runs that Dependabot starts get a read-only `GITHUB_TOKEN` unless the workflow sets
`permissions:`, and see only Dependabot secrets
([GitHub](https://docs.github.com/en/code-security/dependabot/troubleshooting-dependabot/troubleshooting-dependabot-on-github-actions)).
The opendrs workflow above sets `permissions:`; add `OPENDRS_SAMPLE_SALT` (and an LLM key, if
you use one) as Dependabot secrets as well.
