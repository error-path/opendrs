---
title: "The captain brief: what the final human reviewer needs"
description: "How opendrs's captain brief works: the priority line (careful, standard, quick), the one named reviewer, the up-to-five architecture and history facts per fact id, the captain labels and Action output, the captain config block, and what each detector measures."
---

# The captain brief

A pull request now often goes through two AI review rounds before a human ever looks at it. By
then the local defects are gone. The **captain** — whoever does that final review, a role, not a
rank — is judging design and architecture decisions, usually with less context than before. The
captain brief is opendrs's answer to that one reviewer: a priority, one named reviewer, and up to
five deterministic facts the editor and the AI review rounds did not show.

## 1. Where the captain fits in a PR

A typical AI-assisted PR flow:

1. the author pushes AI-written code;
2. a reviewer triggers an AI review (Claude Code `/code-review`, CodeRabbit, Copilot) and it
   posts comments;
3. the author resolves them with AI;
4. steps 2 and 3 repeat once more;
5. one human does the final review.

opendrs's score, policy and AI-facing brief already serve steps 2 and 4. The captain brief serves
step 5: it tells the human who is left what to look at and how much attention the PR needs. It is
advisory. It never approves or blocks anything — the score, the gate and the AI brief stay exactly
as they are.

## 2. Priority: how much attention this PR needs

| Priority | When (first match wins) |
|---|---|
| **Careful review** | tier red; or tier yellow with at least one strong fact; or a hard policy rule fired (`paths.block`, `tests.deleted`, `content.block`); or a changed file matches `paths.critical` |
| **Standard review** | tier yellow; or tier green with at least one strong fact |
| **Quick confirm** | everything else: tier green, no strong fact, none of the rules above fired |

Only the rules in that table raise the priority. Other policy rules that already block
auto-approval — `unread-files`, `size-cap`, `source`, `draft`, `ai-review`, `unknowns` and the rest
— stay in "Needs a human" but do not raise priority on their own. `unread-files` in particular
fires on any PR that touches a built bundle (`action/dist` in this repository is one example), so
without this rule every such PR would read "careful review" for no reason beyond a file the editor
already flags as unread. A PR like that stays quick or standard unless something else about it —
a new import edge, a broken contract, a critical path — says otherwise.

## 3. The reviewer

In the Action, the captain line names the same GitHub login the Action already picked with
`assignReviewer` for the review request, so the line and the request always agree:
`**Captain: careful review** · @alice`. When no login is known, the line has no name. The captain
line never prints a raw email address — only a GitHub login, or nothing. Outside the Action (CLI,
MCP) there is no reviewer to name, so the field is absent.

## 4. The facts

