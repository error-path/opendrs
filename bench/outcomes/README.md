# Outcome labels: captain facts against real outcomes

Measures the captain facts and the captain priority on merged PRs of six active public repos,
where the outcomes already exist: review comments anchored to a file and line (did a human
reviewer independently look where the fact points?) and the later fix history (did a fix within
90 days SZZ-blame back to the PR at that file and line? was the PR reverted?). Each fact's rate is
compared with the same PR's other changed files, so the number reported is a **lift**, not a raw
rate. Spec: [`docs/specs/2026-10-23-outcome-labels-design.md`](../../docs/specs/2026-10-23-outcome-labels-design.md);
pre-registration and results: [`docs/experiments.md`](../../docs/experiments.md#outcome-labels-on-active-public-repos).

It is also the standing regression eval the research memo's O5 asked for: `corpus.jsonl` and
`labels.jsonl` are committed and independent of opendrs's output, so after any detector, weight
or prompt change the briefs are rebuilt and the same numbers come out, with a drift section
against `baseline.json`. The **primary** view is the first five facts of each PR in brief order
(what the PR comment shows); the per-fire view over every fact is secondary, because one PR can
fire thousands of facts of one type (cli/cli#12289: 2,628 `contract.api`). The report names any
PR carrying more than 20 % of a fact type's per-fire count.

## Prerequisites

- `npm run build` (`run.ts` imports `dist/`, like `bench/verify/run.ts`).
- `gh` logged in (read-only API calls; about 3 per PR plus list pages).
- Node ≥ 23.6 (native type stripping) and git. Disk: the six clones are full clones (a
  blobless clone spent minutes per brief in lazy blob fetches), about 1 GB in total.

## Running

```sh
npm run build
node scripts/record-run.mjs bench:outcomes:fetch -- node bench/outcomes/run.ts fetch
node scripts/record-run.mjs bench:outcomes:build -- node bench/outcomes/run.ts build --keep-clones
node scripts/record-run.mjs bench:outcomes:label -- node bench/outcomes/run.ts label
node scripts/record-run.mjs bench:outcomes:eval  -- node bench/outcomes/run.ts eval --write-baseline
```

or `node bench/outcomes/run.ts all`. Re-running the eval after a code change:

```sh
npm run build
node bench/outcomes/run.ts build --fresh-briefs --keep-clones   # rebuild every brief at the new dist/
node bench/outcomes/run.ts eval                                  # results.md gains a drift section
```

| Flag | Default | Meaning |
|---|---|---|
| `--repos a,b` | all six | Restrict to these slugs (`black`, `cli-cli`, `actix-web`, `vite`, `fastlane`, `mockito`) |
| `--limit N` | 200 | PRs per repo (pilots) |
| `--repo-concurrency N` | 3 | Repos processed at once |
| `--pr-concurrency N` | 2 | Briefs per repo at once (each `scoreDiff` spawns several git processes) |
| `--keep-clones` | off | Keep `~/.cache/opendrs/outcomes/clones/<slug>`; otherwise `build`/`label` delete them at the end |
| `--fresh-briefs` | off | `build` ignores cached briefs and recomputes every one |
| `--write-baseline` | off | `eval` also writes `baseline.json` (the drift reference) |

## What each step does, and where it caches

Cache root: `~/.cache/opendrs/outcomes/`. Every step reuses what is there, so an interrupted run
resumes; delete a file to redo that one thing.

| Step | Reads | Writes |
|---|---|---|
| `fetch` | GitHub | `gh/<request>.json` (one file per API request), `gh/<slug>/selection.json` (the pinned head and the 60 selected PR numbers — pinned by the cache: the first fetch decides) |
| `build` | `selection.json`, clones | `clones/<slug>`, `briefs/<slug>/<n>.json` (priority, facts, score, changed files with added-line numbers, wall time), `build/<slug>.json`, and the committed `corpus.jsonl` (one record per line: meta, repos, PRs, exclusions) |
| `label` | `build/<slug>.json`, `briefs/`, clones | `blame/<slug>/<fixSha>.json` (one `blameFix` per fix commit), and the committed `labels.jsonl` (one record per PR) |
| `eval` | `corpus.jsonl`, `labels.jsonl`, `briefs/` | the committed `results.md` and, with `--write-baseline`, `baseline.json`; `results.json` (every per-fact record, 1.3 MB) is regenerated each time and gitignored |

`timings.json` under the cache root holds each step's last duration; `results.md` prints them.

[`size-cuts.md`](size-cuts.md) checks whether big PRs are fixed more often per line or only because
they write more lines (written by hand, not by `run.ts`).

## Corpus rule (spec §3, mechanical)

The six repos are public, multi-reviewer projects, one per supported language.
`error-path/opendrs` itself is excluded, now and in any extension: with one maintainer, its
review and outcome data measures nothing.

Per repo: default-branch tip at first fetch = pinned head `T_head`; window `W = 90 days`;
candidates are PRs into the default branch with `merged_at ≤ T_head − W`, created within the
1,095 days (3 years) before that cutoff, not bot-authored; the 200 most recently merged (run 1,
recorded in `docs/experiments.md`, used 365 days and 60; the amendment there says why). A PR is then
excluded, with its reason in `corpus.json`, when its merge commit is not on the pinned head's
first-parent history or the reconstructed diff's file count differs from GitHub's
`changed_files`. More than 20 % of a repo excluded that way stops the run (exit 1 with the
reason) — that is a harness bug, not a corpus property.

## Labels (spec §5)

Per fact: `E_file`/`E_line` (a non-bot, non-author review comment on the file / within ±10
lines), `F_file`/`F_line` (a fix or revert commit within 90 days whose SZZ-lite blame lands on a
PR commit at the file / within ±10 lines), `R` (the PR reverted), and for `coupling.missing` the
descriptive `P_partner`. Expected rates come from the PR's own other changed files (and the fact
file's own added lines), so lift = observed ÷ expected.

## Decision rule (spec §7)

Per fact type, file-level lifts: fewer than 30 fires → insufficient data; `E_file` or `F_file`
lift ≥ 1.2× → keep; neither but one ≥ 1.0× → retune; both < 1.0× → demote. The priority is
informative when the careful tier's fixed-or-reverted rate is ≥ 1.2× the corpus rate on ≥ 30
careful PRs.

## Testing

`lib.ts` is pure and covered by `tests/bench/outcomes-lib.test.ts`
(`npx vitest run tests/bench/outcomes-lib.test.ts`). `run.ts` imports `dist/` and is excluded
from `tsc --noEmit` by the root `tsconfig.json`'s `bench/**/run.ts` glob, like the other bench
runners.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | The requested steps completed |
| 1 | A step failed (a clone, `gh`, a history build, or the §3 stop rule); the message says which; re-run resumes from the cache |
| 2 | Bad flag or unknown step/slug |
