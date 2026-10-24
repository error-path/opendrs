---
title: "Verification pass: a second reader for the brief"
description: "How opendrs's optional llm.verify pass works: one batched LLM call that keeps, drops or downgrades each captain fact, review-first hunk and check in the review brief, tags items new or pre-existing, never touches the gate or the captain priority, fails open, and remembers dismissals in .opendrs/facts.jsonl via opendrs feedback --fact."
---

# Verification pass: a second reader for the brief

The review brief is written by deterministic detectors and rankers, which is what makes it
reproducible and injection-proof. It is also why some of its items are noise: a co-change partner
that never contained the changed identifier, a "no test changed" question on a manifest bump. The
verification pass (`llm.verify`, off by default) sends every item of the brief to a model with
fresh context, in one batched call, and asks it to keep, drop or downgrade each one. It changes
what the brief shows and how. It never changes the score, the tier, the policy decision or the
captain priority.

This is Phase 2 of the
[verification-pass spec](https://github.com/error-path/opendrs/blob/main/docs/specs/2026-10-20-verification-pass-design.md#3-phase-2--the-reviewer-side-verification-pass-llmverify);
Phase 1 is the author's [self-check](llm-reviewers.md#self-check-before-you-open-the-pr).

## What it verifies

Three pools, all in one call: the captain facts (`## For the captain`), the review-first hunks
(`## Review first`) and the checks (`## Check specifically`). Each candidate goes to the model with
its own small excerpt, the unified text of the hunk it rests on (at most 2,000 characters), never
the whole diff. A `coupling.missing` fact also carries the first 2,000 characters of its partner
file at base, since that is the only way to tell whether the partner has anything to update. The
judge's `risky_snippets` are not verified.

Candidates reuse the self-check ids (`contract.api:src/api.ts:42`, `hunk:src/session.ts:3`,
`check:src/session.ts:42:0`), so a self-check entry, a verifier verdict and a `feedback --fact`
dismissal all name the same thing. The model never sees the ids, only numbered blocks; a verdict
for a number that was not shown is ignored.

## The verdicts and their suffixes

Every surviving item gets exactly one suffix, appended after a space:

| Suffix | Meaning |
|---|---|
| `[verified · new]` | The model kept it; the change introduces what the item describes. |
| `[verified · pre-existing]` | Kept; the thing described was already in the file at base, this PR only touches it. |
| `[verified]` | Kept; new or pre-existing could not be decided. |
| `[downgraded by verifier: <reason>]` | The model would dismiss it; it stays visible, at lower priority. |
| `[downgraded: dismissed earlier as <verdict>]` | The dismissal memory (below) downgraded it; no model call was needed. |
| `[unverified]` | Nobody decided: the call failed, was skipped, or the model did not answer for it. |

A downgraded fact drops from `strong` to `info` and re-sorts. A downgraded hunk moves to the end
of its file's list and stops counting toward the file, so the file re-sorts too. A downgraded
check moves to the end of the checks. All three keep their text.

A dropped item never renders in its section, in the PR comment's five-fact cap, or in the short
"why". Instead the brief carries one note per drop, `dropped by verifier: <class> — <reason>
(<id>)`, and `brief.verification.verdicts` lists every candidate id with its final verdict,
dropped ones included. An audit trail, not a disappearance.

With `llm.verify.enabled: false` nothing changes: no suffixes, no notes, no `verification` field.

## Dropped classes

A drop is allowed only when the item's *only* subject is one of five named classes, `docs`,
`tests`, `fixtures`, `generated` or `formatting`, and the verdict cites a `file:line` from the
excerpt that shows it. opendrs re-labels any verdict that does not meet that bar before it is
applied: a `drop` without a named class or without a valid cited line becomes `downgrade`, and a
`downgrade` without a valid cited line becomes `keep`. So a model that returns `drop` for
everything with no evidence changes nothing. Anything else the model wants to dismiss is a
downgrade, still visible.

## NEW and PRE-EXISTING

`status` is decided deterministically first. Captain facts are `new` by construction; a
`coupling.missing` fact has no new/pre-existing axis and is `unknown`. A review-first hunk or a
check is `pre_existing` when every non-blank added line of its hunk already occurs verbatim in the
file at base (a moved or re-indented block), else `new`; a pure deletion or a new file is `new`.
The model fills in `status` only where that leaves `unknown`. Status and action are independent:
a pre-existing item can still be kept, it only changes who is blamed for it.

## What it never does

- **The gate.** `score`, `tier` and `policy` are computed before the brief exists and are
  byte-identical with the pass off, on, failing, or returning `drop` for everything.
- **The captain priority.** `captain.priority` is computed from the unverified facts, exactly as
  without the pass. The verifier changes what is shown and how, never `strong`/`info` as the
  priority sees them, so it can never turn careful into standard. (A detector downgrade, like the
  `coupling.missing` noise classes, *can* lower the priority; that is a detector fix and is meant
  to.) The captain "why" line and the PR comment's five facts come from the post-verification
  list; the priority does not.

## Fail open

Any error, in the provider, the reply's parse, the memory file or the token cap, leaves every
candidate `[unverified]` and adds one note: `verifier failed: <reason>; everything below is
unverified`. Nothing is dropped or downgraded on an error. Two cases skip the call on purpose,
with a note:

- `verifier skipped: quick-confirm PR with only info facts`, when the unverified priority is quick
  confirm, no fact is strong, and the review-first and checks pools are empty (depth follows risk);
- `verifier skipped: prompt of N tokens exceeds llm.verify.maxTokens (M)`, the per-PR cap below.

## Dismissal memory and `feedback --fact`

A wrong fact should not come back on the next push. The verifier's verdicts are not cached by
commit, but `.opendrs/facts.jsonl` remembers verdicts by *content*:

```
opendrs feedback --fact coupling.missing:src/session.ts --verdict wrong --note "config-only pairing"
```

appends one line, `{"hash":"…","id":"coupling.missing","file":"src/session.ts","verdict":"wrong",
"note":"…","at":"2026-10-22T10:00:00Z"}`, where `hash` is the first 16 hex of sha256 over the
detector id, the file and the fact text with every digit run replaced by `#` and whitespace
collapsed, so "14 of 17 commits" and "15 of 18 commits" are the same fact. `--fact` takes the
id shown by `opendrs brief --self-check-template`, scores the diff (`--base`, `--head` as for
`score`) to find it, and lists the available ids when it is not there. Verdicts:

- `wrong`, `intentional`, `ignored`: the fact is downgraded on every later run without a model
  call, `[downgraded: dismissed earlier as <verdict>]`.
- `useful`: the fact is pinned; a verifier `drop` or `downgrade` on it is turned into `keep`.

Like `.opendrs/incidents.jsonl`, the file is read from the **base** commit, so a PR cannot dismiss
its own facts; commit it on the base branch. It is a blocked path, so the PR that adds a line goes
to a human reviewer.

## Configuration

```yaml
llm:
  enabled: true              # the verifier uses the judge's provider, model and key
  verify:
    enabled: true            # default false
    maxTokens: 40000         # estimated prompt tokens (chars / 3.5) above which the call is skipped
```

The pass needs `llm.enabled: true`; it runs on the same provider as the [judge](llm-judge.md),
and `--no-llm` disables both. In the Action, the key comes from the `llm-api-key` input as for the
judge.

## Cost and the prompt hash

One call per PR, each candidate with a short excerpt: about $0.005–$0.01 per PR on Sonnet at low
effort, and never more than `maxTokens` of prompt. The brief's `verification` field records the
`model`, the token `usage`, and `promptHash`, the first 12 hex of sha256 over the system prompt
and the output schema, so a precision measurement can be tied to the exact prompt it was made with,
the way [`bench/apachejit/results-llm.md`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/results-llm.md)
does for the judge. The brief's notes carry the same
line: `verifier: <model> · prompt <hash> · <input>+<output> tokens`.
