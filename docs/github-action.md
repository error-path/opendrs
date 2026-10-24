---
title: "GitHub Action: score, label and auto-approve pull requests"
description: "Set up the opendrs GitHub Action: comment a 0-1 risk score on every pull request, label it green, yellow or red, and auto-approve low-risk PRs into auto-merge or the merge queue. Inputs, outputs, permissions and branch rules."
---

# The opendrs GitHub Action

The Action scores each pull request, upserts one PR comment, sets a `risk:green`,
`risk:yellow` or `risk:red` label, writes the job summary, and sets the outputs `score`, `tier`
and `decision`. When you enable it, it also approves low-risk PRs and turns on auto-merge or adds
them to the merge queue.

## Minimal workflow (comment-only)

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
          fetch-depth: 0
      - uses: error-path/opendrs@v0
        id: opendrs
```
{% endraw %}

`fetch-depth: 0` is required. opendrs reads past commits (authors, earlier fixes and reverts),
computes the merge-base of the PR, and reads the config from the base commit. With a shallow clone
the job fails with "Base commit ... is not in the checkout".

The comment now leads with a **Review focus** summary (at most 3 bullets) and a collapsed
"Review brief for AI reviewers" section; the signal table, unknowns, policy reasons and LLM block
move into a collapsed "Score details" section. If you scrape the table, expand that section or use
the outputs instead; `brief: false` keeps the old layout exactly.

Keep the `concurrency` block. A push cancels the run still scoring the previous head, so an old
run cannot approve or merge a commit it did not score. The Action also re-reads the PR head before
approving, and passes the scored commit as `expectedHeadOid` when it enables auto-merge or
enqueues, so GitHub refuses to enable either if the head already moved. Neither stops a commit
pushed after the approval from merging on it; that needs the branch ruleset described in
[Required: dismiss stale approvals on push](#required-dismiss-stale-approvals-on-push).

Run it on `pull_request`, never on `pull_request_target`. A `pull_request_target` run uses the
base branch's workflow with a write token and the repository's secrets, even for fork PRs, and
opendrs checks out and reads the PR's code. opendrs scores on events that carry a
`pull_request` payload, and sweeps delayed PRs on `schedule` and `workflow_dispatch` (see
[Deferred review and landing delay](#deferred-review-and-landing-delay)); do not add
`merge_group` or `push` triggers to this workflow.

## Inputs and outputs

| Input | Default | Meaning |
|---|---|---|
| `github-token` | {% raw %}`${{ github.token }}`{% endraw %} | Token for the REST and GraphQL APIs. |
| `base-config` | `true` | Read `.opendrs.yml` and the model from the PR's base commit. Leave it on. When `false`, the `llm` section and the `model` path still come from the base commit, so a PR cannot send the LLM key to its own `llm.baseUrl` or export another secret through `llm.apiKeyEnv`. |
| `llm-api-key` | empty | Exported as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `llm.apiKeyEnv`. Used only when `llm.enabled`. |
| `comment` | `true` | Create or update the PR comment (found by the `<!-- opendrs -->` marker). A landing delay needs it: the comment records when the head commit became eligible. |
| `labels` | `true` | Set the risk label, and (when `captain.enabled`) one of `captain:careful`, `captain:standard` or `captain:quick`, and remove stale ones. opendrs creates its labels (`risk:*`, `captain:*`, `opendrs:landing`, `opendrs:hold`, `opendrs:review-after-merge`) with their own colours and descriptions, and recolours one GitHub auto-created in default grey; a colour you chose is kept. |
| `sample-salt` | empty | **Set it when auto-approval is on**, to a secret such as {% raw %}`${{ secrets.OPENDRS_SAMPLE_SALT }}`{% endraw %}. Without it, sampling is predictable: see [Set sample-salt](#set-sample-salt). The drift sample (`autoApprove.sampleRate`) is keyed by repository, PR number and this salt, so pushing another commit does not re-roll it. |
| `brief` | `true` | Build the review brief and fold it into the PR comment (a **Review focus** summary plus a collapsed "Review brief for AI reviewers" section), the `brief`/`brief-file` outputs, and the job summary. `false` restores today's comment layout byte for byte, leaves `brief`/`brief-file` empty, and omits the hidden state marker, the re-score line and the change notice: see [Re-scoring on new commits](#re-scoring-on-new-commits). |
| `notify-changes` | `true` | When a re-score changes the tier or the decision, post one short new comment pointing back at the updated report. `false` keeps the re-score line in the main comment but skips the extra comment. Needs `brief` and `comment` to both be true. |

| Output | Values |
|---|---|
| `score` | 0 to 1, four decimals |
| `tier` | `green`, `yellow`, `red` |
| `decision` | `auto-approve`, `deferred-review`, `waiting-ai-review`, `human-review` (the policy decision, even when approval is disabled or a landing delay is still running) |
| `captain` | `careful`, `standard` or `quick`: how much attention the captain brief says this PR needs. Empty when `captain.enabled` is false or `brief: false`. See [the captain brief](captain.md). |
| `brief` | The review brief as Markdown (empty when `brief: false`) |
| `brief-file` | Path to the review brief as JSON, under `$RUNNER_TEMP` (empty when `brief: false`) |

Use the outputs in later steps, for example to request a reviewer on red PRs:

{% raw %}
```yaml
      - if: steps.opendrs.outputs.tier == 'red'
        env:
          GH_TOKEN: ${{ github.token }}
          PR: ${{ github.event.pull_request.number }}
        run: gh pr edit "$PR" --add-reviewer my-org/oncall
