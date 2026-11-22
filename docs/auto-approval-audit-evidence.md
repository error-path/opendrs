---
title: "What auto-approval leaves for auditors"
description: "The record opendrs leaves on each pull request it scores or approves (comment, approval review with a marker, labels, job summary, outputs), how to export it with gh, and why it does not by itself make a team compliant with any control."
---

# What auto-approval leaves for auditors

When a bot approves a pull request, someone may later ask why. This page lists what
[opendrs](./) leaves behind for each PR, how to export it, and what it does not settle.

## What opendrs records per pull request

| Record | Where | What it holds | Lasts |
|---|---|---|---|
| PR comment | The PR's conversation, found by the `<!-- opendrs -->` marker | The 0-1 risk score, the tier, the decision, the signals that moved the score most with their contributions, and (by default) the review brief. | One comment, updated in place on each run. It shows the latest run, not every run. |
| Approval review | The PR's reviews | A review whose body starts with `<!-- opendrs-approval -->`, then "Approved by opendrs: risk score …" with the score and tier (or "for deferred review"). It is posted by the account behind the `github-token` input. | Stays on the PR after merge. opendrs withdraws its own approval when the PR stops qualifying, for example after `opendrs:hold` is added. |
| Labels | The PR | `risk:green`, `risk:yellow` or `risk:red`; `captain:*` when the captain brief is on; `opendrs:landing`, `opendrs:hold`, `opendrs:review-after-merge`. | Updated on each run; stale ones are removed. |
| Job summary | The workflow run | The same Markdown as the comment. | As long as GitHub keeps the run. |
| Outputs | The workflow run | `score`, `tier`, `decision`, `captain`, `brief`, `brief-file`. Later steps can store them. | Only what your workflow saves. |

The labels and the comment need the `labels` and `comment` inputs (both on by default). See
[GitHub Action reference](github-action.md) for the inputs and outputs, and
[Policy and safety rails](policy.md) for the rules behind each decision.

Your repository keeps more than opendrs does: the commits, the check runs, who merged, and the
branch rules that applied. opendrs does not copy those.

## Export the approvals

Every opendrs approval carries the `opendrs-approval` marker, so you can list them with the
GitHub CLI. This is the query from
[Audit what the gate approved](auto-approve.md#audit-what-the-gate-approved), with more fields:

```sh
gh pr list --state merged --limit 200 \
  --json number,title,author,mergedAt,mergedBy,labels,reviews --jq \
  '.[] | select(any(.reviews[]; .state == "APPROVED" and (.body | contains("opendrs-approval"))))
   | [.number, .title, .author.login, .mergedBy.login, .mergedAt,
      ([.labels[].name | select(startswith("risk:"))] | join(" ")),
      ([.reviews[] | select(.body | contains("opendrs-approval")) | .body | split("\n")[1]] | first)]
   | @tsv' > opendrs-approvals.tsv
```

Each row has the PR, its author, who merged it and when, the risk label, and the approval line with
the score. Raise `--limit` or add `--search "merged:>=2026-01-01"` to cover your audit period.

To keep the full comment, save it at the time: comments are edited in place, so a later run
replaces the text. A workflow step can write the `score`, `tier` and `decision` outputs, or the
`brief-file`, to an artifact or to your own store.

## What this does not settle

opendrs records what it decided and why. It does not decide whether that is enough for your
controls.

- A control may ask that changes are reviewed or approved by someone other than the author.
  Whether an automated approval meets such a control depends on your team's written policy and on
  your auditor. Ask them before you rely on it.
- opendrs does not make a team compliant with SOC 2 or any other framework. It is not legal or
  audit advice.
- Common ways teams fit an approval gate into a written policy: state which paths and change
  sizes may be approved without a person, keep `sampleRate` above zero so people still read a
  share of the PRs the gate would approve, and review the exported list on a schedule. The
  [audit steps](auto-approve.md#audit-what-the-gate-approved) describe that review.
- An approval only counts toward a required review if GitHub counts it. See
  [Why a bot approval does not count as a required review](bot-approval-required-reviews.md).

## Related

- [Auto-approve low-risk pull requests](auto-approve.md)
- [Policy and safety rails](policy.md)
- [Limitations](limitations.md)