Every fact names a file, and a line where one exists, and is `strong` or `info`. The PR comment
shows up to five, strong first; the AI brief lists every one. Paths, package and variable names are
escaped before rendering, so a file name with `` ` `` or `<` in it cannot break the comment.

### `layers.edge` — a new import between modules

A module imports another module it never imported before, as of this PR's head:

> `src/api` now imports `src/db` for the first time (`src/api/users.ts:3`).

By default a module is auto-detected from the repo's own package/workspace manifests: a pnpm/npm/
yarn package's directory (plus its `src/`/`lib/` subdirectory, one level deep), a Cargo crate, a Go
package (every directory), a Ruby gem's `.gemspec` directory, a Python `pyproject.toml`/`setup.cfg`
package (`src/` layout included), or a Swift `Package.swift` target. A language or layout none of
these recognise falls back to the first `captain.moduleDepth` path segments (default 2). Two
structural limits are expected, not bugs: a Ruby gem whose actions all live directly under
`lib/<gem>/` is still one module (fastlane's shape — see `captain.modules` below for an escape
hatch), and a flat Python package with no subdirectories under `src/<pkg>/` has no finer boundary to
find. The layers detector's notes say how the module map for this run was built, e.g. "modules:
auto-detected 12 packages from package.json" or "modules: no Cargo.toml found; falling back to
moduleDepth: 2".

Auto-detection can be overridden two ways: `captain.modules` (literal globs, e.g. one per package's
source tree) always wins first; setting `captain.moduleDepth` explicitly disables auto-detection for
the whole repo and goes back to the flat depth everywhere, same as before this feature existed.

### `layers.cycle` — a new import cycle

Two or more modules that were not mutually reachable at the PR's base are, at head:

> New import cycle: `src/api` → `src/db` → `src/api`.

### `contract.dependency` — a new package

A name added to a manifest's runtime dependencies (strong) or development dependencies (info); a
version bump on an existing name is not a fact:

> New runtime dependency `jsonwebtoken` (`package.json:31`).

### `contract.api` — a changed public contract

A deleted line that reads as a public declaration, in a file that other files depend on. One fact
per file, with a count — a mass refactor that deletes hundreds of declarations in one file is one
fact, not hundreds, the way `change.safety_removed` already counts (`docs/experiments.md`,
"contract.api": one PR alone fired 2,628 facts under the old per-declaration behaviour):

> Removes or changes 3 exported declarations in `src/auth/token.ts` (`parseToken`, `verify`,
> `refresh`), imported by 6 files.

### `contract.schema` — a schema or contract file changed

A changed path matching the schema/contract globs (migrations, `.sql`, `.proto`, `.graphql`,
OpenAPI/Swagger specs, and anything added under `captain.contracts.paths`):

> Changes schema or contract file `db/migrations/0042_add_users_email_index.sql`.

### `contract.env` — a new environment variable

An added line that reads an environment variable whose name does not appear anywhere in the tree
at the PR's base. One fact per file, with a count, and never on a generated file (`*.lock.yml`
and the like): a generated workflow lock file that introduces ten variables at once is one fact,
not ten (`docs/experiments.md`, "contract.env": 10 of 14 run-1 fires were one generated file):

> Reads 2 new environment variables (`JWT_SECRET`, `JWT_ISSUER`) (`src/auth/token.ts:12`).

### `contract.instructions` — a changed agent-instruction file

A changed file matched by `paths.instructions` (strong): `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`,
anything under `.claude/**`/`.cursor/**`, a `SKILL.md`, a `*.prompt.md`, anything under
`prompts/**`, or the already-blocked `.github/**`/`.opendrs/**`. Up to three files, the rest
counted in a note. These files steer what an AI agent or CI does next, so a captain always sees
the change even though it is plain Markdown:

> Changes agent instructions: `CLAUDE.md`.

### `change.concurrency` — a changed line uses a concurrency primitive

A changed, non-comment line of non-test code uses a concurrency primitive (locks, atomics,
executors, thread/goroutine primitives, and the obvious TS/JS and Swift equivalents). One fact per
file, at the file's first matching line:

> Changes concurrency code: `synchronized` (`src/x/Cache.java:42`).

### `change.safety_removed` — error-handling or guard lines were deleted

Net deleted error-handling or guard lines (`catch`/`except`/`rescue`, `throw`/`raise`, `assert`,
null/`None` checks, `checkArgument`-style preconditions), counted per hunk so a line only reworded
in the same hunk does not count. One fact for the whole PR, at the first deleted line:

> Removes 3 error-handling or guard lines (`src/x.ts:10`).

### `coupling.missing` — a file that usually changes together, didn't

Two files that changed together often enough in the project's history, where this PR changed only
one of them:

> `session.ts` changed with `auth.ts` in 14 of 17 commits (last 365 days); this PR changes only
> `auth.ts`.

**Demoted 2026-10-23** (`docs/experiments.md`, "coupling.missing"): the outcome-labels study
measured this fact against real review comments and later fixes on 1,010 merged PRs and found 0 of
45 fires drew a reviewer's attention and the fix rate on the file was no higher than the PR's other
files (0.92×) — every fire was on a CI workflow, a manifest or a test, the same noise the
hand-graded field test found at 18-of-18 (spec §3.8) two orders of magnitude earlier. Two changes
follow from that result:

- The fact is now always `info`, never `strong`: it can no longer by itself raise a PR to
  "careful review" or "standard review" (§2).
- It never fires at all when the file this PR actually changed (as opposed to its missing
  partner) is a **CI workflow** (`.github/workflows/**`), a **manifest** (`package.json`,
  `Cargo.toml`, `go.mod` and the other kinds `contract.dependency` parses), or a **test**
  (`paths.tests`) — narrower than the field test's original three classes, which only downgraded
  a changed-test-without-its-source case and left CI workflows and manifests unaddressed. A
  **retired file** (the firing file is deleted in this PR) still never fires at all, since a file
  going away has no partner left to update. When neither exclusion applies but every hunk of the
  firing file removes lines and no identifier from those lines occurs in the partner's base text,
  the text notes it (`mention nothing `<partner>` contains`) without changing the weight, since
  every fire is `info` regardless now.

It still appears in the full AI-facing brief (`captain.facts` lists every fact, §5) and still
counts toward the PR comment's five slots when room is left after `strong` facts, but it can no
longer take a slot away from them the way a `strong` fact could, and it never pushes the priority
past what the other facts and the tier already say.

### `drift.scope` — what the PR grew into after opendrs first scored it

Runs in the Action only. Compares the files and churn opendrs saw on its first run against the
current head, and flags growth that landed outside the modules the PR originally touched:

> Since opendrs first scored this PR at `abc1234` (run 1), it grew from 3 to 9 files
> (+40 → +310 lines); 4 new files are outside the original modules: `src/billing/invoice.ts`.

## 5. In the PR comment

```
**Captain: careful review** · @alice · why: new `src/api` → `src/db` import; `session.ts` usually changes with `auth.ts`
**For the captain**
- `src/api` now imports `src/db` for the first time (`src/api/users.ts:3`)
- `session.ts` changed with `auth.ts` in 14 of 17 commits; this PR changes only `auth.ts`
- New runtime dependency `jsonwebtoken` (`package.json:31`)
- Since opendrs first scored this PR at `abc1234` (run 1), 3 → 9 files; 4 outside the original modules
- +1 more in the brief below
```

A quick confirm with no facts is one line and no block: `**Captain: quick confirm** · @bob`. The
"why" after the priority is the first two facts, shortened to their first clause. The full list of
facts (not capped at five) is also in the "For the captain" section of the brief for AI reviewers,
and in the `captain` Action output described below.

With the [verification pass](verification.md) on, each fact in the comment and in the brief ends
with its verdict (`[verified · new]`, `[verified · pre-existing]`, `[downgraded by verifier: …]`,
`[unverified]`), a dropped fact becomes a `dropped by verifier` note in the brief, and the "why"
and the five facts come from the verified list. The priority does not: it is computed before the
pass runs and never changed by it.

## 6. Labels and the Action output

The Action sets one of `captain:careful`, `captain:standard` or `captain:quick` on the PR, the same
way it sets the `risk:*` labels, and removes the stale one on a rerun. A captain can filter the PR
list by that label instead of opening every PR to find the ones that need care. The Action also
sets a `captain` output (`careful`, `standard`, `quick`, or empty when `captain.enabled` is false or
the `brief` input is false), and the job summary carries the same line and block as the comment.

## 7. Configuration

```yaml
captain:
  enabled: true          # false: no captain line, block, labels, output or brief section
  # moduleDepth: 2        # unset by default (auto-detection on); set to disable it and use a flat depth everywhere
  modules: []             # literal globs overriding auto-detection, e.g. one per package's source tree
  coupling:
    enabled: true         # defaults set by the ApacheJIT experiment — see below
    minSupport: 8
    minConfidence: 0.6
  contracts:
    paths: []              # extra schema/contract globs, added to the defaults
```

As with the rest of `.opendrs.yml`, this is read from the base commit, so a PR cannot switch its
own captain brief off. See the [configuration reference](configuration.md) for the full file.

## 8. What is measured, and what is not

- **Coupling** (`coupling.missing`) has a pre-registered experiment on ApacheJIT behind it: whether
  the fact lifts the buggy rate over the base rate, and whether it adds to the calibrated score.
  On the held-out test split (24,686 commits, 2017–2019) the fact fired on 1,800 commits, and
  45.5 % of them were bug-inducing against a 23.6 % base rate: a lift of 1.9×. Adding it to the
  score did not raise AUC (0.823 with and without), so it stays a captain fact and is not a
  score signal. The defaults (`minSupport: 8`, `minConfidence: 0.6`) were tuned on the training
  split only. That ApacheJIT lift measures whether the file *was buggy*, not whether a reviewer
  would have cared; measured against real review comments and fixes instead (the outcome-labels
  study, §4 above), it did not clear its own bar and was demoted to `info`-only with a narrower
  trigger, as recorded there. Details: [Experiments](experiments.md).
- **Contracts and change risk** (`contract.dependency`, `contract.api`, `contract.schema`,
  `change.concurrency`, `change.safety_removed`) cleared the same pre-registered bug-lift bar
  (≥ 1.2×, ≥ 50 firing test commits) on ApacheJIT's test split (24,690 commits, pooled):
  `contract.dependency` 1.47×, `contract.api` 1.72× (approximated: its dependents come from a
  single-snapshot `git grep` of imports, not the real per-commit graph), `contract.schema` 2.39×,
  `change.concurrency` 2.04× (firing on 13 % of test commits), and `change.safety_removed` 1.79×
  (firing on 21 % of test commits — too common to weight `strong` without pushing most PRs to
  "careful review", hence `info`). The docs may say these predict bugs; the facts still ship
  regardless of the number, as decisions a captain signs off on either way. Details:
  [Experiments](experiments.md#captain-fact-lift-on-apachejit).
- **Layers** (`layers.edge`, `layers.cycle`) is not shown to predict bugs: `layers.edge` lifted
  only 1.12× on a 2,000-commit sample (19 firings), short of the bar. It still ships — a new import
  edge is a decision a captain signs off on, not a claim that it causes incidents.
- **Drift** (`drift.scope`) is not measured against ApacheJIT: that benchmark has no PR rounds to
  measure drift across. It is validated by tests and by dogfooding opendrs's own PRs.

## What the captain line never does

- It never approves or blocks a PR. That stays the score and the policy decision.
- It never estimates review time ("~20 min"). There is no data to calibrate minutes against.
- It never prints a raw email address — only a GitHub login, when one is known.