```
{% endraw %}

## Permissions

| Permission | Needed for |
|---|---|
| `contents: read` | checkout |
| `pull-requests: write` | comment, labels, approve, dismiss |
| `checks: read` | reading which AI-review checks passed (`autoApprove.requireAiReview.checks`) |
| `contents: write` | enabling auto-merge or adding to the merge queue |
| `issues: write` | only if the `risk:*` labels do not exist yet and label creation fails with 403 |

When a call returns 403 the Action logs a `::warning::` with the cause and carries on; it fails
the job only on operational errors (scoring, git, invalid config, non-permission API errors).
Before it fails, it dismisses its own approval on the PR and disables auto-merge and the merge queue
entry, so an error never leaves an earlier approval in force.

## Repository settings for auto-approval

1. **Settings > Actions > General > Workflow permissions:** enable *Allow GitHub Actions to create
   and approve pull requests*. Without it the approval returns 403 and the Action logs a warning.
2. **Settings > General > Pull Requests:** enable *Allow auto-merge* if you use
   `mergeMethod: auto-merge`, or as the fallback for `queue`.
3. **A branch ruleset on the base branch that requires one approval and dismisses stale
   approvals (required).** See below. opendrs checks it before every approval and does not
   approve without it. opendrs's approval counts as the required approval.
4. **Recommended:** in the same ruleset, require the status checks you trust (tests, your AI
   review) and the opendrs job's check. opendrs cannot verify which checks you require, because
   a job's check name depends on your workflow.

If you require review from code owners, opendrs cannot satisfy it, because the bot is not a code
owner.

### Set sample-salt

`autoApprove.sampleRate` sends a share of the PRs that would be approved to a human anyway. Which
PRs is decided by a hash of the repository, the PR number and the `sample-salt` input. **With the
default empty salt, anyone can compute it**: for example, that `acme/app#107` is sampled and
`#108` is not, and so open a risky PR when the next number is one that will not be sampled. Store
a random secret and pass it:

{% raw %}
```yaml
      - uses: error-path/opendrs@v0
        with:
          sample-salt: ${{ secrets.OPENDRS_SAMPLE_SALT }}
```
{% endraw %}

