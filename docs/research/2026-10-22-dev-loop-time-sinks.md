---
title: "Where the dev loop's time goes"
description: "A measured audit of check/test/eval wall time across one working session on opendrs: the git-spawn test fixture, full-suite skill evals, and the npm run check inner loop, with the fix and the numbers for each."
date: 2026-10-22
---

# Where the dev loop's time goes

Audit, 2026-10-22, of one multi-day orchestrator session working on opendrs (session
`18b8f218-05d4-4be2-89e8-17172b9c7173`, 2026-10-19 to 2026-10-22). Sources: the orchestrator's own
transcript (every `Bash` tool call and background-agent notification, timed from its own
timestamps — the transcript has no `duration_ms` field, so start/end come from the matching
`tool_use`/`tool_result` and `task-notification` events), 37 `evals/results/*/aggregate-result.json`
files across the session's worktrees, `~/.cache/opendrs/orchestrator/ledger.md`, and one
`npx vitest run --reporter=json` measurement of the full suite before and after the fix below.

## Ranked time sinks

| # | Activity | Count | Total wall time | Typical | Main cause |
|---|---|---:|---:|---:|---|
| 1 | Full vitest suite (`npm test`/`check`) | 1 measured run (93 files, 1578 tests) | 314.8s wall / 3092.6s summed per-file | — | `tests/helpers/repo.ts`'s `makeRepo()`: a real `git init` + 5 `git config` spawns per repo, called from 44 test files (most of the suite) |
| 2 | Full-suite `claude plugin eval` runs | 5 runs (11 cases each) | 3811s (63.5 min), $18.17 | 762s / $3.63 | Each judges 11 cases × 3-5 runs with an LLM; one full-suite run per task is the budgeted ceiling (worker rule 10) |
| 3 | Direct `npm run check` (orchestrator's own Bash calls, blocking) | 8 | 1061.3s (17.7 min) | 132.7s | Runs `typecheck` + the whole suite serially in the main loop, not backgrounded |
| 4 | The `~/.docker` move-aside trick for `claude plugin eval` | 1 | 600.6s (10 min) | — | Worked around a sandbox Docker-credential check by moving `~/.docker` aside; recreated mid-run by Docker Desktop once, corrupting the config. **Forbidden outright from 2026-10-22** (worker-rules #12) — not re-attempted here |
| 5 | Targeted `claude plugin eval` + direct `vitest`/`git` calls | 32 eval runs + 7 vitest + 75 git | $15.96 / 4069s eval; 309.7s vitest; 200.7s git | small each | Normal iteration cost; no single large outlier once the full-suite runs and the Docker incident are set aside |

Background agents/subagents add up to 12.7 hours of (overlapping, parallel) wall time across 60
matched launches, topped by `Fable: full-suite eval to approved state` (51.3 min), two field tests
on third-party repos (vapor 44.7 min, fastlane 38.6 min), and several multi-task branches
(30-32 min each). That time is mostly legitimate background work, not loop waste — the orchestrator
doesn't block on it — so it's not treated as a "fix" target here, unlike #1-#4.

## Fix: `tests/helpers/repo.ts`'s git-spawn fixture (root cause of #1)

`makeRepo()` is the test suite's shared real-git-repository fixture, used directly or indirectly by
44 of 93 test files. Before this change, creating one repo spawned 6 `git` child processes (`init`
plus 5 `config` calls for `user.name`, `user.email`, `commit.gpgsign`, `gc.auto`,
`maintenance.auto`), on top of 3 more per commit (`add`, `commit`, `rev-parse`). Every `commit()`
call already sets `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_NAME`/`GIT_COMMITTER_EMAIL`
via its own `env`, so the persisted `user.name`/`user.email` config was redundant for every test
*except* the handful that bypass `commit()` and call `repo.git("commit", …)` directly
(`tests/git/diff.test.ts`).

The fix moves all 5 settings into `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n`
environment variables (supported since git 2.31), applied ambiently via the same `env` merge the
helper already does for every spawn — identical effective git configuration, zero behavioural
change, and 5 fewer process spawns per repo (6 → 1). It does not touch the per-commit `add`/
`commit`/`rev-parse` spawns, which stayed as `execFileSync` calls (reading the ref straight from
`.git/` to skip `rev-parse` was considered and dropped: packed-refs and detached-HEAD edge cases
made it a bigger, riskier change for a smaller win than the config fix).

**Measured effect** (`npx vitest run --reporter=json`, before vs. after, same machine):

| Scope | Before | After | Change |
|---|---:|---:|---:|
| 4 heaviest files in isolation (`action/run`, `signals/size`, `architecture/contracts`, `brief/build`) | 865.8s summed | 258.8s summed | **-70.1%** |
| `tests/action/run.test.ts` alone (118 `it()`s, each calling `makeRepo()`) | 314.4s | 141.8s | -54.9% |
| Full suite, summed per-file time (93 files) | 3092.6s | 2313.2s | **-25.2%** |
| Full suite, wall clock (parallel fork pool) | 314.8s | 265.5s | -15.6% |
| `npm test` (fast tier only, see below) | — | 9.4s (61 files, 1040 tests) | — |

The full-suite wall-clock gain (15.6%) is smaller than the summed-time gain (25.2%) because
vitest's fork pool already parallelizes across files and was bound by other slow files and by
machine contention, not purely by this fixture. Both runs hit the same 3 pre-existing flaky
timeouts (`tests/hotspots.test.ts`, `tests/brief/selfcheck-gate.test.ts`,
`tests/model/calibrate.test.ts` — all `Error: Test/Hook timed out`), unrelated to this change and
consistent with resource contention under a fully parallel run; not fixed here (out of scope for a
surgical change, and a candidate for its own task).

## Fix: split the slow integration tests out of the default `npm test`

Even after the fixture fix, the 32 heaviest files (every file that took ≥ 20s in the full-suite
measurement above — real-git integration tests like `tests/action/run.test.ts` and
`tests/hotspots.test.ts`, plus the CPU-bound `tests/model/calibrate.test.ts` model fit) are still
96% of the suite's summed time. `vitest.slow.config.ts` now holds that file list; `vitest.config.ts`
imports and excludes it. Scripts:

- `npm test` runs the fast tier only (61 files, 1040 tests, **9.4s**) — the inner loop for anyone
  running the whole suite rather than scoped files.
- `npm run test:slow` runs the 32-file slow tier.
- `npm run check` runs `typecheck`, `test`, then `test:slow` in sequence (`scripts/run-check.mjs`)
  — unchanged total coverage, just split into two vitest invocations.

**CI policy**: `.github/workflows/ci.yml` now runs `npm run typecheck`, `npm test`, *and*
`npm run test:slow` as separate steps, so CI's total test coverage is identical to before this
change — nothing that ran in CI stops running in CI. The split only changes what a plain
`npm test` covers locally.

## Not fixed here, and why

- **Per-commit git spawns** (`add`, `commit`, `rev-parse` — 3 per `commit()` call): real savings
  are there, but replacing them means either batching (`git commit -a` still needs a prior `add`
  for new files) or reading `.git/` state directly (risked correctness on detached HEAD / packed
  refs). Left as the next candidate if test suite time is revisited.
- **Eval cost/time (#2)**: already governed by worker-rules #10 (one full-suite run per task,
  `--runs 3` default, targeted `--case` preferred) — this session's eval mix (5 full-suite vs. 32
  targeted runs) shows that policy already being followed, not a new problem to fix.
- **The `~/.docker` incident (#4)**: already a one-time environmental failure, already permanently
  forbidden (worker-rules #12 added 2026-10-22). No code change needed; recorded here for the
  ranking's completeness.

## Flaky timeouts fixed

The 3 intermittent `Error: Test/Hook timed out` failures flagged above (`tests/hotspots.test.ts`,
`tests/brief/selfcheck-gate.test.ts`, `tests/model/calibrate.test.ts`) had two distinct root causes,
confirmed with a baseline `npm run test:slow` run that reproduced 2 of the 3 (`selfcheck-gate.test.ts`
timed out at its 30s default; `calibrate.test.ts`'s real-repo test timed out too, despite already
carrying an explicit `180_000`ms override — 6x the file default):

1. **`tests/hotspots.test.ts` alone** rebuilt its real-git fixture repo (1 `init` + 5 commits, 3 `git`
   spawns each) in `beforeEach`, once per `it()` — 7 times per run — even though none of its 7 tests
   mutate the shared repo; every one of them only reads it through `hotspots()`. That's 7x the git
   spawns this file needed, needlessly adding to the slow tier's total concurrent process count.
   `tests/signals/blast.test.ts` already shows the fix pattern elsewhere in the suite: build the
   repo once in `beforeAll`, share it read-only, clean up once in `afterAll`. Applied the same
   pattern here (7 repo builds -> 1).
2. **`tests/model/calibrate.test.ts` and `tests/brief/selfcheck-gate.test.ts`** were not doing
   redundant work — `calibrate`'s replay (`src/model/replay.ts`) already builds the history index and
   import graph once per replay and shares them across every replayed commit (the "reuse cached
   indexes" pattern the task asked to look for already exists there) — but it still runs that replay's
   per-commit signal computation at an internal concurrency of 8 (`CONCURRENCY` in `replay.ts`). Under
   Vitest's *default* pool, up to `cpus - 1` (15 on this 16-core/12-performance-core machine) test
   files already run as concurrent forked processes; any of those forks running `calibrate.test.ts`
   could itself fan out 8 more concurrent git-spawning tasks on top. The resulting peak concurrent
   process count oversubscribed the machine by a large factor, starving whichever test's git spawns
   or CPU-bound fit needed scheduler time at that moment — consistent with the baseline run blowing
   past `calibrate.test.ts`'s already-generous 180s override, and with `loadAvg1m` readings dropping
   from ~13-17 (during/just before the flaky runs) to ~4-6 (during the clean ones).

   Fix: `vitest.slow.config.ts` now caps the slow tier's own worker concurrency with the top-level
   `maxWorkers` option (`poolOptions.forks.maxForks` was removed in Vitest 4+; the project is on
   Vitest 5) to half the logical cores (8), so this project's own worst-case concurrent-process count
   can no longer oversubscribe the machine by itself, independent of what else is running on it. This
   doesn't touch `replayHistory`'s production `CONCURRENCY`, which real CLI users rely on.

**Measured** (`node scripts/record-run.mjs test:slow -- vitest run --config vitest.slow.config.ts`,
same machine, `.dev-metrics/runs.jsonl`):

| Run | When | Duration | Result |
|---|---|---:|---|
| Baseline (before fix) | before either change | 243.7s | **2 timeouts** (`selfcheck-gate.test.ts` 30.0s, `calibrate.test.ts` 180.1s) |
| After `hotspots.test.ts` fix only | before the `maxWorkers` cap | 227.6s | **1 timeout** (`selfcheck-gate.test.ts` 30.0s) |
| After both fixes, run 1/3 | proof run | 226.4s | 0 timeouts, 537 passed / 1 skipped |
| After both fixes, run 2/3 | proof run | 239.6s | 0 timeouts, 537 passed / 1 skipped |
| After both fixes, run 3/3 | proof run | 238.0s | 0 timeouts, 537 passed / 1 skipped |
| `npm run check` (typecheck + test + test:slow) | proof run | 245.7s total (8.3s test + 236.1s test:slow) | 0 timeouts, 1040+537 passed / 1 skipped |

Capping concurrency cost essentially nothing here (226-240s after vs. 227-244s before): the slow
tier was never wall-clock-bound by having 15 forks instead of 8, just made flaky by the spikes 15
forks (each able to fan out further) could produce.

## The analytics ledger

To make this kind of audit a five-minute `node scripts/metrics-report.mjs` instead of a multi-hour
transcript-mining exercise next time, every `check`/`test`/`test:slow`/`build:action` run now
appends one line to the gitignored `.dev-metrics/runs.jsonl`, and `claude plugin eval` runs can be
appended the same way from their `aggregate-result.json`. See
[Maintaining opendrs](../maintaining.md#dev-loop-metrics). The numbers in
this note are seeded into it with `"source": "backfill"`.
