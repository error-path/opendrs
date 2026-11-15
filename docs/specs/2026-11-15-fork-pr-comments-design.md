# Fork PR comments: scoring a fork's pull request without its code

Status: **decided 2026-11-15**. User-facing description, the example workflow and the residual-risk
table are in `docs/github-action.md`, "Fork pull requests". This spec records the interfaces and
the reasons.

## 1. Problem

On a `pull_request` event from a fork the token is read-only, so the Action's comment and labels
fail with 403 and nobody sees the score. The two obvious fixes are unsafe:

- `pull_request_target` gives a write token and secrets to a run that would have to read the
  fork's code, is not held back by GitHub's first-time-contributor approval, and is blocked by
  default in public repositories from 2 December 2026.
- Relaying a result from the fork's `pull_request` run through `workflow_run` is forgeable: in that
  run the fork controls the workflow file, so every output and artifact is the fork's to write.

## 2. Design

A second, opt-in workflow triggered by `workflow_run` (`types: [completed]`) on the user's
`pull_request` workflow. It runs the default branch's workflow file. Two jobs, both running the
Action with the new `mode` input.

| | `score-only` | `fork-comment` |
|---|---|---|
| Token | `contents: read`, `pull-requests: read` | `pull-requests: write`, `issues: write` |
| Checkout | the base repository, `persist-credentials: false`, `fetch-depth: 0` | none |
| Reads | the PR's files and patches, and changed code files' blobs, through the REST API; history from the checkout | the score job's `result` output |
| Writes | the `result` output | its own marker comment, `risk:*` labels |
| GitHub calls it can make | `FORK_SCORE_CLIENT_METHODS` (five reads) | `FORK_COMMENT_CLIENT_METHODS` (list PRs, comment, label) |

Rules that hold in both modes:

1. **Nothing from the triggering run is trusted.** Only `workflow_run.event`, `head_sha`,
   `head_branch` and `head_repository` are read from the payload; GitHub writes them. The PR is
   found by listing the base repository's open PRs for `head=<owner>:<branch>` and accepting
   exactly one whose `head.sha`, `head.repo.full_name` and `base.repo.full_name` match
   (`findForkPullRequest`). No match, or more than one: stop without writing. Each job does this
   lookup itself.
2. **The fork's commits never enter the checkout.** No `git fetch` of the PR head, no checkout of
   it, nothing executed. `actions/checkout` v7 refuses fork PR refs under `workflow_run`; a manual
   fetch would only bypass that guard.
3. **The result is hostile input to the comment job.** `parseForkResult` accepts at most 4096
   bytes of JSON matching a closed schema (`src/report/fork-result.ts`): version, status, a full
   lower-case commit hash, a semver-shaped opendrs version, a score in [0, 1], a tier, a model
   kind, at most six signals whose ids are in `KNOWN_SIGNAL_IDS` with bounded numbers, and four
   bounded counts. Any other key at any level is rejected. The result carries no free text and no
   PR number or repository. A result whose `head` is not the run's `head_sha` is rejected.
4. **The comment is a fixed template** (`renderForkComment`) over the validated fields. Strings are
   additionally reduced to a small character set, capped and put in code spans, so the renderer is
   inert even for a field that skipped validation.
5. **No approval path.** `fork-comment.ts` and everything it imports exclude `approval.ts`,
   `run.ts`, `sweep.ts`, the engine and the gate, and the client object it receives has no
   approve, dismiss, auto-merge, merge-queue or GraphQL method. Tests assert all three.

The files endpoint lists the PR's current head, not a named commit, so after listing the score job
reads the PR again and stops if its head is no longer the run's commit.

## 3. Size limits

One place: `FORK_SCORE_LIMITS` in `src/action/fork-limits.ts`.

| Limit | Value | Over it |
|---|---|---|
| `maxChangedFiles` | 2000 (GitHub's files endpoint stops at 3000) | "too large to score" (`files`) |
| listed files ≠ the PR's `changed_files`, or an entry that is not a file | — | "too large to score" (`incomplete`) |
| `maxPatchBytes` | 20 MB | "too large to score" (`bytes`) |
| `maxCommits` | 1000 | "too large to score" (`commits`) |
| a git command over the base history times out | existing `history.gitTimeoutMs` and git timeouts | "too large to score" (`time`) |
| `maxHeadFiles`, `maxHeadFileBytes`, `maxHeadTotalBytes` | 50 files, 1 MB each, 8 MB in total | `complexity.touched` is unknown |

A too-large PR gets a comment that says so and no risk label. When any wanted head file cannot be
read, the head reader returns nothing for every file, so `complexity.touched` reports unknown
rather than a count that silently leaves files out.

A file with no `patch`, a patch that does not parse as exactly one file's hunks, a patch holding a
NUL or U+FFFD, or head contents that are not UTF-8 text is marked binary with no line counts, as
`loadDiff` marks a binary file.

## 4. Interface change: `ScoreOptions`

Additive. `scoreDiff` behaves exactly as before when none of these is passed; a test compares the
two paths' results byte for byte (`tests/engine-supplied-diff.test.ts`).

```ts
interface ScoreOptions {
  // ...
  /** A diff built outside git, used instead of `git diff base head`. `diff.base` must be a commit in repoDir; `diff.head` need not be. */
  diff?: DiffInfo;
  /** Reads a file at the head commit, used instead of `git cat-file`. Undefined for a file it cannot provide. */
  readHead?: (path: string) => Promise<string | undefined>;
  /** The PR's own commits, used instead of `git log base..head`. Empty: classify the source from `account` alone. */
  prCommits?: PrCommit[];
}
```

The signals, the model and the gate are unchanged: they already read only `ScoringContext`. The
alternatives were to rebuild the tail of `scoreDiff` in the Action (scoring logic in an adapter,
which the layering rule forbids) or a `DiffSource` interface through `loadDiff`, the blob reader
and the commit log (about twenty times the change, for one caller).

`score-only` passes `llm: null`, `authorVerified: false`, `prCommits: []` and no `brief`. Config
and model come from the PR's base commit.

## 5. What the fork comment does not show

The policy decision (auto-approve and so on does not apply to a fork), policy reasons, suggested
reviewers, signal summaries, the brief, and anything else written from the PR's own text.

## 6. Not done

- No `opendrs init` template: the workflow must pin opendrs to a release commit, and a release
  cannot contain its own commit hash.
- No support for a fork branch opened against two base branches at the same commit (two matches).