While `autoApprove.enabled` is true, `sampleRate` is above 0 and no salt is set, every run logs the
warning "sampling is predictable; set sample-salt to a secret" and repeats it in the PR comment.

### Required: dismiss stale approvals on push

An approval belongs to a commit, but GitHub keeps it in force after a new push unless the branch
dismisses it. Without that, someone with write access can get commit A approved with auto-merge
on, push commit B, and cancel the opendrs run for B (or merge before it ends): B then merges on
A's approval. The `concurrency` block and the head check do not prevent this, because the run that
would withdraw the approval never finishes.

So before approving, opendrs reads the base branch's rules (`GET /repos/{owner}/{repo}/rules/branches/{branch}`)
and approves only when an active `pull_request` rule requires at least one approval and dismisses
stale approvals on push. Failing that, it accepts classic branch protection with the same two
settings (`GET /repos/{owner}/{repo}/branches/{branch}/protection`). Reading classic protection
needs *Administration: read*, which the default `GITHUB_TOKEN` does not have, so with the default
token only a ruleset can be verified. When neither confirms it, opendrs does not approve, logs a
`::warning::` naming the settings, and says so in the PR comment. A 403 or 404 counts as not
verified.

To set it up:

1. Open **Settings > Rules > Rulesets** and choose **New ruleset > New branch ruleset**.
2. Name it, for example `default branch`, and set **Enforcement status** to **Active**.
3. Under **Target branches**, choose **Add target > Include default branch** (or the branch your
   PRs merge into).
4. Leave **Bypass list** empty, or add only people you would trust to merge without review.
5. Enable **Require a pull request before merging**, and in its options:
   - set **Required approvals** to at least `1`;
   - enable **Dismiss stale pull request approvals when new commits are pushed**.
6. Recommended: enable **Require status checks to pass**, and add your test and AI-review checks
   and the opendrs job's check (named after the job, for example `opendrs`).
7. Click **Create**.

Then re-run the opendrs job or push a commit. The job log line `Not approving: could not confirm that ...`
means the ruleset is missing, inactive, does not target the base branch, or lacks one of the two
settings in step 5.

Events caused by `GITHUB_TOKEN` do not start new workflow runs. If the merge must trigger
workflows (for example a deploy on push to `main`), pass a GitHub App token as `github-token`.

## Merge queue

With `mergeMethod: queue` the Action calls `enqueuePullRequest` when the base branch has a merge
queue, and falls back to `enablePullRequestAutoMerge` (with a notice) when it does not.

To set up a queue: add a branch ruleset for the default branch with *Require merge queue*, and add
`merge_group` to the triggers of the workflows that run your required checks (your CI, not the
opendrs workflow). Give the opendrs job `contents: write`.

If enabling auto-merge or enqueueing fails (for example "Pull request is in clean status", or
auto-merge is not allowed), the approval stays and the Action logs a warning.

## What the Action will never approve

Approval needs all of these:

- `autoApprove.enabled: true` in `.opendrs.yml` **on the base commit**;
- the policy decision is `auto-approve` or `deferred-review`, and any landing delay has run
  (see [Deferred review and landing delay](#deferred-review-and-landing-delay));
- the PR does not add, change, delete or rename `.opendrs.yml`, `.opendrs/**`, `.github/**`,
  `action.yml`, `action.yaml`, `action/**`, or the configured model file. This guard is in code
  and no configuration turns it off;
- the PR is not from a fork;
- the base branch requires an approval and dismisses stale approvals on push (see
  [Required: dismiss stale approvals on push](#required-dismiss-stale-approvals-on-push)).

When any of these stop holding on a later push, the Action dismisses its own earlier approval and
also disables auto-merge and removes the PR from the merge queue. It identifies its approvals by
the `<!-- opendrs-approval -->` marker and the token's own user (`github-actions` and
`github-actions[bot]` count as the same account; when the token cannot read its own login, any bot
account with the marker counts), and never touches anyone else's review. Auto-merge is only
turned off when opendrs had an approval to withdraw, so auto-merge a person enabled stays on. A
PR that changes the opendrs config, the model or the workflows always needs a human.

### Author identity

The author email on a commit is whatever the PR author typed, so opendrs does not take it on
trust. The Action lists the PR's commits (`GET /pulls/{n}/commits`) and treats the head commit's
author as verified only when GitHub maps its email to the account that opened the PR. Otherwise,
and also when the clone is shallow, the author-expertise signals count as unknown, which usually
routes the PR to a human. Suggested reviewers leave out the emails GitHub has verified for the
PR's author, not the email the head commit claims.

## Pairing with an AI reviewer

opendrs measures risk; it does not review the code. The intended setup is: an AI reviewer checks
correctness, and opendrs decides whether a human must look too. Tell opendrs which check runs
mean "the AI review passed":

```yaml
# .opendrs.yml on the default branch
autoApprove:
  enabled: true
  requireAiReview:
    checks: [{ name: "claude-review", app: "github-actions" }]
```

If the AI review has not finished when opendrs runs, the decision is `waiting-ai-review`. The
simplest way to avoid that race is one workflow where opendrs runs after the review job, whose
check run is named after the job:

{% raw %}
```yaml
name: review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review, labeled, unlabeled]
concurrency:
  group: opendrs-${{ github.event.pull_request.number }}
  cancel-in-progress: true
permissions:
  contents: write
  pull-requests: write
  checks: read
jobs:
  claude-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      # Your AI review, for example anthropics/claude-code-action with a review prompt.
      # The job must FAIL when the review finds a blocking problem, so that a
      # successful "claude-review" check means the review passed.
      - run: ./scripts/ai-review.sh
  opendrs:
    needs: claude-review
    if: ${{ !cancelled() }}   # still comment when the review fails
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: error-path/opendrs@v0
```
{% endraw %}

A check that merely ran is not a passed review: make the review job fail when it finds a blocking
issue. opendrs counts a check when the latest check run with that exact name concluded `success`
on the PR's head commit; runs on earlier commits never count. It never counts its own job: the
names of the opendrs workflow run's unfinished jobs, the opendrs job among them, are left out, so
do not list the opendrs job's name, and run the review in an earlier job (`needs:`) as above.

Only check runs count. A check run belongs to one commit, so a new push starts without it. PR
labels are not supported: a label is not tied to a commit, stays on the PR across pushes, and
anyone with triage access can add one. `requireAiReview.labels` was removed in 0.1.1, and a config
that still lists it fails with an error; make your AI reviewer report a check run instead.

### Pin a check to the app that publishes it

A check is matched by name, and any workflow or GitHub App with `checks: write` can publish a check
run under any name. When your reviewer is a GitHub App, pin the check to it with `{ name, app }`,
where `app` is the app's slug (the `app.slug` of its check runs, as in `github.com/apps/<slug>`):

```yaml
autoApprove:
  requireAiReview:
    checks:
      - { name: "ai-review", app: "my-review-app" }   # published by your GitHub App
      - { name: "claude-review", app: "github-actions" }
      - security-review          # a plain name still matches a check from any app
```

A pinned check counts only when a check run with that name, from that app, concluded `success` on
the head commit; a same-named check from another app is ignored.

For a check produced by a GitHub Actions job (`app: github-actions`), the pin cannot tell one
workflow from another. A PR cannot add its own fake reviewer workflow: a PR that changes
`.github/**` is never auto-approved. The remaining risk is a job with the same name in another
workflow that already exists on the base branch, so give the reviewer job a name no other job uses,
such as `claude-review`, not `review` or `test`.

## Author self-check (advisory)

When the PR author (human or agent) followed [the self-check recipe](llm-reviewers.md#self-check-before-you-open-the-pr)
and left a `<!-- opendrs-self-check:v1 ... -->` block in the head commit's own message, opendrs
reads it from that exact commit, rebuilds the brief fresh as if the record did not exist, and adds
one line next to the captain line:

```
author agent self-checked: 4 facts addressed, 1 explained, 1 flagged as still needing a fix · not part of the review decision
```

No block on the head commit → no line (never shown as "0 addressed"). Because the record lives
inside the commit message, it is sha-pinned by construction: editing the diff or the record changes
the sha, and a later push that drops the block simply has no record on its new head. This is purely
advisory — it is never read by the gate or the captain's priority (`captain:*` label, auto-approve,
tier). A self-check entry claiming a fact was fixed when it is still present in the fresh brief
renders as "claimed fixed but still present" rather than counting as addressed. A `needs-fix` entry
still present in the fresh brief renders as "flagged as still needing a fix"; absent, it is dropped
silently, same as a stale `explained` entry.

## Deferred review and landing delay

Both are off by default; see the config reference for `autoApprove.deferredReview` and
`autoApprove.landingDelayMinutes` (and `sources.<kind>.landingDelayMinutes`).

**Deferred review** lands a PR whose score is just above green now and asks for a human review
after merge. The decision is `deferred-review`; the Action approves it like `auto-approve`, says
so in the approval, requests the suggested reviewers when they map to GitHub logins, and adds the
label `opendrs:review-after-merge`.

**Landing delay** holds the approval of an eligible PR for `landingDelayMinutes` after its head
commit became eligible, so a person can still veto it. While the delay runs the PR carries the
label `opendrs:landing`, the comment says when opendrs will approve, and the clock is kept in the
comment as `<!-- opendrs-eligible: <head sha> <time> -->`. Only opendrs's own comment counts, and
only for the current head: a push restarts the delay. To veto, do any of these before it ends:

- request changes (the decision becomes `human-review`);
- push a commit (the new head is scored and delayed again);
- add the label `opendrs:hold` (the PR stays on hold, and any earlier approval is withdrawn,
  until the label is removed).

Nothing runs when the delay ends unless something re-runs the Action, so add a scheduled sweep to
the same workflow. On `schedule` and `workflow_dispatch` events the Action lists the open PRs
labelled `opendrs:landing`, fetches `refs/pull/<n>/head` and the base branch for each into the
checkout and runs the same per-PR flow (score, comment, labels, approval). A PR that also carries
`opendrs:hold` is skipped, not re-scored every sweep; removing the label resumes it through the
`unlabeled` event. One PR's error is logged as `::error::` and the sweep goes on to the next; the
job fails at the end if any PR failed. The checkout must be the default branch with
`fetch-depth: 0`, so the base commit and the history are present:

{% raw %}
```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review, labeled, unlabeled]
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch:
concurrency:
  group: opendrs-${{ github.event.pull_request.number }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
jobs:
  opendrs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: error-path/opendrs@v0
```
{% endraw %}

The same `concurrency` block serves both: a sweep has no PR number, so sweeps share the group
`opendrs-`, and the next one queues behind a running one instead of cancelling it, so a long sweep
still finishes. The sweep needs the same permissions as a PR run, plus `contents: write` when it merges, and it
uses the sweep run's `github-token`, so it cannot run on fork PRs (which are never approved anyway).
On a sweep the `score`, `tier` and `decision` outputs are those of the last PR swept.

## Re-scoring on new commits

Every run that updates the comment also writes a hidden machine marker into it, for example
`<!-- opendrs-state: v1 head=<sha> first=<sha> firstRun=1 score=0.76 tier=yellow decision=human-review run=2 -->`,
recording this run's result. `first=` is the head of opendrs's first run on this PR and `firstRun=`
that run's number, which the [captain brief](captain.md)'s drift detector compares against: both
are written from a run's own head and number on the first run, and kept unchanged on every later
run, so the drift text keeps saying "since run `firstRun`" instead of resetting to "run 1" once a
later run writes the marker. They are optional only when reading, so a marker written by 0.3.x (no
`first=`) still parses, as does one written before `firstRun=` existed; either present but
malformed rejects the whole marker, the same as any other malformed field.

The next run reads that marker from opendrs's own comment (never from
another comment or the PR body, and never a forged or malformed one: anything that does not match
the fixed shape exactly counts as no marker, i.e. a first run) and, when one is found:

- adds one line under the heading: `` Re-scored for `<head7>` (run N) · was 0.76 yellow → now 0.46
  yellow ``, where `N` is the previous run's number plus one. A push restarts nothing here; even a
  re-run on the same commit still bumps `N` and shows the line.
- when the tier or the decision changed since that previous run, also posts one short **new**
  comment, with no table and nothing the PR controls, for example: "opendrs: risk changed yellow
  0.76 → green 0.28 · decision human-review → auto-approve · see the updated report ↑". It never
  carries the `<!-- opendrs -->` marker, so it is never mistaken for the main comment. Set
  `notify-changes: false` to keep the re-score line but skip this extra comment.

The first run on a PR has no previous marker, so it shows no re-score line and posts no notice; the
marker it writes starts `run=1`. Both the marker and the re-score line need the `brief` input:
`brief: false` keeps the comment byte-equal to today's output, with none of the three added.

## Rollout

1. **Comment-only (default).** Install the workflow with `autoApprove.enabled: false`. For two to
   four weeks, compare the scores with what reviewers actually found and with what was reverted.
2. **Measure.** Run `opendrs backtest`, then `opendrs calibrate` and `backtest` again. Pick
   thresholds from the capture rates (see [calibration.md](calibration.md)), and commit the model
   through a normal reviewed PR.
3. **Approve without merging.** Set `enabled: true`, `mergeMethod: none` and `sampleRate: 0.2`.
   Approvals now appear, people still press merge, and one in five eligible PRs still gets a human.
4. **Merge.** Switch to `mergeMethod: queue` (or `auto-merge`) and lower `sampleRate`, but keep it
   above zero so you keep measuring what the gate lets through.

To roll back, set `autoApprove.enabled: false` on the default branch. On the next run for each
open PR, opendrs dismisses its earlier approval.

## Fork pull requests

On `pull_request` events from forks, GitHub gives the job a read-only token. opendrs still scores
the PR and writes the job summary; the comment and labels fail with 403 and are logged as
warnings. Fork PRs are never approved, whatever the token can do. Do not switch to
`pull_request_target` to get a write token for forks.

## Troubleshooting

| Message | Fix |
|---|---|
| `Base commit ... is not in the checkout` | Set `fetch-depth: 0` on `actions/checkout`. |
| `GitHub refused the approval (403)` | Enable *Allow GitHub Actions to create and approve pull requests*, and grant `pull-requests: write`. |
| `Could not read check runs (403)` | Add `checks: read`. Until then, required AI-review checks count as missing. |
| `Could not write the PR comment (403)` | Add `pull-requests: write`. Expected on fork PRs. |
| `sampling is predictable; set sample-salt to a secret` | Pass a secret as `sample-salt`; see [Set sample-salt](#set-sample-salt). |
| `could not confirm that ... dismisses it when new commits are pushed` | Add the branch ruleset from [Required: dismiss stale approvals on push](#required-dismiss-stale-approvals-on-push). |
| `enabling auto-merge failed` | Enable *Allow auto-merge*, grant `contents: write`, or check the branch's merge queue. |
| `opendrs needs a pull_request event` | Run the workflow on `pull_request` (and `schedule` / `workflow_dispatch` for the sweep) only. |
| `approves at ... UTC unless ...` in the comment, but nothing happens then | Add the `schedule` trigger from [Deferred review and landing delay](#deferred-review-and-landing-delay); only the sweep re-runs the Action when the delay ends. |
| `sweep: N of M PR(s) failed` | Each failed PR has an `::error::PR #n:` line above it in the log; the other PRs were processed. |
