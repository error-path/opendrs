---
title: "Experiments: what we tried and what did not work"
description: "The opendrs experiment log: every benchmark and model experiment with its question, setup, real numbers and verdict, including the negative results, so nobody repeats a dead end."
---

# Experiments

This is opendrs's experiment log. It records every experiment, the ones that did not work
included, so that nobody repeats a dead end. Newest first. All numbers are copied from the files
named under **Where**.

Unless stated otherwise, ApacheJIT numbers are on the dataset's official split: train 2003–2016,
test 2017–2019. They are pooled over the held-out test commits, excluding `apache/hadoop`, which
has no positive labels: 24,686 commits, 5,818 positive. "Recall@X %" is the share of buggy
commits in the riskiest X % of commits. How to read the metrics is in
[Calibration and backtesting](calibration.md#reading-the-metrics).

| Date | Question | Result | Verdict | Details |
|---|---|---|---|---|
| 2026-10-23 (pre-registered 2026-10-23, before coding) | Do the outcome-labels study's top three detector follow-ups (`contract.api` per-file aggregation, `coupling.missing` narrowing, `contract.env` per-file aggregation + generated-file skip) hold on a held-out corpus (yargs/yargs, expressjs/express; 89 PRs) the follow-ups were never derived from? | All three **held**: zero structural violations (no file fires >1 aggregated fact, no fire on a generated `*.lock.yml`, no `coupling.missing` fire on a CI workflow/manifest/test or at `weight: "strong"`); the 3 pre-fix `coupling.missing` fires were all on `.github/workflows/ci.yml` and all eliminated with the captain priority table unchanged. `contract.api`/`contract.env` had only 0–1 fire each — insufficient volume for a precision (lift) verdict on this corpus, honestly reported, not claimed | No fix reverted; none needed it | [details](#captain-fact-precision-follow-ups-on-a-held-out-corpus) |
| 2026-10-23 (pre-registered 2026-10-23; corpus-size amendment the same day, before run 2) | Do the captain facts point where human reviewers independently look (review comments) and where later fixes land (90-day SZZ blame, reverts), relative to the same PR's other files, on merged PRs of six active public repos (one per supported language)? Is the captain priority informative about later fixes? | Run 2, 1,010 PRs, 3,197 facts: **keep** `contract.api` (engagement 1.23×; 1.30× on the five facts a comment shows), `contract.dependency` (engagement 1.32×, later-fix 4.62×), `change.concurrency` (1.63× / 2.08×), `change.safety_removed` (1.62× / —); **demote** `coupling.missing` (0 of 45 fires engaged, later-fix 0.92×); insufficient data (< 30 fires) for `contract.env`, `layers.edge` (1.89× on 18), `contract.instructions`, `contract.schema`. Priority **informative**: fixed-or-reverted careful 14.8 %, standard 10.4 %, quick 1.7 % (base 9.8 %) | Report only; no detector changed. Standing eval in `bench/outcomes/` | [details](#outcome-labels-on-active-public-repos) |
| 2026-10-22, amended and re-run 2026-10-23 (pre-registered 2026-10-22, amendment 2026-10-23) | Does `llm.verify` (the Phase 2 verification pass) recall the field test's 15 true+useful captain facts and correctly drop/downgrade its 18 noisy `coupling.missing` fires and 2 `contract.dependency` WRONG fires, at acceptable cost? | **v1**: recall PASS (1/14), `coupling.missing` PASS (15/18: 4 detector + 11 verifier), WRONG-fire precision FAIL (0/2 — both facts never fire at all post-0.4.1; the study couldn't yet tell "eliminated" from "missed"), cost FAIL ($0.0210/PR, $1.0271/49 PRs). Overall precision-fail, recorded honestly below with no exception carved out. Root-caused and fixed (dead `VerifyVerdict.confidence` field; WRONG-fire elimination now scored, same bar) — amended and re-run. **v2** (same corpus/model/bars, run `2026-10-22T19-16-53-589Z`): recall PASS (1/14), `coupling.missing` PASS (14/18: 4 detector + 10 verifier), WRONG-fire precision PASS (2/2, both eliminated at the detector), cost PASS ($0.0192/PR, $0.9419/49 PRs). **Overall: ship.** Combined v1+v2 spend $1.9690 of the $5 study cap | Shipped as opendrs 0.5.0 | [details](#verifier-precision-study-on-the-field-test-corpus) |
| 2026-10-20 (pre-registered 2026-10-20) | Do re-centred default weights reduce out-of-the-box saturation on mature repositories? | On ApacheJIT, both candidates make saturation worse, not better: intercept re-centring to mid-yellow raises red share 25.6 % → 40.3 % (the train-split median was 0.307, not near red as assumed); scaling `history.*`/`expertise.*` by repo age raises red share to 33.9 % and costs −0.0052 AUC (significant loss, CI −0.0058 to −0.0046) | Rejected; the pre-registration's "median near red" premise does not hold on ApacheJIT | [details](#default-weights-re-centred-intercept-and-repo-age-scaling-on-apachejit) |
| 2026-10-20 (pre-registered 2026-10-19) | Does excluding Conventional-Commit housekeeping from `history.fixPattern`, and matching `history.incident` at file level instead of folder level, reduce default-prior score saturation on mature repos without hurting calibrated AUC? | On ApacheJIT: red share falls 0.9 % (fixPattern), 7.4 % (incident), 8.3 % (both) — all short of the 25 % bar; calibrated AUC never drops (+0.0002 to +0.0010, every CI non-negative) | Rejected per threshold; file-level incident matching recommended anyway | [details](#score-saturation-fixpattern-and-incident-granularity-on-apachejit) |
| 2026-10-19 | Do `contract.dependency`, `contract.api`, `contract.schema` and `layers.edge` predict ApacheJIT bugs enough to ship as captain facts (spec §10.2)? Do the rejected review signals (`change.concurrency`, `change.safety_removed`, `tests.weakened`) qualify as captain facts on the full test split, even though they did not help the score? | 6 of 7 qualify (lift ≥ 1.2× and ≥ 50 fires): `contract.dependency` 1.467×, `contract.api` 1.718×, `contract.schema` 2.388×, `change.concurrency` 2.036×, `change.safety_removed` 1.788×, `tests.weakened` 1.202×. `layers.edge` does not: 1.117× on 19 fires of a 2,000-commit sample | Merged (facts only; review signals still excluded from the score) | [details](#captain-fact-lift-on-apachejit) |
| 2026-10-19 | Does historical change coupling (`coupling.missing`) predict ApacheJIT bugs enough to ship, and should it also enter the score? | Yes to shipping: test lift 1.931× at the tuned `minSupport: 8`/`minConfidence: 0.6`. No to the score: AUC 0.823 → 0.823, 95 % CI -0.0003 to -0.0001 (significant, but negative) | Merged (brief-only) | [details](#change-coupling-on-apachejit) |
| Planned (pre-registered 2026-10-18, amended 2026-10-18) | Does an LLM reviewer plus opendrs beat the LLM alone, by enough to justify the tokens? | Free simulation on cached judgements: with opendrs as the decision layer, AUC 0.772–0.789 → 0.824 at no extra LLM tokens. At a 10 % review budget, 60 bugs caught against 47–51, false-positive rate 3.4 % against 4.9–5.5 % | Planned, paused (no paid runs yet) | [details](#planned-llm-plus-opendrs-vs-the-llm-alone) |
| 2026-10-18 | Does `calibrate`'s fit, not its features, explain the gap to the Kamei LR? | Yes. The saved weights never saw the newest 20 % of history. Refitting on all of it: AUC 0.819 → 0.823 (Kamei 0.821) | Merged | [details](#fit-experiment-and-the-calibrate-refit) |
| 2026-10-18 | Do reviewer-checklist signals (concurrency, removed safety code, weakened tests) add ranking signal? | No. AUC 0.782 with and without, on 5 projects | Rejected (archived as a patch) | [details](#review-heuristic-signals) |
| 2026-10-18 | Do the missing Kamei features (ent, age, nuc, sexp) close the gap? | No. AUC 0.819 → 0.817 | Rejected (archived as a patch) | [details](#kamei-features) |
| 2026-10-16 | Do structured outputs fix the judge's malformed replies? | Judge failures 36 → 0 of 1,600 | Merged | [details](#structured-outputs-for-the-llm-judge) |
| 2026-10-16 | Does a prompted LLM judge improve ranking, and is its `requireSafe` gate useful? | Ranking +0.015 to +0.022 AUC (within noise). Gate passes 28.5 % of commits at 5.3 % buggy (base rate 25.5 %) | Merged (opt-in) | [details](#structured-llm-judge-on-sampled-apachejit) |
| 2026-10-16 | How do default and calibrated opendrs compare with the classic JIT metrics on a public benchmark? | Calibrated 0.819 vs Kamei 0.821 vs DRS-OSS 0.895 (published, other split) | Merged | [details](#apachejit-benchmark-baseline) |
| 2026-10-15 and 2026-10-16 | Does the score rank later-fixed commits on real open-source repositories, untuned and calibrated? | Better than chance almost everywhere. Calibration helped in 9 of 9, then in 11 of 18 | Kept as evidence | [details](#public-repository-backtests) |

## Outcome labels on active public repos

**Status.** Pre-registered 2026-10-23, before any fetch, clone or brief. Spec:
`docs/specs/2026-10-23-outcome-labels-design.md`. The question, corpus rule, labels, metrics and
decision rule below are copied from it; results are appended under "Result" after the run,
including a failed or stopped run.

**Question.** The captain facts' precision has only been measured on proxies — the hand-graded
49-PR field test, and ApacheJIT bug lift on Java commits. On merged PRs in active public repos,
where review comments and the later fix history already exist: (1) per fact type, do facts point
at files (and lines) that human reviewers independently commented on, and at files (and lines)
that a fix commit within 90 days blamed back to the PR, more often than the same PR's other
changed files? (2) Is the captain priority ("careful review") informative about which PRs were
later fixed or reverted? (3) Can the labelled set stand as a regression eval that re-runs on
every detector, weight or prompt change?

**Setup.**
- **Repos (fixed).** psf/black (Python), cli/cli (Go), actix/actix-web (Rust), vitejs/vite
  (TypeScript), fastlane/fastlane (Ruby, with the field test's recorded quirks: full clone,
  `history.maxCommits: 1500`, `history.lookbackDays: 90`), mockito/mockito (Java). vapor/vapor
  (Swift) is dropped: no Swift import extractor, zero facts in the field test.
  `error-path/opendrs` itself is excluded, here and in the standing eval (worker rule 16,
  2026-10-23): a single-maintainer repo's review and outcome data says nothing.
- **PR selection (mechanical, spec §3).** Pinned head = default-branch tip at corpus-build time,
  `T_head`. Window `W = 90 days`. Candidates: PRs into the default branch, `merged_at ≤ T_head −
  W`, `created_at ≥ T_head − W − 365 d`, author not a `Bot`, reconstructible from the clone (merge
  commit on first-parent history; diff file count equals the PR's `changed_files`). The 60 most
  recently merged qualifying PRs per repo. Exclusions are listed with reasons. **Stop rule:** more
  than 20 % of a repo's candidates non-reconstructible → the run stops and the cause is
  investigated before any number is read.
- **Brief (spec §4).** `scoreDiff` from `dist/` with `llm: null`, `defaultConfig()` plus the
  repo's recorded quirks only (no `.opendrs.yml` from the repo), base/head from the merge commit
  (merge → `M^1`/`M^2`; squash → `M^1`/`M`; rebase → `M~k`/`M`), one shared history index per
  repo at the pinned head with `asOf = base time + 1 s` (the `calibrate`/`backtest` reuse;
  leakage of later-merged, earlier-committed branches is a recorded caveat).
- **Labels (spec §5), stored in `bench/outcomes/labels.json`, independent of opendrs output.**
  `E_file`/`E_line`: a review comment by a non-bot non-author on the fact's file / within ±10
  lines of the fact's line. `F_file`/`F_line`: a fix commit (`isFix` or `isRevert`, non-merge,
  within `(merged_at, merged_at + 90 d]`) whose SZZ-lite blame (`blameFix`) lands on a PR commit
  at the fact's file / within ±10 lines. `R`: the PR reverted. `P_partner` (coupling only,
  descriptive): a fix in the window touched the named partner.
- **Controls (spec §5.3).** Expected `E_file`/`F_file` for a fact = the share of the PR's
  changed non-ignored files with that outcome; expected `E_line`/`F_line` = the share of the
  fact file's added lines within ±10 of such an outcome. **Lift** = mean(label) / mean(expected)
  over a fact type's facts.
- **Priority.** Share of fixed-or-reverted PRs per priority tier vs. the corpus rate; recall of
  fixed-or-reverted PRs at "careful".
- **No LLM or API calls.** Verifier outcome measurement is designed in spec §10 (≈ $7, cap $10)
  and not run.

**Decision rule (spec §7), per fact type, file-level lifts primary.**
- fewer than 30 facts fired → **insufficient data** (no change proposed);
- `E_file` lift ≥ 1.2 or `F_file` lift ≥ 1.2 → **keep**;
- neither ≥ 1.2, at least one ≥ 1.0 → **retune** (a detector change is proposed, not made);
- both < 1.0 → **demote** (`strong` → `info` proposed; `info` → removal or a narrower trigger).

The captain priority is **informative** when the careful tier's fixed-or-reverted rate is ≥ 1.2×
the corpus rate on ≥ 30 careful PRs; otherwise **not shown**. No detector is changed in this
branch; every conclusion lists follow-ups.

**Where.** `bench/outcomes/run.ts`, `bench/outcomes/lib.ts`, `bench/outcomes/corpus.json`,
`bench/outcomes/labels.json`; results in `bench/outcomes/results.md`/`results.json` and the
drift baseline in `bench/outcomes/baseline.json`. Cache under `~/.cache/opendrs/outcomes/`;
clones deleted after the run. Every repeatable step timed with `scripts/record-run.mjs`.

**Result (run 1, the pre-registered corpus; commit `4f4597b` holds its `corpus.json`,
`labels.json` and `results.*`).** Pinned heads 2026-10-20 to 2026-10-23. 327 PRs scored of
1,067 candidates: 621 bot-authored, 115 outside the lookback, 4 `diff-mismatch` (3 cli/cli
merge-commit PRs, 1 mockito; every repo far under the 20 % stop rule), none `not-first-parent`.
mockito had only 30 qualifying PRs. Shapes: 300 squash, 33 merge commits (cli/cli), 1 rebase.
Timings: fetch 5.5 min (1,208 cached requests), build 3.3 min (full clones; a blobless-clone
pilot spent 2–6 min *per brief* in partial-clone lazy fetches and was abandoned), label 1.6 min
(231 fix commits blamed), eval 7 s. **137 facts fired on 327 PRs; only `contract.api` (75,
46 of them on mockito) reached the 30-fire bar**, so the rule gives one verdict:

| Fact | Fires | E_file (exp) | lift | F_file (exp) | lift | No outcome | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| `contract.api` | 75 | 16.0 % (12.1 %) | 1.32× | 0.0 % (1.5 %) | 0.00× | 84.0 % | **keep** (line level: E_line 12.0 % vs 5.3 %, 2.28×) |
| `coupling.missing` | 19 | 0.0 % (2.6 %) | 0.00× | 0.0 % (1.7 %) | 0.00× | 100 % | insufficient; every fire on a CI workflow, a `Cargo.toml`/`package.json` or a test — the field test's noise pattern again; `P_partner` 57.9 % |
| `contract.env` | 14 | 0.0 % (24.0 %) | 0.00× | 71.4 % (48.9 %) | 1.46× | 28.6 % | insufficient; 10 of 14 are one PR (cli/cli#13777, ten lines of one generated `issue-triage.lock.yml`) |
| `change.safety_removed` | 10 | 10.0 % (7.8 %) | 1.28× | 0.0 % (0.7 %) | 0.00× | 90.0 % | insufficient |
| `change.concurrency` | 7 | 0.0 % (5.9 %) | 0.00× | 14.3 % (3.0 %) | 4.72× | 85.7 % | insufficient |
| `contract.instructions` | 5 | 60.0 % (20.7 %) | 2.90× | 0.0 % (4.4 %) | 0.00× | 40.0 % | insufficient |
| `contract.dependency` | 5 | 0.0 % (0.0 %) | — | 0.0 % (0.0 %) | — | 100 % | insufficient |
| `layers.edge` | 2 | 100 % (41.7 %) | 2.40× | 0.0 % (0.0 %) | — | 0.0 % | insufficient |

Outcomes are sparse: 73 of 327 PRs have a counted review comment (248 comments, none without a
line), **18 have a blame hit** (5.5 %), 1 was reverted, 22 had changes requested. **Captain
priority:** careful 11/149 fixed-or-reverted (7.4 %), standard 6/78 (7.7 %), quick 1/100
(1.0 %); corpus 5.5 %; recall at careful 61.1 %. The pre-registered test passes (careful ≥ 1.2×
base on ≥ 30 PRs: 1.35×), but the honest reading is that the priority separates **quick** from
the rest, not careful from standard.

**Amendment 2026-10-23 (before run 2).** The corpus rule's two size parameters change:
lookback 365 → **1,095 days**, PRs per repo 60 → **200** (fewer where a repo has fewer). Nothing
else changes — same repos, pinned heads, window, labels, controls, metrics and decision rule, and
run 1 above stays recorded exactly as run. Reason: the rule's own "insufficient data" arm fired
for 7 of 8 fact types; the only way to a verdict is more PRs, and the mechanical rule scales
without choosing any. Run 1's 60 PRs per repo are a subset of run 2's selection (same pinned
heads), so run 2 is an extension, not a different sample. Expected cost: ~3,600 read-only API
requests across two rate-limit hours, about 1,200 briefs at ~2 s each.

**Result (run 2, the amended corpus; this branch's `corpus.jsonl`, `labels.jsonl`,
`baseline.json` and `results.md`; `results.json` is regenerated by `eval`).** Same pinned heads as run 1. **1,010 PRs scored** (black 200, cli/cli 196,
actix-web 98, vite 199, fastlane 200, mockito 117 — actix-web and mockito ran out of qualifying
PRs inside the three years) of 2,314 candidates: 1,151 bot-authored, 147 outside the lookback,
6 `diff-mismatch` (4 cli/cli merge-commit PRs, 1 vite, 1 mockito; every repo far under the 20 %
stop rule). Shapes: 838 squash, 166 merge commits, 6 rebase. Labels: 245 PRs have a counted
review comment (827 comments, all with a line), **99 have a blame hit (9.8 %)**, 5 were
reverted, 54 had changes requested; 461 fix commits were blamed. 205 of 1,010 PRs carry any fact
(805 none, 188 one to five, 13 six to twenty, 4 more). Timings (`scripts/record-run.mjs`): fetch —
the first attempt was killed by the master session's restart after ≈ 3,100 cached requests (≥ 20
min, rate-limit bound), the resume from the cache took 0.2 min; build 7.0 min for 1,010 briefs
at 3 repos × 2 PRs in parallel (≈ 2 s a brief on full clones); label 0.3 min with run 1's blame
cache (1.6 min cold); eval seconds. Clones deleted afterwards.

Per fact type, the pre-registered per-fact rule, file level (`bench/outcomes/results.md` is the
source; "exp" is the same PRs' other-file rate, §5.3):

| Fact | Fires (PRs) | E_file (exp) | lift | F_file (exp) | lift | No outcome | Verdict (§7) |
|---|---:|---:|---:|---:|---:|---:|---|
| `change.concurrency` | 72 (21) | 4.2 % (2.6 %) | 1.63× | 2.8 % (1.3 %) | 2.08× | 93.1 % | **keep** |
| `change.safety_removed` | 42 (42) | 11.9 % (7.3 %) | 1.62× | 0.0 % (1.0 %) | 0.00× | 88.1 % | **keep** |
| `contract.api` | 2,938 (114) | 1.1 % (0.9 %) | 1.23× | 0.3 % (0.4 %) | 0.63× | 98.7 % | **keep** |
| `contract.dependency` | 43 (22) | 9.3 % (7.0 %) | 1.32× | 23.3 % (5.0 %) | **4.62×** | 67.4 % | **keep** |
| `contract.env` | 26 (12) | 3.8 % (16.5 %) | 0.23× | 38.5 % (26.6 %) | 1.44× | 57.7 % | insufficient |
| `contract.instructions` | 10 (9) | 60.0 % (43.4 %) | 1.38× | 0.0 % (2.2 %) | 0.00× | 40.0 % | insufficient |
| `contract.schema` | 3 (1) | 0.0 % (0.0 %) | — | 0.0 % (0.1 %) | 0.00× | 100 % | insufficient |
| `coupling.missing` | 45 (36) | 0.0 % (4.3 %) | 0.00× | 4.4 % (4.8 %) | 0.92× | 95.6 % | **demote** |
| `layers.edge` | 18 (16) | 33.3 % (17.6 %) | 1.89× | 0.0 % (2.1 %) | 0.00× | 66.7 % | insufficient |

Line level (±10 lines, facts with a line): `contract.api` E_line 0.4 % vs 0.3 % (1.31×);
`contract.dependency` 9.3 % vs 6.4 % (1.45×); `change.concurrency` 0.67× and
`change.safety_removed` 0.90× — the file is right, the line pointed at is not where reviewers
comment. `coupling.missing`'s descriptive `P_partner`: 44.4 %.

**One PR dominates `contract.api`.** cli/cli#12289 fired **2,628** of the 2,938 facts (one per
removed public declaration in a mass Go refactor); the brief shows five and folds the rest into
"+N more". Without that PR: 310 fires, E_file 10.3 % vs 8.4 % (1.23×), F_file 2.6 % vs 3.2 %
(0.80×) — the verdict does not change. A **post-hoc view** was added to the harness after this
was seen (labelled as such in `results.md`, not part of the rule): the first five facts of each
PR, i.e. what the PR comment shows. On it, `contract.api` is 202 fires on 112 PRs, E_file
15.8 % vs 12.2 % (**1.30×**), F_file 3.5 % vs 3.2 % (1.08×); `change.safety_removed` 1.49×;
`contract.dependency` 1.32× / 3.70×; `coupling.missing` still 0.00× / 0.92× (43 fires);
`change.concurrency` drops to 22 fires (1.63× / 1.19×, insufficient on that view).

**Captain priority** (1,010 PRs): fixed-or-reverted careful **65/438 (14.8 %)**, standard
29/278 (10.4 %), quick **5/294 (1.7 %)**; corpus 9.8 %; recall at careful 65.7 %. The
pre-registered test passes (careful 1.51× base on ≥ 30 PRs). Unlike run 1, careful now also
beats standard (1.4×); quick is clean. Changes-requested reviews by priority: careful 25,
standard 23, quick 6.

**Reading the labels honestly.** Engagement is counterfactual (opendrs did not run on these
PRs): a lift > 1 means the fact points where reviewers already looked without it, a lift < 1 that
they did not — which is noise *or* the blind spot the brief exists to fill; the fix lift is what
separates the two. `contract.env` is the clearest case: reviewers rarely comment on an env read
(0.23×), yet the file is fixed later more often than the PR's other files (1.44×). Fix outcomes
are sparse (9.8 % of PRs) and SZZ-lite blames only modified or deleted lines, so `F` undercounts
and its lifts are noisy below ~40 fires. Also: 10 of `contract.env`'s 26 fires are one generated
`issue-triage.lock.yml` in cli/cli#13777 — the same fact-id collision/repetition the verifier
study flagged.

**Conclusion per fact type (no detector changed in this branch; follow-ups below).**
- `contract.api` — **keep**. Reviewers comment on the files it names 1.23–1.30× more than on the
  PR's other files; no later-fix signal.
- `contract.dependency` — **keep**; the strongest later-fix signal of any fact (23.3 % of named
  manifests fixed within 90 days, 4.62×), plus 1.32× engagement.
- `change.concurrency` — **keep** (1.63× / 2.08×), as a file-level fact; its line is not where
  reviewers comment.
- `change.safety_removed` — **keep** (1.62× engagement); stays `info` (fires on 42 PRs).
- `coupling.missing` — **demote**: 0 of 45 fires drew a comment, and the file was fixed later no
  more than the PR's other files (0.92×). Firing files: 15 CI workflows, 8 manifests, 8 tests, 14
  source files. The field test's 18-of-18 noise finding holds at 45 fires on a different sample.
- `contract.env` (26), `layers.edge` (18, 1.89× engagement — the first non-ApacheJIT evidence
  in its favour), `contract.instructions` (10, 1.38×), `contract.schema` (3) — **insufficient
  data**; no change proposed.
- `drift.scope` — not measurable here (Action-only), as in the field test.

**Forward amendment 2026-10-23 (after run 2; for every later run of the standing eval — run 2's
verdicts above stay exactly as pre-registered and are not re-decided).** From the next run the
**primary** metric is the shown-facts view (the first five facts of each PR in brief order, what
the PR comment shows), with the §7 rule applied to it; the per-fire view over every fact becomes
secondary. Reason, stated plainly: the per-fire metric is dominated by one PR — cli/cli#12289
carries 2,628 of 2,938 `contract.api` fires (89 %) and 48 of 72 `change.concurrency` fires
(67 %) — so its number was that PR's, not the fact type's. Had the rule been applied to the
shown view in run 2, `contract.api` (1.30×), `contract.dependency` (1.32× / 3.70×) and
`change.safety_removed` (1.49×) would still be keep and `coupling.missing` (0.00× / 0.92×, 43
fires) still demote; `change.concurrency` would be insufficient (22 fires, 1.63× / 1.19×). The
report now also lists every PR carrying more than 20 % of a fact type's per-fire count (types
at or above 30 fires), and `baseline.json`'s drift is computed on the primary view. The frozen
inputs are stored as `corpus.jsonl`/`labels.jsonl` (one record per line) and `results.json` is
regenerated, not committed: `bench/outcomes/` is 1.5 MB in git instead of 3.1 MB.

**Follow-ups, ranked (each a separate branch with its own pre-registration where it changes a
number).**
1. `contract.api`: one fact per file with a count ("removes or changes N exported declarations
   in X"), the way `change.safety_removed` already counts per PR — one PR firing 2,628 facts
   also starves every other fact of the comment's five slots. Re-run this eval (drift section)
   and the ApacheJIT lift afterwards.
2. `coupling.missing`: demote to `info` for every class (the rule's output) and narrow the
   firing file to source files — no CI workflow, manifest or test as the changed side — then
   re-run; the standing eval's drift section is the check.
3. `contract.env`: one fact per file, and skip generated files (`*.lock.yml` and the like).
4. More repos, not a longer window, for the four insufficient types: actix-web and mockito are
   exhausted at three years; add multi-reviewer public repos per language (never
   `error-path/opendrs`, worker rule 16). `layers.edge` needs ~12 more firing PRs to reach the bar.
5. The verifier's outcome measurement (spec §10): the same labels score `llm.verify`'s
   drop/downgrade verdicts; at the measured $0.0192/PR it is ≈ $19 for all 1,010 PRs or ≈ $4
   for the 205 PRs that carry a fact (cap $10). Designed, not run; the user decides.
6. Wire the standing eval into the release checklist (`docs/maintaining.md`): after any detector,
   weight or prompt change, `build --fresh-briefs` then `eval`, and read the drift section
   before shipping. Not CI: it needs the clones and ~10 min.

## Captain-fact precision follow-ups on a held-out corpus

**Status.** Pre-registered 2026-10-23, before any fix was coded (worker rule 8). The three fixes
and their rationale are recorded in commits `fix(captain): aggregate contract.api and
contract.env per file, skip generated lock files` and `fix(coupling): demote coupling.missing to
info-only, skip CI workflows/manifests/tests`, both on branch `fix/captain-fact-precision`.

**Why a held-out corpus, not run 2's.** The three fixes below (ranked follow-ups 1–3 in "Outcome
labels on active public repos" above) were read directly off run 2's 1,010-PR corpus: `contract.api`
per-file aggregation from cli/cli#12289's 2,628 fires, `coupling.missing`'s narrowing from its 45
fires' file classes, `contract.env`'s per-file aggregation and generated-file skip from
cli/cli#13777's 10 fires on one `issue-triage.lock.yml`. Re-running the standing eval's `build
--fresh-briefs`/`eval` on that same corpus would measure the fixes against the exact data that
produced them — not a validation, an echo. Every number from that corpus is reported below only
as a sanity check that the mechanics ran, labelled "run 2 (reference only, not validating)".

**Question.** On merged PRs the study never scored before, each in a repo never in run 2's six: do
the three fixes (a) behave correctly on the diffs they are meant for — one `contract.api`/
`contract.env` fact per file with a count, no `coupling.missing` fire on a CI workflow, manifest
or test, `coupling.missing` always `info` — and (b) leave the standing eval's primary metric
(shown-facts file-level engagement/fix lift, the forward amendment above) no worse than main's,
for the two fact types whose change is purely an aggregation (not a new exclusion)?

**Held-out corpus.** Two repositories never in run 2's six and never `error-path/opendrs` (rule
16), chosen by the spec's own mechanical selection, scoped down for this task's time budget:

| Slug | Repo | Language | Why |
|---|---|---|---|
| `yargs` | yargs/yargs | JavaScript | Multi-maintainer, active, small (5.5 MB) |
| `express` | expressjs/express | JavaScript | Multi-maintainer, active, small (10 MB); swapped in for `pallets/click` — see the amendment below, before any result was read |

Same mechanical PR-selection rule as spec §3 (pinned head = default-branch tip at fetch time,
`W = 90` days, author not a bot, reconstructible from the clone), with **`--limit 60`** instead of
200 — the pre-amendment per-repo count from the spec's own first run, chosen here only for this
task's bench-time budget, not for how the facts behave on these PRs. This is a genuine reduction
in statistical power versus the standing eval's own 200/repo and is recorded as a caveat on any
"insufficient data" reading below, not papered over.

**Setup.** `bench/outcomes/run.ts`'s own fetch/build/label/eval steps, copied to a scratch
directory (`scripts/` and committed files untouched — this never writes to `bench/outcomes/
corpus.jsonl`/`labels.jsonl`/`baseline.json`, which stay run 2's) with `REPOS` replaced by the two
rows above and the committed-file paths redirected under
`~/.cache/opendrs/outcomes-heldout/`. Built and run twice from the same corpus/labels (fetched
once, labels independent of opendrs):

1. **main** (commit before this branch): `npm run build` on a clean checkout, `build
   --fresh-briefs`, `eval`.
2. **fix/captain-fact-precision** (this branch, after both detector commits): `npm run build`,
   `build --fresh-briefs`, `eval`.

**Decision rule, fixed before running.**

1. **Structural correctness (primary; checkable even at N≈120, not a statistical claim).** On
   every held-out PR's brief built with this branch's `dist/`:
   - no file carries more than one `contract.api` fact and more than one `contract.env` fact
     (aggregation holds);
   - no `contract.env` fact's file matches `**/*.lock.yml`;
   - no `coupling.missing` fact's file matches `**/.github/workflows/**`, a manifest
     (`isManifestPath`) or `paths.tests`;
   - every `coupling.missing` fact has `weight: "info"`.
   A single violation on real, previously-unseen diffs fails this leg and reverts the fix (worker
   rule: a fix that fails its rule on held-out data is reverted, recorded here as a FAIL either
   way).
2. **No regression on the primary (shown-facts) engagement/fix lift**, for `contract.api` and
   `contract.env` only (the aggregation is a presentation change — it must not change *which*
   files fire, so the labelled PRs and outcomes are identical before and after; only the per-file
   fact *count* changes). Pass: held-out `E_file`/`F_file` lift with the fix ≥ lift on main, within
   rounding, **or** fewer than 10 fires on both sides (insufficient data either way — reported, not
   a pass or fail). `coupling.missing` is exempted from this leg by design: the fix is meant to
   *remove* fires on noisy classes, so a fire-count drop is the intended outcome, not a regression;
   its own rule is #3.
3. **`coupling.missing`'s remaining fires, if any, are no less engaged than main's.** If the
   held-out corpus has any `coupling.missing` fires surviving the narrower exclusion, their
   `E_file`/`F_file` lift must be ≥ main's fires' lift on the same corpus (even a single fire is
   reported, since the structural leg #1 already proves the exclusion fired correctly; this leg
   only checks that what's left isn't worse). Fewer than 5 remaining fires on either side:
   insufficient data, reported, not a fail.

**Amendment 2026-10-23 (during the run, before any result was read).** `pallets/click` hit the
spec §3 stop rule on its own 60-PR selection: 20 of 60 (33 %) excluded as `not-first-parent` or
`diff-mismatch`, almost all `not-first-parent` — consistent with a default-branch rename (click's
`default_branch` is `main`; its older merge commits are not on `main`'s first-parent history,
the harness's own documented failure mode, not a detector issue). Swapped for `expressjs/express`
(JavaScript, multi-maintainer, long-lived `master` default branch, 10 MB) before reading any
fact-level result from either repo. The held-out pair is **yargs/yargs and expressjs/express**,
both JavaScript; the spec's rule for an added repo (§3: "more than one active reviewer") does not
require per-language diversity the way the original six does.

**Reference only, not validating.** `bench/outcomes/results.md`'s already-committed run 2 numbers
for the three fact types, copied here unchanged for comparison: `contract.api` keep (1.23×
per-fire, 1.30× shown), `contract.env` insufficient (26 fires, 0.23× / 1.44×), `coupling.missing`
demote (0.00× / 0.92×, 45 fires). These are what motivated the fixes, not what tests them.

**Result.** Fetch 3.5 min, build 0.8 min, label < 0.1 min (`express` + `yargs`, both JS; 89 PRs
scored of 234 candidates: 84 bot-authored or outside the lookback, 1 `diff-mismatch`, far under the
20 % stop rule). Volume is low — both repos fire the three fact types far less often than cli/cli
did in run 2, and `--limit 60` (not 200) compounds it, exactly the reduction in power flagged at
pre-registration:

| Fact | Main fires | Fix fires | Structural violations (fix) | Leg | Verdict |
|---|---:|---:|---:|---|---|
| `contract.api` | 1 (yargs#2511) | 1 (same PR, same file) | 0 | #1 structural: pass. #2 lift: tied at 0/0 (E_file, F_file both 0 on both sides) — no regression, but N=1 is insufficient data by the pre-registered <10-fires rule | **held** |
| `contract.env` | 0 | 0 | 0 | #1/#2: no fires either side — insufficient data, honestly reported, not scored pass or fail | **insufficient data** |
| `coupling.missing` | 3 (all `express`, all `.github/workflows/ci.yml`, all `weight: "strong"` pre-fix) | 0 | 0 | #1 structural: pass — every one of the 3 pre-fix fires was on the exact noise class (CI workflow) the fix targets, confirmed from `results.json`'s raw records, not inferred; #3 remaining-fire lift: N/A, 0 remain (the intended outcome, not insufficient data in the bad sense) | **held** |

Checked directly against the raw brief JSON (`~/.cache/opendrs/outcomes-heldout/briefs/`), not
inferred from the lift table: zero files anywhere in the 89 briefs carry more than one
`contract.api` or `contract.env` fact, zero `contract.env` fact fires on a `*.lock.yml` file,
zero `coupling.missing` fact has `weight: "strong"`, and zero `coupling.missing` fact fires on a
CI workflow, a manifest or a test path — leg #1 (structural correctness) passes cleanly for all
three fixes with no exceptions found on real, previously-unseen diffs. The `yargs#2511` brief's
rendered text — "Removes or changes 1 exported declaration in `lib/command.ts`
(`CommandHandlerDefinition`), imported by 2 files." — confirms the new singular-count phrasing
reads correctly; no PR in this sample exercised the `N > 1` aggregation path, so that specific
code path is proven only by the unit tests (`tests/architecture/contracts.test.ts`), not by this
held-out run.

**A finding worth recording on its own:** the captain priority table was byte-for-byte identical
between main and the fix (careful 30, standard 21, quick 38 of 89, both runs) — the three
eliminated `coupling.missing` fires (`express#6632`, `#6843`, `#7218`) stayed `careful` after
losing their only architecture fact, so whatever else about those PRs set the tier/policy did not
depend on this fact in this sample. Not a formal gate-invariance proof (score/tier/policy are
computed independently of captain facts by construction, per `docs/verification.md`), but a
concrete data point that the demotion did not silently reshuffle priorities here.

**Decision.** All three fixes **held** on the held-out corpus: no structural violation, no
engagement/fix-lift regression on the (thin) data available, and `coupling.missing`'s narrowing
eliminated exactly the noise class it was built for with zero loss of legitimate fires in this
sample. None is reverted. The honest caveat, stated plainly: `contract.api` and `contract.env`
each had at most one fire, so this run mainly validates *structural* correctness (the new code
paths behave as coded on real diffs) rather than *precision* (whether the aggregated/narrowed
fact is a better signal) — that question still rests on run 2's own numbers, which is exactly
why this corpus could not be used to answer it. A repeat with more repos or a higher `--limit`
would give the lift comparison real power; not done here on this task's time budget.

**Where.** Scratch copies of `bench/outcomes/run.ts`/`lib.ts` (not committed; `bench/outcomes/
corpus.jsonl`/`labels.jsonl`/`baseline.json` in this repo are untouched, still run 2's), cache
under `~/.cache/opendrs/outcomes-heldout/`, run twice against `dist/` built from `main` (commit
`d6296f8`) and from this branch after both detector commits. Clones deleted after the label step.

## Verifier precision study on the field-test corpus

**Status.** Pre-registered 2026-10-22; v1 run completed 2026-10-22 (run id
`2026-10-22T17-30-07-530Z`, **precision-fail**). Amended 2026-10-23 (same bars, two root-cause
fixes; see the amendment below) and re-run the same day (run id `2026-10-22T19-16-53-589Z`,
**ship** — recall PASS, precision PASS, cost PASS). Shipped as opendrs 0.5.0. See "Result (v1)"
below the decision rule and "Result (v2)" at the end of the amendment for the full numbers.

**Question.** Does `llm.verify` (spec `docs/specs/2026-10-20-verification-pass-design.md` §3,
plan `docs/superpowers/plans/2026-10-22-verification-pass.md`) meet its own shipping bar (spec
§3.7) on the field test's real corpus
(`docs/research/2026-10-19-field-test.md`; session notes under
`~/.cache/opendrs/field-test/notes/`): does it recall the 15 true+useful captain facts the field
test found across six repositories, does it correctly drop or downgrade the 18 noisy
`coupling.missing` fires and both `contract.dependency` WRONG fires, and at what cost per PR?

**Setup.**
- **Corpus.** The ~49 PRs across the field test's six repositories (psf/black, cli/cli,
  actix/actix-web, vitejs/vite, fastlane/fastlane, vapor/vapor), at the pinned heads and per-PR
  base/head commits recorded in `bench/verify/labels.json`, which also carries every captain fact
  those six session notes judged (`{id, file, line?}` plus `true-useful | noise | wrong`, a quoted
  `note`, and an `ambiguous` flag where the note's own file reference was not exact).
- **Labels traced vs. the field test's own summary table.** 14 true-useful, 21 noise (18
  `coupling.missing` + 2 `contract.api` + 1 `layers.edge`), 2 `contract.dependency` WRONG — all
  reconcile exactly against `docs/research/2026-10-19-field-test.md`'s fact-type table **except**
  one `contract.env` true-useful fire the summary table counts (2) that is not traceable in any of
  the six notes or fastlane's raw JSON dump (only 1 is, `env-30112`). `bench/verify/labels.json`'s
  `meta.discrepancy` records this; the target below uses the traced total (14) and calls this out
  explicitly rather than silently padding the recall denominator with a fact nobody can point to.
- **Setup quirks the harness reproduces** (`bench/verify/labels.json`'s `meta.setupQuirks`):
  fastlane needs `history.maxCommits: 1500`, `history.lookbackDays: 90` and a full (non-shallow,
  non-blobless) clone — its default-config run crashed outright in the field test (120 s git
  timeout). The other five repos ran default config on `--filter=blob:none` (blobless) clones.
  cli/cli has 3 of its 8 rows as commit-range stand-ins (`base = sha~1`, `head = sha`, found via
  `git log --shortstat`, not real GitHub PRs), because only 9 of 276 sampled trunk commits carry a
  PR number.
- **Model.** Sonnet 5 (`claude-sonnet-5`), the model decided in
  `docs/specs/2026-10-20-verification-pass-design.md` §4.1 item 4. Effort/model id priced via the
  `claude-api` skill at run time, never from memory.
- **Run shape.** One `scoreDiff` (or `opendrs brief --json`) per labelled PR, `llm.verify.enabled:
  true`, single run per PR (no repeats, no voting) — `bench/verify/run.ts`.
- **Cap.** `--max-usd 5.00` hard cap, enforced by estimating each PR's prompt cost from its
  candidate count/diff size before the call and aborting the whole run before any call that could
  cross the cap; actual spend tracked from `verification.usage` after each call, running total
  printed to stderr. Well under the spec's own ≈ $0.25–$0.50 estimate for this corpus size
  (§3.6(a)), so the cap is headroom, not a expected binding constraint.
- **Prerequisite.** `bench/verify/run.ts` imports `dist/`, built from the verification-pass core
  branches (Tasks 1–4 of the implementation plan). This worker (`bench/verify-precision`) does not
  build or merge that code; it is blocked on that integration landing, and separately on
  `~/.config/opendrs/bench.env` holding `ANTHROPIC_API_KEY` (never printed, logged, written or
  committed by the script).

**Decision rule** (spec §3.7, copied verbatim, with the §3.8 amendment noted inline): **recall
first, precision second — precision is not checked until recall clears.**
1. **Recall.** At most 1 of the 15 true+useful facts (14 traced; see the discrepancy note above)
   wrongly `drop`ped; any failure here stops the study and requires a logged detector or prompt fix
   (spec implication 15) before anything else.
2. **Precision.** `coupling.missing` 0 % → ≥ 70 % correctly `drop`/`downgrade`d (≥ 13 of 18); both
   `contract.dependency` WRONG fires marked `drop`/`downgrade`. **§3.8 amendment:** three of the
   four `coupling.missing` noise classes (A retired file, B partner lacks the subject, C test fired
   on its source) are fixed deterministically in the detector itself
   (`src/architecture/coupling.ts`, a separate task/branch), not by the verifier; those detector
   fixes count toward the 13-of-18 target exactly as the spec says, and the verifier's own
   contribution (class D and anything the detector fix misses) is reported **separately** in
   `results.md` so the two are never conflated into one "the verifier caught X" number.
3. **Cost.** ≤ $0.02/PR at the chosen model (spec estimates $0.005–$0.01, headroom intact under the
   $5 cap for this corpus size).

**Every recall miss, and every fact the study shows was wrongly dropped, produces a logged detector
or prompt fix before the pass ships** (spec implication 15) — not optional, not a re-run.

**Where.** `bench/verify/run.ts`, `bench/verify/labels.json`, `bench/verify/README.md`; results
are written to [`bench/verify/results.md`](../bench/verify/results.md) (recall, the 18-fire
`coupling.missing` precision breakdown by detector class vs. verifier, the 2 WRONG fires, cost per
PR and total, model + `promptHash`, and this decision rule applied as written).

**Result (v1, run `2026-10-22T17-30-07-530Z`, model `claude-sonnet-5`, $1.0271 total / 49 scored
PRs).** Applying the decision rule above exactly as written:

1. **Recall: PASS.** 1 of 14 traced true-useful facts wrongly dropped (bar ≤ 1).
2. **`coupling.missing` precision: PASS.** 15 of 18 noise fires handled — 4 by the deterministic
   detector classes (A–C), 11 by the verifier alone (bar ≥ 13 of 18, i.e. ≥ 70 %).
3. **`contract.dependency` WRONG-fire precision: FAIL.** 0 of 2 marked drop/downgrade (bar: both).
4. **Cost: FAIL.** $0.0210/PR (bar ≤ $0.02/PR).

**Overall: precision-fail**, per spec §3.7 ("precision is not checked until recall clears" — it
cleared, so both precision legs and cost were evaluated; the rule fails on the first precision leg
that misses its bar). Full breakdown in `bench/verify/results.md`; raw per-PR `ReviewBrief` JSON
in `~/.cache/opendrs/verify-study/2026-10-22T17-30-07-530Z/`.

**Caveat on the WRONG-fire FAIL (recorded here, not papered over — see the amendment below for
the fix).** Checking the raw JSON for the one PR that carries both labelled WRONG facts
(`black-winloop-dep.json`, labels.json PR 4996): the live `contract.dependency` facts for that PR
are exactly one fact — the real `winloop` dependency, correctly kept — and neither of the two
labelled WRONG facts (`` ` ``, `win32`) appears as a candidate anywhere in the brief, baseline or
verified. They do not fire in opendrs 0.4.1 at all: `git log` shows commit `e66ca46` ("fix(captain):
parse PEP 508 markers, go.mod indirect, Cargo target deps and Package.swift"), part of the 0.4.1
release (`55c98e7`), already fixed the PEP 508 marker desync that produced them in the 0.4.0 field
test. The verifier therefore had zero candidates to drop or downgrade for this fact id — the
study's harness has no way yet to distinguish "the detector already eliminated this" from "the
verifier was asked and missed it", so both currently score as "0 of 2 handled". This is reported
as the pre-registered FAIL in the table and in the Decision section above, with no exception
carved out after the fact; the fix for the harness's blind spot is pre-registered as an amendment,
not applied retroactively to this result.

**Cost diagnosis.** `~/.cache/opendrs/verify-study/2026-10-22T17-30-07-530Z/*.json`'s
`verification.usage` fields, summed: 277,071 input tokens ($0.5541) + 47,297 output tokens
($0.4730) = $1.0271 over 503 verified candidates (49 PRs). Output is priced 5× input
(`claude-sonnet-5`: $2/$10 per MTok) and is 46 % of the bill despite being 15 % of the tokens.
Per-candidate output breakdown: avg `reason` text is 58 chars (well under the 200-char cap — not
the driver); every verdict object also carries a `confidence` field (0–10, required by
`VERIFY_SCHEMA`) that is generated, clamped by `parseVerification`, and then **never read** by
`applyVerification`/`verifyBrief` when building the stored `Verification` — confirmed by grep: no
call site outside `src/llm/verify.ts` and its tests touches `VerifyVerdict.confidence`. It is dead
weight on every one of the 503 candidates. Prompt caching (`claude-api` skill, current Sonnet 5
pricing/caching rules) was also checked as a lever: `VERIFY_SYSTEM_PROMPT` is ~2,122 chars, under
the project's own `chars/3.5` estimator ≈ 607 tokens — below Sonnet 5's 1,024-token minimum
cacheable prefix, so a `cache_control` breakpoint on it would silently create no cache entry
(`cache_creation_input_tokens: 0`) per the skill's own caching reference. Caching is not a viable
lever at this prompt's current size and was not implemented for that reason (documented here
rather than left as an unexplained gap).

### Amendment 2026-10-23: root-cause fixes and a v2 re-run

**Why.** v1 (above) failed on two legs: `contract.dependency` WRONG-fire precision (0 of 2) and
cost ($0.0210/PR). The cost diagnosis found a genuine root cause (a dead output field) worth
fixing before any re-run; the WRONG-fire FAIL turned out, on inspection of the raw JSON and
`labels.json`, to not be a verifier failure at all — both WRONG facts are structurally incapable
of firing in opendrs 0.4.1, so the study's own scoring, not `llm.verify`, was blind to that. Both
are fixed at the root; this amendment pre-registers what changed and why, **before** v2 runs,
per worker rule 8.

**What changed, and why (no change to recall or coupling.missing, both already passed):**

1. **Dead `confidence` field removed from the verify schema/prompt** (`src/llm/verify.ts`,
   `src/domain/types.ts`, commit `fix(llm/verify): drop the dead confidence field...`). It was
   required on every one of the 503 verified candidates, generated and clamped by
   `parseVerification`, and never read by `applyVerification`/`verifyBrief` — confirmed by grep,
   no consumer outside `src/llm/verify.ts`'s own tests. Removing it cuts output tokens on every
   candidate with zero effect on any verdict's action/status/citedLine/droppedClass, i.e. zero
   effect on recall or precision — it only removes dead weight from the bill.
2. **The harness now scores a WRONG fire the detector already eliminated as handled**
   (`bench/verify/lib.ts`'s `liveFactIds`, `bench/verify/run.ts`'s `judgeGroup`, commit
   `fix(bench/verify): score a WRONG fire the detector eliminated as handled...`). Both labelled
   WRONG facts (the `` ` `` / `win32` PEP 508 marker artifacts) are absent from every baseline
   (verify-off) brief in the corpus — confirmed directly in
   `~/.cache/opendrs/verify-study/2026-10-22T17-30-07-530Z/black-winloop-dep.json`: the only
   live `contract.dependency` fact for that PR is the real `winloop` dependency. `git log` traces
   the fix to commit `e66ca46` ("parse PEP 508 markers...", part of the 0.4.1 release). A fact
   that cannot fire can never mislead a reviewer, which is the spec's actual concern (§3.7.2); the
   verifier has no candidate to act on either way, so scoring it as "unhandled" measured the
   study's own blind spot, not the verifier. This exactly mirrors the precedent the spec's own
   §3.8 amendment already set for `coupling.missing`: a noise class fixed deterministically
   **before** the verifier sees it counts toward the same bar as one the verifier drops, reported
   as a separate column so the two are never conflated into one "the verifier caught X" number.
   The WRONG-fire column now reports the same way: eliminated-at-detector vs. handled-by-verifier,
   summed against the same bar.

**Bars — unchanged from the pre-registration, none loosened:**

1. Recall: at most 1 of 14 traced true-useful facts wrongly dropped.
2. `coupling.missing`: >= 13 of 18 noise fires handled (detector + verifier).
3. `contract.dependency` WRONG fires: both of 2 handled (now: eliminated-at-detector OR
   drop/downgrade-by-verifier — same count, same "both" bar, no fire gets a pass it didn't
   already structurally earn).
4. Cost: <= $0.02/PR.

**What counts as "handled" for a fire that no longer exists, stated and justified up front, not
chosen after seeing v2's numbers:** a WRONG fire absent from the baseline brief scores as handled
by elimination. This is the only interpretation consistent with the spec's own intent (no
misleading fire reaches a reviewer) and with the precedent §3.8 already set for `coupling.missing`
in the very same pre-registration. It is decided here, before v2 runs — not tuned afterward to
make a number pass.

**Run shape, corpus, model, cap: unchanged.** Same `bench/verify/run.ts`, same
`bench/verify/labels.json` corpus (49 PRs, six repos), same model (`claude-sonnet-5`), same
`scoreDiff`/`llm.verify.enabled: true` shape, same per-PR scoring (`scorePr`) and the same
decision rule above. Results appended to `bench/verify/results.md`/this file after the run,
exactly as the decision rule reads — a v2 cost FAIL stays a FAIL.

**Execution-only addendum (same day, mid-run).** The first v2 attempt was stopped partway (11 of
49 PRs scored, $0.1661) to add `--concurrency <N>` (bounded worker pool, default 1; the budget
reservation inside `scorePr` stays synchronous and non-reentrant, so it is atomic under
concurrency regardless of `N` — proved in `tests/bench/verify-lib.test.ts`'s `runPool` suite, not
just asserted) and `--resume <runDir>` (skips a PR already scored under `runDir`, and folds its
recorded `verification.usage` cost into the fresh `--max-usd` budget before any new call —
`lib.ts`'s `sumResumedSpend`/`isResumableOutcome`). **This changes nothing about what is measured
or how it is scored** — same `scorePr`, same candidates, same verifier call per PR, same decision
rule; it only changes how many PRs run at once and lets a stopped run pick up where it left off.
Restarted as `node bench/verify/run.ts --max-usd 3.9 --concurrency 6 --resume
~/.cache/opendrs/verify-study/2026-10-22T18-50-21-890Z` — the same $3.9 cap as before, now
applied on top of both the $1.0271 already spent in v1 and the $0.1661 already spent in this
same v2 run's first 11 PRs (resumed, not re-scored), keeping total v1+v2 spend under the $5 study
cap.

**Result (v2, run `2026-10-22T19-16-53-589Z`, model `claude-sonnet-5`, $0.9419 total / 49 scored
PRs, combined with v1's resumed 11 PRs' $0.1661 already inside that total — not double-counted).**
Applying the same decision rule, unchanged:

1. **Recall: PASS.** 1 of 14 traced true-useful facts wrongly dropped (bar ≤ 1) — same as v1;
   the confidence-field removal and the WRONG-fire scoring fix touch neither candidate selection
   nor the verifier's actual verdicts, so recall was never expected to move, and didn't.
2. **`coupling.missing` precision: PASS.** 14 of 18 noise fires handled — 4 by the deterministic
   detector classes (A–C, same as v1), 10 by the verifier alone (bar ≥ 13 of 18). One fewer
   verifier-handled fire than v1's 11 (both comfortably clear the bar; a single-run LLM call has
   some run-to-run variance at the margin, not a regression — nothing in either fix touches
   `coupling.missing` candidates or prompting).
3. **`contract.dependency` WRONG-fire precision: PASS.** 2 of 2 handled — both eliminated at the
   detector (confirmed again, independently of v1: neither WRONG fact appears in any baseline
   brief in this run either), 0 by the verifier (there was nothing live for it to act on, as
   expected).
4. **Cost: PASS.** $0.0192/PR (bar ≤ $0.02/PR), down from v1's $0.0210/PR — the dead
   `confidence` field's removal from every verified candidate's required output.

**Overall: ship.** One verifier failure recorded (`black/cache-dir`: a 60s Anthropic API timeout,
failed open per `src/brief/verify.ts`'s contract — 1 of 49 PRs, far under `checkStudyValidity`'s
50% invalidation threshold, so this is an ordinary transient provider hiccup, not a measurement
problem). Total spend across both runs: $1.0271 (v1) + $0.9419 (v2) = **$1.9690 of the $5 study
cap**. Full breakdown in `bench/verify/results.md`; raw per-PR JSON in
`~/.cache/opendrs/verify-study/2026-10-22T19-16-53-589Z/` (new work) and
`~/.cache/opendrs/verify-study/2026-10-22T18-50-21-890Z/` (the 11 PRs `--resume` picked up).
Shipped as opendrs 0.5.0.

## Default weights: re-centred intercept and repo-age scaling on ApacheJIT

**Status.** Pre-registered 2026-10-20, before any replay; run completed the same day. The
question, setup and decision rule below are unchanged from the pre-registration, with two
pre-registered choices resolved (the pre-registration left the exact candidate(s) and the
field-test-repo check optional): both candidate approaches were implemented, and the field-test
repositories were not re-scored (see Result).

**Question.** Do re-centred default weights reduce out-of-the-box saturation on mature
repositories? The [score-saturation experiment](#score-saturation-fixpattern-and-incident-granularity-on-apachejit)
rejected both `history.fixPattern` exclusion and file-level `history.incident` matching as
saturation fixes: neither moved the default-prior score distribution's spread, only its position,
and both fell short of the 25 % red-share-reduction bar. That experiment's own recommendation
(point 3) names the likely larger cause: diffusion and history signals are raw, un-normalized
counts that run high on an old, busy repository regardless of a specific PR's risk, which neither
variant touched. This asks whether changing where the score's default weights are centred, rather
than which signals fire, addresses that directly.

**Setup.**
- **Baseline.** ApacheJIT's default-prior (uncalibrated `DEFAULT_WEIGHTS`) red share (≥
  `thresholds.red`, 0.8) and yellow-or-red share (≥ `thresholds.green`, 0.3), and calibrated AUC,
  pooled on the test split exactly as reported in the score-saturation experiment above (red 25.6 %,
  yellow+red 60.8 %, AUC 0.823) — the same row cache, no new replay needed.
- **Field-test repositories, if feasible.** The six repositories from the
  [2026-10-19 field test](research/2026-10-19-field-test.md) (vite, black and the others), each re-scored with the
  candidate approach on fresh clones, to check whether a change tuned on ApacheJIT's distribution
  also helps the mature, actively-developed repositories the field test flagged as saturated. Not a
  hard requirement if cloning or scoring all six is too slow for the bench budget; ApacheJIT alone
  still answers the question, descriptively weaker.
- **Candidate approach(es).** Not chosen yet; at least one of:
  - Re-centre the model's intercept (or, equivalently, the default priors as a group) so the
    median commit lands mid-yellow instead of near red, without changing any individual signal's
    relative weight.
  - Scale `history.*` and `expertise.*` priors by a repo-age or repo-size factor (for example,
    divide by `log1p(repo age in days)` or `log1p(total commits)`), so an old repository's raw
    counts do not dominate the score the way they do today.
- **Metrics.** Same as the score-saturation experiment: default-prior red share and yellow-or-red
  share, score distribution SD/IQR, and calibrated AUC with a paired bootstrap against the current
  defaults.

**Decision rule.** Adopt a candidate as the new `src/` default when its default-prior red-share
drops by at least 25 % relative to the current defaults **and** its calibrated-AUC paired bootstrap
95 % CI against the current defaults includes 0 or is entirely positive (no significant loss) —
the same bar the score-saturation experiment used, so the two results are comparable. Otherwise:
reject, or ship conditionally with the reasoning recorded against the specific numbers.

**Candidates implemented.** Both bulleted approaches, reusing the existing row cache and the
already-downloaded ApacheJIT CSVs; no new clone, no new signal replay (`bench/apachejit/default-weights-experiment.ts`).
- **V1 (intercept re-centred).** Intercept shifted by a constant chosen from the **train** split's
  own default-prior median score (never test), so the median lands at mid-yellow (0.55 = midpoint
  of `[thresholds.green, thresholds.red)`). A pure logit shift: ranking, hence AUC, is unaffected
  by construction.
- **V2 (history/expertise scaled by repo age).** Of `history.*`/`expertise.*`, only the three
  unbounded log1p-count signals (`history.churn`, `history.prior_fixes`, `expertise.author_commits`)
  are each divided by `max(1, log1p(days since the project's earliest row-cache-resolved commit))`,
  computed per commit from the cached commit time — `history.incident` (0/1) and
  `expertise.owner_ratio` (already 0–1) are left alone, since dividing a bounded value does not
  match the "raw counts" diagnosis. Only one of the pre-registration's two scaling sub-variants
  (age, not total-commit count) was run.
- **V3.** V1 and V2 together.
- **Field-test repositories.** Not re-scored: both ApacheJIT candidates already reject decisively
  (see Result), and the pre-registration allowed skipping this when the bench budget does not
  support six fresh clones.

**Result.** 66,653 row-cache commits (the same coverage as the score-saturation experiment above).
Test-split base rate: 23.6 % buggy.

| Variant | Calibrated AUC | AUC gain vs V0 (95 % CI) | Default-prior red share (≥0.8) | Yellow+red share (≥0.3) | Red share, relative change |
|---|---:|---|---:|---:|---:|
| V0 (current) | 0.823 | — | 25.6 % | 60.8 % | — |
| V1 (intercept re-centred) | 0.823 | +0.0000 (0.0000 to 0.0000) | 40.3 % | 76.4 % | **+57.5 %** |
| V2 (history/expertise scaled by repo age) | 0.818 | −0.0052 (−0.0058 to −0.0046) | 33.9 % | 78.7 % | **+32.4 %** |
| V3 (both) | 0.818 | −0.0052 (−0.0058 to −0.0046) | 53.4 % | 94.6 % | **+108.9 %** |

Buggy rate within each default-prior tier (does green still mean low risk?):

| Variant | Green (buggy rate) | Yellow (buggy rate) | Red (buggy rate) |
|---|---|---|---|
| V0 | 9,667 (7.4 %) | 8,707 (22.9 %) | 6,312 (49.3 %) |
| V1 | 5,816 (4.8 %) | 8,928 (15.6 %) | 9,942 (41.7 %) |
| V2 | 5,267 (5.2 %) | 11,062 (16.9 %) | 8,357 (43.9 %) |
| V3 | 1,329 (2.0 %) | 10,172 (10.4 %) | 13,185 (35.9 %) |

Every variant moves saturation in the **wrong direction** — red and yellow+red share rise, not
fall — so none clears the 25 % relative *reduction* bar, and V2/V3 also lose calibrated AUC
significantly (CI entirely negative). The mechanism differs by candidate:

- **V1's premise does not hold on ApacheJIT.** The pre-registration assumed today's median sits
  near red; it does not. The train-split default-prior median is 0.307, barely past the
  green/yellow boundary. Moving it up to mid-yellow (0.55) necessarily pushes a large share of the
  distribution that was in green or low yellow into high yellow and red.
- **V2 backfires on sign, not magnitude.** `expertise.author_commits` carries a *negative*,
  protective weight (−0.3) of the same magnitude as `history.prior_fixes` (+0.3). Dividing all
  three signals' raw values by the same per-commit age divisor shrinks every contribution toward
  zero, but a mature project's author-commit counts are typically larger in magnitude than its
  prior-fix/churn counts, so the protective contribution shrinks by more than the risk
  contributions do — net, scores rise.
- Tier buggy rates still separate meaningfully in every variant (red is always riskier than
  yellow, yellow always riskier than green), so "green still means low risk" in a relative sense,
  but V1/V3 shrink green's *size* sharply (9,667 → 5,816 → 1,329 commits) while raising its buggy
  rate only modestly (7.4 % → 4.8 % → 2.0 %) — fewer commits get the fast path, not a cleaner one.

**Decision (pre-registered rule, applied exactly).**
- **V1.** Red-share relative change +57.5 % (an increase, not the required ≥25 % *decrease*) →
  **reject**. AUC-gain CI is non-negative only because the transform cannot affect ranking by
  construction — that is not evidence the candidate works.
- **V2.** Red-share relative change +32.4 % (an increase) and AUC-gain CI −0.0058 to −0.0046
  (significant loss) → **reject** on both counts.
- **V3.** Red-share relative change +108.9 % and the same significant AUC loss as V2 → **reject**.

**Recommendation for `src/` defaults.** No change. Neither candidate, implemented exactly as
pre-registered, reduces out-of-the-box saturation on ApacheJIT; both make it measurably worse, for
reasons specific to ApacheJIT's own score distribution and to one signal's sign. The
[score-saturation experiment](#score-saturation-fixpattern-and-incident-granularity-on-apachejit)'s
recommendation (point 3) — that diffusion/history signals need per-repo normalization — is not
disproved by this result, but this experiment's two literal operationalizations of "re-centre" do
not deliver it; a future attempt should test on a per-repo basis (e.g. a repo-relative percentile
transform) rather than a single global intercept shift or a single global division, and should
re-derive which signals are protective before scaling any of them.

**Caveats.**
- **ApacheJIT's pooled median is not "near red."** This is the central, non-obvious finding: the
  pre-registration's rationale assumed a near-red median, built from the qualitative field-test
  evidence on black/vite (not ApacheJIT). ApacheJIT's 15 mature Java projects are saturated in the
  sense that red/yellow shares are already substantial (60.8 % yellow+red) but the *median* commit
  is still just past green, so "re-centre to mid-yellow" is a shift in the wrong direction for this
  specific dataset.
- **Repo-age anchor is the dataset's visible window, not true repo age.** The earliest
  row-cache-resolved commit per project (train starts 2003 for most), not the actual repository
  creation date.
- **Only one scaling sub-variant was run** (age, not total-commit count) and **the field-test
  repositories were not re-cloned**; see Where.
- **No rename detection, no new history walk**: every signal value is the existing row cache's,
  unchanged; only the intercept shift and the age-based division are new.

**Outcome.** Rejected. Both pre-registered candidates make ApacheJIT's out-of-the-box saturation
worse, not better, when implemented exactly as specified: intercept re-centring because the
dataset's median score was never near red to begin with, and repo-age scaling because it shrinks a
protective signal (`expertise.author_commits`) more than it shrinks the risk signals it was meant
to tame. No `src/` default change is recommended on this evidence.

**Where.** `bench/apachejit/default-weights-experiment.ts`; results in
[`bench/apachejit/default-weights-experiment.md`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/default-weights-experiment.md).
No LLM calls, no API spend. No clones were made or deleted (the row cache and CSVs were already
cached).

## Score saturation: fixPattern and incident granularity on ApacheJIT

**Status.** Pre-registered 2026-10-19, before any run; run completed 2026-10-20. The question,
setup and decision rule below are unchanged from the pre-registration. Motivated by the field test
on six new
repositories ([research note](research/2026-10-19-field-test.md)): on mature, active repos (black,
vite) most non-trivial PRs scored red (0.80–0.96) regardless of size, and two causes were named
specifically: `history.fixPattern`'s broad regex counts Conventional-Commit housekeeping commits
(`fix(deps): update dependencies`, `chore(deps)`, `fix(ci)`, `fix(docs)`, `fix: typo`) as prior bug
fixes, and `history.incident`'s revert matching fires at the containing-folder level, so one old
revert in a monorepo directory flags hundreds of files it never touched.

**Question.** Do either or both changes reduce default-prior score saturation on ApacheJIT's test
split enough to recommend as new `src/` defaults, without a significant loss of calibrated ranking
quality?

**Variants**, applied to the existing full row cache (build `08355066ee67`, the same 15-project
replay behind the 0.823 pooled calibrated AUC quoted throughout this log), with every signal but
the two below held at its real, shipped value:

- **V0 (current).** Unchanged: `history.fixPattern` is the shipped default
  `\b(fix(es|ed)?|bug|hotfix|regression|incident|sev\d?|revert)\b`; `history.incident` matches a
  changed file against a past revert or incident by exact file path, or by the dirname of any file
  the revert/incident touched (folder level).
- **V1 (fixPattern excludes housekeeping scopes).** `history.fixPattern` becomes:

  ```
  ^(?!(?:deps?|dependencies|ci|docs?|build|chore|style|tests?)(?:\([^)]*\))?:)(?!\w+\((?:deps?|dependencies|ci|docs?|build|chore|style|tests?)\):)(?!fix:\s*typo\b).*\b(fix(es|ed)?|bug|hotfix|regression|incident|sev\d?|revert)\b
  ```

  i.e. the same keyword match, unless the subject opens with a Conventional-Commit header whose
  type or scope is `deps[/dependencies]`, `ci`, `docs`, `build`, `chore`, `style` or `test[s]`, or
  is the literal `fix: typo`. `history.incident` unchanged from V0.
- **V2 (incident at file level).** `history.incident` drops the folder-level branch: a changed file
  only counts as touched by a past revert/incident when the revert/incident's own file list
  contains that exact path (or an `.opendrs/incidents.jsonl` `paths` prefix, unaffected by this
  change). `history.fixPattern` unchanged from V0.
- **V3.** V1 and V2 together.

Implemented bench-only (`bench/apachejit/score-saturation-experiment.ts`): a bench-local
reimplementation of the two signal computations, run over one blobless clone and one `git log
--name-only --no-renames --format=...` spawn per project (sha, time, subject, body, files — same
shape as `src/git/history.ts`'s own log, minus the `-M` rename flag, which is what made earlier
history-replay attempts time out on the larger histories). `src/` is not touched. No LLM calls, no
API spend.

**Metrics**, on the dataset's official split, pooled excluding `apache/hadoop`:

- Calibrated AUC (`fitModel`, as shipped) and recall@10 %/30 % on the test split, with a paired
  bootstrap (2,000 resamples, test commits resampled together, same method as the change-coupling
  experiment) against V0 for each of V1/V2/V3.
- **Saturation**, scored with `DEFAULT_WEIGHTS` (uncalibrated, as a repo sees out of the box before
  running `calibrate`): the share of test commits at or above `thresholds.red` (0.8) and at or above
  `thresholds.green` (0.3, the yellow-or-red boundary — `src/policy/gate.ts`'s three-tier rule), plus
  the score distribution's standard deviation and interquartile range as a spread measure.
- **Field-repo fixPattern counts (secondary, descriptive).** ApacheJIT is Java and mostly pre-dates
  Conventional Commits; V1's effect there may understate its effect on a TypeScript/Python repo that
  uses them. One `git log --format=%s` per repo on fresh blobless clones of vitejs/vite, psf/black
  and cli/cli (the field test's two most-saturated repos and a third for contrast), counting commits
  matched by the V0 and V1 regexes, reported as a count and share, not an AUC.

**Decision rule**, applied the same way for each variant independently:

- **Adopt** a variant as the new `src/` default when its default-prior red-share drops by at least
  **25 % relative** to V0 (e.g. 40 % red → 30 % red or lower) **and** its calibrated-AUC paired
  bootstrap 95 % CI against V0 includes 0 or is entirely positive (no significant loss).
- Otherwise: **reject**, or **ship conditionally** (e.g. only the sub-variant that clears the bar,
  if V1 and V2 disagree) with the reasoning recorded against the specific numbers.

**Result.** 66,653 row-cache commits (train 41,967 of 41,969, test 24,686 of 24,690 — the same
coverage as every other ApacheJIT row in this log); every one also resolved to its own cloned
history, so no row kept a stale value by fallback.

| Variant | Calibrated AUC | AUC gain vs V0 (95 % CI) | Recall@10 % | Recall@30 % | Default-prior red share (≥ 0.8) | Default-prior yellow+red share (≥ 0.3) | Red share, relative change |
|---|---:|---|---:|---:|---:|---:|---:|
| V0 (current) | 0.823 | — | 29.7 % | 66.8 % | 25.6 % | 60.8 % | — |
| V1 (fixPattern) | 0.823 | +0.0002 (0.0001 to 0.0002) | 29.8 % | 66.8 % | 25.3 % | 60.6 % | −0.9 % |
| V2 (incident, file level) | 0.824 | +0.0009 (0.0005 to 0.0014) | 29.8 % | 66.9 % | 23.7 % | 57.9 % | −7.4 % |
| V3 (both) | 0.824 | +0.0010 (0.0006 to 0.0015) | 29.8 % | 67.0 % | 23.5 % | 57.6 % | −8.3 % |

Every variant's AUC-gain 95 % CI is non-negative (no loss), but none reaches the 25 % relative
red-share reduction the decision rule requires: **V1 −0.9 %, V2 −7.4 %, V3 −8.3 %**, all short of
the bar. V2 and V3 move the whole default-prior score distribution down slightly (mean 0.476 →
0.454/0.451), not just the red tier; spread (SD, IQR) is essentially unchanged across all four
variants, so neither change fixes saturation by widening the distribution, only by shifting it.

**Field-repo fixPattern counts** (descriptive; one `git log --format=%s` per repo, fresh blobless
clone, default branch HEAD):

| Repo | Commits | V0 matches (share) | V1 matches (share) | Relative drop |
|---|---:|---:|---:|---:|
| vite | 9,799 | 3,754 (38.3 %) | 2,945 (30.1 %) | 21.6 % |
| black | 2,401 | 472 (19.7 %) | 458 (19.1 %) | 3.0 % |
| cli | 12,367 | 1,588 (12.8 %) | 1,537 (12.4 %) | 3.2 % |

V1's share of matched commits drops by 21.6 % on vite (just under the 25 % bar on its own, and far
more than the 0.9 % seen pooled on ApacheJIT) but only 3 % on black and cli. This explains the
pooled ApacheJIT result: ApacheJIT is 15 mature Java projects that mostly pre-date Conventional
Commits, so V1 has little to exclude there, while vite is a heavy, current adopter of the
convention V1 targets. ApacheJIT alone understates V1's likely effect on a repo like vite.

**Decision (per variant, the pre-registered rule applied exactly).**
- **V1.** Red-share relative reduction 0.9 % < 25 % → **reject** as a global default on this
  evidence. Its much larger effect on vite (21.6 %) suggests it is a real fix for Conventional-
  Commit-heavy repos specifically, not for ApacheJIT's Java corpus — a case for a documented,
  project-specific `history.fixPattern` override rather than a changed global default.
- **V2.** Red-share relative reduction 7.4 % < 25 % → **reject** by the letter of the rule. But its
  AUC-gain CI is strictly positive (0.0005 to 0.0014, the only variant whose CI excludes 0 in the
  positive direction) and it directly fixes a *demonstrated* bug, not just a suspected one: the
  field test confirmed one 8-file revert flagging `history.incident = 1` on hundreds of unrelated
  files under `packages/vite/src/node/` on 5 of 8 sampled PRs. A signal that never costs AUC and
  measurably shrinks saturation, fixing a concretely observed false-positive mechanism, is worth
  shipping even short of the saturation bar.
- **V3.** Red-share relative reduction 8.3 % < 25 % → **reject** by the letter of the rule; carries
  V2's case plus V1's (weaker, Java-corpus-specific) one.

**Recommendation for `src/` defaults (for the orchestrator to implement separately).**
1. **Ship V2: match `history.incident` at file level only** (drop the folder-level branch in
   `src/signals/history.ts`'s `matchEvent`). Non-negative on every metric measured, the only
   variant with a strictly positive AUC-gain CI, and it fixes the one false-positive mechanism this
   experiment and the field test agree on.
2. **Do not change the global `history.fixPattern` default** on this evidence — the ApacheJIT
   saturation effect is too small (0.9 %) to justify a behavior change that also narrows what the
   regex excludes everywhere. Instead, document a `history.fixPattern` override excluding
   Conventional-Commit housekeeping scopes (the V1 regex above, or a simpler equivalent) as a
   suggested project-level config for repos that use the convention heavily — worth a one-line
   mention in the config docs, not a default flip.
3. Neither change alone resolves the field test's saturation finding (theme 1, theme 14): the
   larger share of it is diffusion/history signals being raw, un-normalized counts on an old, busy
   repo, which this experiment did not touch and the field test already flagged as a separate, larger
   fix (rank 14 in its fix list).

**Caveats.**
- **No rename detection.** The per-commit file lists come from `git log --name-only --no-renames`
  (not the shipped detector's `-M`), so a rename shows as a delete and an add rather than one path,
  for both the current commit's own changed files and the historical file-touch index. This
  understates `history.prior_fixes`'s true lookback count and can miss a file-level
  `history.incident` match across a rename, in V0's reproduction and every variant equally — it does
  not favor one variant over another, but it means every number here is a slight underestimate of
  the true signal's reach.
- **The AUC-gain decision rule's CI reading** treats a CI that is non-negative (includes 0, or is
  entirely positive) as "no significant loss," the same reading used in the change-coupling
  experiment; only V2's CI is the stronger "significant, positive" case.
- **ApacheJIT is Java and mostly pre-dates Conventional Commits**, which is exactly why V1 reads as
  a near-no-op pooled here despite the real, larger effect the field-repo count shows on vite.

**Where.** `bench/apachejit/score-saturation-experiment.ts`; results in
[`bench/apachejit/score-saturation-experiment.md`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/score-saturation-experiment.md).
No LLM calls, no API spend. The 15 ApacheJIT clones and the 3 field-repo clones were deleted after
the run.

**Outcome.** Rejected as a saturation fix per the pre-registered rule: none of V1/V2/V3 reached the
25 % relative red-share reduction the decision rule required. V2 (`history.incident` at file level)
was adopted separately as a correctness fix, not a saturation fix: folder-level matching flagged
unrelated files (confirmed on vite, where one old revert flagged hundreds of files under
`packages/vite/src/node/`), and the change carries no accuracy cost (AUC +0.0009, CI 0.0005 to
0.0014). V1 (the Conventional-Commits `fixPattern` exclusion) is documented as a per-repo override
in [`docs/configuration.md`](configuration.md#repositories-that-use-conventional-commits) rather
than shipped as a new default.

## Captain-fact lift on ApacheJIT

**Question.** Pre-registered 2026-10-19, before any run; the question, setup and decision rule
below are unchanged from the pre-registration. No LLM calls; no API spend. Spec §10.2 of
[`docs/specs/2026-10-19-captain-brief-design.md`](https://github.com/error-path/opendrs/blob/main/docs/specs/2026-10-19-captain-brief-design.md)
asks whether the captain brief's architecture facts predict ApacheJIT bugs enough to claim it in the
docs (they ship regardless, as decisions to sign off on, but the docs may only call a fact a bug
predictor if it clears the bar below):

1. On the ApacheJIT test split (2017–2019), what is the bug lift (buggy rate when the fact fires ÷
   base rate) of `contract.dependency` (a new Maven `pom.xml` or Gradle dependency; ApacheJIT is
   Java-only), `contract.api` (a public Java declaration removed or changed in a file with
   dependents), `contract.schema` (the default globs) and `layers.edge` (a new module→module import
   edge, `moduleDepth: 2`)?
2. The three signals [rejected as score features](#review-heuristic-signals) (`change.concurrency`,
   `change.safety_removed`, `tests.weakened`) separated buggy from clean commits on their own, on a
   5-project subset, before the model absorbed it. Do they clear the captain-fact bar on the full
   test split?

**Decision rule**, applied per fact type: a fact qualifies as a captain fact predictive of bugs when
its test-split lift is **≥ 1.2×** and it fires on **≥ 50 test commits**; otherwise it is logged as
such, with its measured lift and fire count. `contract.*` and `layers.edge` ship regardless (spec
§10.2: they are decisions to sign off on, not just bug predictors), but the docs may only claim bug
prediction for a fact that clears the bar. The three review signals are not currently wired as
facts; this result decides whether to add them.

**Setup.**
- Data: the dataset's official test split (2017–2019), pooled excluding `apache/hadoop` (no
  positive labels) — the same 24,686-commit pool as every other ApacheJIT row in this log.
- **`contract.dependency`, `contract.api`, `contract.schema`, `change.concurrency`,
  `change.safety_removed`, `tests.weakened`** are computed on the **full pooled test split**, from
  one `git log --no-walk --stdin -p --no-renames -U0` stream per repository (shas fed over stdin,
  `--ignore-missing` so an absent sha is skipped rather than failing the spawn), restricted to the
  split's own shas: one spawn per repository, never one per commit. `apache/hadoop` is still cloned
  and queried as the fallback repo for `hadoop-hdfs`/`hadoop-mapreduce` commits not found in their
  own (pre-2011) mirror, as the coupling experiment does.
  - `contract.api` and `change.*` reuse the shipped parser (`parseUnifiedDiff`,
    `changedLines`, `isPublicDeclaration`) on each commit's own diff, so the only new code is
    assembling that diff from the stream instead of `git diff`.
  - `contract.api`'s dependents (spec §6.3: a removed/changed declaration only counts with a
    dependent) are **approximated**, not read from the real import graph: one `git grep` pass per
    repository, at the project's pinned 2019 head, collects every `import` line once; a changed
    file's dependents are the distinct importers of its derived fully-qualified name (Maven/Gradle
    layout: `src/(main|test)/(java|kotlin)/...` with slashes turned to dots), or, when that layout
    is not matched, of its bare class name (a cruder fallback, flagged separately if it changes the
    result materially). This is a single-snapshot approximation (2019 imports for a 2003 commit),
    the same kind the benchmark's own caveats already use for the real import graph.
  - `contract.schema` and `contract.dependency` need no approximation: `contract.schema` is a path
    glob match on the diff's changed files (`src/architecture/contracts.ts`'s `DEFAULT_SCHEMA_GLOBS`
    plus the default empty `captain.contracts.paths`); `contract.dependency` reuses
    `addedPackages` (`src/architecture/manifests.ts`) exactly, reading the full before/after text of
    only the manifest files the diff stream shows changed (`git show <sha>^:path` /
    `git show <sha>:path`, a handful of spawns rather than one per commit, since most commits never
    touch a manifest).
  - `change.concurrency`, `change.safety_removed`, `tests.weakened` use the exact regexes archived in
    [`bench/apachejit/archive/2026-10-18-review-signals.patch`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/archive/2026-10-18-review-signals.patch),
    copied into the bench script since that code is not on `main`.
- **`layers.edge`** needs a real dependency graph at base and head, which is too slow to build for
  every test commit (spec §10.2 allows this): a **fixed random sample of 2,000 test commits**,
  drawn with `mulberry32`, seed recorded in the script and the result. `buildDependencyGraph`
  (`src/graph/graph.ts`) runs unmodified, at `captain.moduleDepth: 2`, on the commit's own repo
  clone (same fallback rule as above).
- No tuning: unlike the coupling experiment, none of these facts has a free parameter to choose on
  train, so only the test split is touched.

**Result.**

- Coverage: all 24,690 pooled test commits resolved to a diff (every project except
  `apache/hadoop`; 4 more than the 24,686 this log's other ApacheJIT rows quote, because the
  coupling experiment's separate history-walk missed those 4 shas in its own clones — this
  experiment's `git log --stdin -p --ignore-missing` stream found them).
- `layers.edge` sample: 2,000 of the 24,690 (seed `20261019`), 0 skipped (every graph pair built).

| Fact | Fires on (test commits) | Buggy when fires | Base rate | Lift | Qualifies (≥ 1.2×, ≥ 50 fires)? |
|---|---:|---:|---:|---:|---|
| `contract.dependency` | 992/24,690 | 34.6 % | 23.6 % | **1.467×** | Yes |
| `contract.api` (approximate dependents) | 8,595/24,690 | 40.5 % | 23.6 % | **1.718×** | Yes |
| `contract.schema` | 279/24,690 | 56.3 % | 23.6 % | **2.388×** | Yes |
| `layers.edge` (2,000-commit sample) | 19/2,000 | 26.3 % | 23.5 % | 1.117× | No |
| `change.concurrency` | 3,196/24,690 | 48.0 % | 23.6 % | **2.036×** | Yes |
| `change.safety_removed` | 5,127/24,690 | 42.1 % | 23.6 % | **1.788×** | Yes |
| `tests.weakened` | 1,508/24,690 | 28.3 % | 23.6 % | **1.202×** | Yes |

**Decision (spec §10.2's bar, applied exactly).**

- **6 of 7 qualify** as bug-predicting captain facts: `contract.dependency`, `contract.api`,
  `contract.schema`, `change.concurrency`, `change.safety_removed` and `tests.weakened` all clear
  1.2× lift on at least 50 firing test commits. `tests.weakened` clears it narrowly (1.202×).
- **`layers.edge` does not**: 1.117× lift on only 19 fires in the 2,000-commit sample, below both
  bars. It still ships (spec §10.2: a layering decision to sign off on, not just a bug predictor),
  but the docs may not claim it predicts bugs.
- The three review signals clearing the captain-fact bar does **not** reopen their
  [rejection as score features](#review-heuristic-signals): that was about whether they add ranking
  signal once size, history and the rest of the model already see the commit, a different and
  harder bar than "this subset of commits is buggier than average." They are not wired as captain
  facts yet; this result is the basis for doing so.

**Caveats.** `contract.api`'s dependents are a single-snapshot `git grep` approximation (2019
imports standing in for a point-in-time import graph), not the real per-commit graph; no rename
detection (`--no-renames`); merge commits show no diff under `git log -p`'s default, so they count
as resolved-but-non-firing rather than skipped. Full detail, including the bare-class-name fallback
for non-Maven/Gradle layouts, is in `bench/apachejit/captain-lift-experiment.md`.

**Verdict.** `contract.dependency`, `contract.api`, `contract.schema`, `change.concurrency`,
`change.safety_removed` and `tests.weakened` qualify as bug-predicting captain facts and the docs
may say so; `layers.edge` ships as a layering decision only, with no bug-prediction claim. The three
review signals remain out of the calibrated score (unchanged from their 2026-10-18 rejection) but
are now a candidate for the captain brief as informational facts — not yet wired into
`src/architecture/`.

**Where.** `bench/apachejit/captain-lift-experiment.ts` and
[`bench/apachejit/captain-lift-experiment.md`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/captain-lift-experiment.md). No
LLM calls; no API spend. The 15 full clones were deleted after the run.

## Change coupling on ApacheJIT

**Question.** Does `coupling.missing` (spec §6.1 of
[`docs/specs/2026-10-19-captain-brief-design.md`](https://github.com/error-path/opendrs/blob/main/docs/specs/2026-10-19-captain-brief-design.md):
files that historically change together, where a PR changed only one of them) predict ApacheJIT
bugs enough to ship as a captain-brief fact with specific thresholds, and does it also add ranking
signal to the calibrated score? Pre-registered 2026-10-19, before any run; the question, setup and
decision rule below are unchanged from the pre-registration.

**Setup.**
- Data: the dataset's official split (train 2003–2016, test 2017–2019), pooled excluding
  `apache/hadoop` (no positive labels) — the same commits as every other ApacheJIT row in this
  log: 41,969 train, 24,686 of 24,690 test (4 commits' shas were not found in any of the 15
  cloned histories).
- Compute `coupling.missing` per commit from the history strictly before it (the commit's own
  parent stands in for "the PR's base"), with `couplingPairs` (`src/architecture/coupling.ts`):
  the exact pure function the detector calls, so the experiment measures the shipped code, not a
  re-implementation of it. Per-commit file lists come from one blobless clone
  (`git clone --filter=blob:none --no-checkout`) and one `git log --name-only --no-renames` spawn
  per project (15 clones total, apache/hadoop included for the hadoop-hdfs/hadoop-mapreduce
  fallback); never one spawn per commit.
- Tuned `minSupport` ∈ {3, 5, 8} × `minConfidence` ∈ {0.5, 0.6, 0.75} (9 combinations) on the train
  split only (by train lift), then reported the test split once, at the combination chosen on
  train.
- **Lift:** the buggy rate of test commits where the fact fires, against the test split's base
  rate.
- **Score:** the calibrated model (the existing row cache's signals, no re-replay needed) with and
  without a `coupling.missing` signal (count of firing files, log1p), compared on test AUC with a
  paired bootstrap (2,000 resamples, test commits resampled together).

**Result.**

| minSupport | minConfidence | Fires (train) | Train lift |
|---:|---:|---:|---:|
| 3 | 0.5 | 16,051/41,969 | 1.144 |
| 3 | 0.6 | 12,651/41,969 | 1.170 |
| 3 | 0.75 | 8,715/41,969 | 1.188 |
| 5 | 0.5 | 9,531/41,969 | 1.189 |
| 5 | 0.6 | 6,850/41,969 | 1.203 |
| 5 | 0.75 | 3,647/41,969 | 1.195 |
| 8 | 0.5 | 5,156/41,969 | 1.219 |
| **8** | **0.6** | **3,415/41,969** | **1.221 (chosen)** |
| 8 | 0.75 | 1,546/41,969 | 1.196 |

At `minSupport: 8`, `minConfidence: 0.6` on the test split: fires on 1,800 of 24,686 commits
(7.3 %), 819 of them buggy (45.5 %), against a 23.6 % base rate — **lift 1.931×**. Calibrated test
AUC: 0.823 without `coupling.missing`, 0.823 with it (count of firing files, log1p); paired
bootstrap mean -0.0002, 95 % CI -0.0003 to -0.0001 — significant, but negative.

**Decision rule (spec §10.1), applied exactly.**
- Lift 1.931× ≥ 1.2× → **the fact ships**, with `minSupport: 8`, `minConfidence: 0.6` as the new
  defaults (`src/domain/config.ts`; `captain.coupling.enabled` stays `true`).
- AUC-gain 95 % CI -0.0003 to -0.0001 excludes 0, but in the negative direction: the rule asks for
  a significant *positive* gain, and this is a significant (if tiny) negative one → **it stays
  brief-only**. No signal or model-weight change.

**Caveats.** The per-commit file lists skip rename detection (`--no-renames`, for speed on the
larger histories; the shipped detector itself still uses `-M`), and the backtest never checks
whether a partner file still exists afterward (the shipped detector drops a fact when it does
not) — both make this backtest's firing count a slight overcount of what the real detector would
show on the same history. Full detail, including the "stays brief-only" wording's reasoning, is in
`bench/apachejit/coupling-experiment.md`.

**Verdict.** Merged, brief-only. `coupling.missing` ships as a captain-brief fact at its tuned
thresholds; it does not enter the calibrated score.

**Where.** `bench/apachejit/coupling-experiment.ts` and
[`bench/apachejit/coupling-experiment.md`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/coupling-experiment.md). No LLM
calls; no API spend. The 15 blobless clones were deleted after the run.

## Planned: LLM plus opendrs vs the LLM alone

**Status.** Pre-registered on 2026-10-18, revised the same day, then amended the same day again
before any spend (see Amendments, below). No API spend yet: paid LLM tests are paused until the
user approves Phase 1. The bench wiring for arm 2 (spec §13 phase 4) is **deferred by decision**:
it is not built until the user approves the paid experiment. The full plan, with the prompt
drafts, the context block, the literature and the power analysis, is in
[the research note, Part 5](research/2026-10-18-review-risk-heuristics.md#part-5-pre-registered-plan-for-the-next-llm-judge-experiment).

**Question.** Does an LLM reviewer plus opendrs beat the same LLM alone, by enough to justify any
extra tokens? It is not opendrs against the LLM. The three headline arms run on the same commits:
1. **The LLM alone:** a `/code-review`-style reviewer reporting findings with a severity.
2. **The LLM given opendrs's context:** the product's review brief, `renderBriefMarkdown(buildBrief(...))`
   (amended 2026-10-18; see Amendments, below) — score, top signals, history, blast radius, prior
   fixes and incidents, and the hunks to focus on.
3. **The LLM with opendrs as the decision layer:** its findings combined with opendrs's signals in
   the calibrated model, plus the `requireSafe` gate.

Routing the LLM to opendrs's riskiest commits is a secondary arm.

**Already measured, for free.** `bench/apachejit/judge-sim.ts` replays the cached Sonnet 5
judgements of the [LLM judge run](#structured-llm-judge-on-sampled-apachejit): 800 test commits,
204 buggy. Each ranking sends its riskiest 10 % of commits to review.

| Ranking | AUC | Bugs caught (of 204) | Precision | False-positive rate | LLM tokens per bug |
|---|---:|---:|---:|---:|---:|
| LLM alone (snippet count, then its risk) | 0.789 | 51 | 63.7 % | 4.9 % | 126 k |
| LLM alone (fitted on its own outputs) | 0.772 | 47 | 58.8 % | 5.5 % | 137 k |
| **LLM + opendrs as the decision layer** | **0.824** | **60** | **75.0 %** | **3.4 %** | **107 k** |
| opendrs alone, for reference | 0.817 | 56 | 70.0 % | 4.0 % | 0 |

- **The decision layer adds +0.035 to +0.052 AUC at no extra LLM tokens.** The paired bootstrap
  95 % CI against the fitted LLM-alone model is +0.026 to +0.077.
- **At a 30 % review budget the gain is small and not significant.** LLM + opendrs catches 131
  bugs against 122–125.
- **The gate.** With opendrs's score added to `requireSafe`, the buggy share of auto-approved
  commits falls from 5.3 % (12 of 228) to 3.5 % (7 of 198).
- **Routing at equal spend** flags 34–43 % more buggy commits than a random subset.
- **Caveat.** These numbers were measured on the same test commits used to look for them, so they
  are exploratory.

**Setup.**
- **Commits.** The same 800 seeded test commits, so every comparison is paired, plus 400 seeded
  training commits judged by arm 1 to fit arm 3.
- **Model.** Sonnet 5 at effort `low`, the same as the cached run.
- **Prompt.** The findings prompt: findings with P0–P3 priority, a trigger and a confidence; no
  findings is a valid answer.
- **Arm 2** adds the product's brief, `renderBriefMarkdown(buildBrief(...))`, at the product
  default `maxTokens: 2,500` (amended 2026-10-18; was a hand-designed block capped at 2,500
  characters). Mean input tokens may grow by at most 30 % (amended 2026-10-18; was 15 %).

**Hypotheses.** H1 and H2 are confirmatory, Holm-corrected; everything else is descriptive.
- **H1.** AUC(arm 3) − AUC(arm 1) has a paired bootstrap 95 % CI above 0, and a point estimate of
  at least +0.02.
- **H2.** AUC(arm 2, the LLM + the brief) − AUC(arm 1) has a CI above 0, and arm 2's LLM tokens
  per bug caught at a 30 % budget — including the brief's own tokens — are no higher than arm
  1's.
- **Descriptive:** recall, precision and false-positive rate at 10 % and 30 % budgets; tokens per
  bug; the gate with Wilson intervals; and whether the context makes the LLM copy opendrs
  (Spearman correlation with opendrs's score).
- **Power.** At n = 800, a +0.02 AUC gain is detectable at 80 % power. A +5-point recall gain at a
  30 % budget is not, so AUC is primary.

**Budget.** The Message Batches API is assumed throughout (half price). Recomputed 2026-10-18 for
arm 2's new +30 % input cap: arm 1 (L) Sonnet 5 findings ≈ $0.035 standard / $0.0175 batched a
commit; arm 2 adds +30 % input on ~6,000 input tokens ≈ +1,800 tokens × $2/M ≈ +$0.0036 standard
→ ≈ $0.0386 standard / $0.0193 batched.

| Item | Arithmetic | Estimate | Cap |
|---|---|---:|---:|
| Pilot (30 commits, L and O, standard API) | 30 × ($0.035 + $0.0386) | $2.2 | $3 |
| Arm 1 | 800 × $0.0175 | $14.0 | $15 |
| Arm 2 | 800 × $0.0193 | $15.4 | $17 |
| Arm 1 on 400 training commits | 400 × $0.0175 | $7.0 | $8 |
| **Total** | | **$38.6** | **$43** |

If the pilot's measured costs push the projected total above $43, drop "Arm 1 on 400 training
commits" first — arm 3 then cannot be fitted on fresh findings, only checked against the stale
cached fit — then shrink arm 2 to 600 test commits.

Out of budget, for later: the verify pass and verified-finding gate (R2, R3), and a cheap Haiku
review of every commit.

**Stop rules.**
- **Pilot first.** Stop if more than 1 of 30 replies fails the schema, if arm 1 costs more than
  $0.045 a commit, if arm 2's input is more than 35 % above arm 1's (amended 2026-10-18; was
  20 %), if more than 85 % of commits get a finding, or if more than 5 % of findings cite a
  missing hunk.
- **Caps.** Each arm has a `--max-usd` cap. A batch whose first 200 results show more than 2 %
  failures is cancelled.
- **No tuning on the test commits.** Any change after test results is a new, logged experiment.

**Amendments.**
- **2026-10-18, before any spend.** Arm 2 becomes "LLM + the opendrs review brief": its context
  block is `renderBriefMarkdown(buildBrief(...))` at the product default `maxTokens: 2,500`,
  replacing the plan's hand-designed block. Arm 2's input cap rises from +15 % to +30 % of arm
  1's mean input tokens, and the pilot stop rule from +20 % to +35 %. The budget is recomputed to
  ≈ $38.6 of ≤ $43. Reason: the product decided its default brief size; the experiment must
  measure the product as shipped. Full detail in
  [the research note, Amendments](research/2026-10-18-review-risk-heuristics.md#amendments).

**Where.** The plan is in [the research note, Part 5](research/2026-10-18-review-risk-heuristics.md#part-5-pre-registered-plan-for-the-next-llm-judge-experiment).
The free simulation is `bench/apachejit/judge-sim.ts`. The cached judgements are those of the
[LLM judge run](#structured-llm-judge-on-sampled-apachejit).

## Fit experiment and the calibrate refit

**Question.** Calibrated opendrs trailed the Kamei logistic regression on ApacheJIT (0.819 vs
0.821), and adding the Kamei features did not help ([Kamei features](#kamei-features)). Is the fit the
problem? The hypothesis was that `calibrate` pulls weights toward the default priors too hard.

**Setup.**
- Data: the cached replay rows of the ApacheJIT run. No new replay or clones were needed.
- Train: 41,967 replayed commits, 22,420 positive. Test: 24,686 commits, 5,818 positive.
- Variants refitted:
  - (a) `calibrate` as it was;
  - (b) no pull toward the priors, at each L2 in 10, 1, 0.1, 0.01;
  - (c) no negative resampling;
  - (d) exactly what `fitModel` did internally.
- Only an inner validation split of the training commits picks a row; test is never used to
  choose. No API cost.

**Result.**

| Variant | Chosen L2 | Test AUC | Recall@10 % | Recall@30 % |
|---|---:|---:|---:|---:|
| (a) `calibrate` as it was | 0.01 | 0.819 | 29.1 % | 66.1 % |
| (b) priors pull off | 0.1 | 0.817 | 29.7 % | 65.7 % |
| (b) priors pull off, at L2 0.01 | — | 0.822 | 29.5 % | 66.6 % |
| (d') same choice as (a), refitted on every training commit | 0.01 | **0.823** | **29.7 %** | **66.8 %** |
| Kamei LR (dataset metrics) | — | 0.821 | 29.6 % | 66.2 % |

- **The priors pull is not the gap.** At L2 0.01, priors on and off are within 0.001 AUC, and the
  strong penalties are never chosen.
- **Resampling is a no-op here.** ApacheJIT's training split is about half positive, so 5:1
  resampling keeps every negative.
- **The real gap.** `fitModel` held out the newest 20 % of the rows it was given for its reported
  metrics, and saved the fit on the oldest 80 % only. Variant (d) reproduces (a) exactly.

After the fix, the regenerated benchmark:

| Pooled, excluding `apache/hadoop` | AUC | Recall@10 % | Recall@30 % | F1 |
|---|---:|---:|---:|---:|
| opendrs, calibrated, before | 0.819 | 29.1 % | 66.1 % | 0.559 |
| opendrs, calibrated, after the refit | 0.823 | 29.7 % | 66.8 % | 0.568 |
| Kamei LR | 0.821 | 29.6 % | 66.2 % | 0.554 |

Per project, the refit is mixed:
- Most projects rose or held level, for example hadoop-hdfs 0.851 → 0.882 and hadoop-mapreduce
  0.867 → 0.888.
- groovy fell 0.692 → 0.609 and activemq 0.863 → 0.843.
- opendrs still leads the Kamei LR in 4 of 14 projects.

**Verdict.** Merged. `calibrate` now picks its penalty, decides whether to keep the priors, and
measures its held-out metrics on the 80 / 20 split. It then refits the chosen setting on every
labelled commit. `backtest` shows the recorded held-out metrics when there are no newer commits.
Pooled, opendrs now matches the Kamei LR within noise. It does not beat it.

**Where.** Commits `c14da1c` (fit experiment), `ad0d368` (fix), `35862bc` (regenerated benchmark).
- [`bench/apachejit/fit-experiment.md`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/fit-experiment.md) and `bench/apachejit/fit-experiment.ts`.
- [`bench/apachejit/results.md`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/results.md).
- [Calibration and backtesting](calibration.md#what-calibrate-fits-on).

## Review-heuristic signals

**Question.** AI code reviewers check for concurrency changes, removed error handling or guards,
and weakened tests. Do these, computed deterministically from the diff, add ranking signal? The
background is in the
[research note on how AI code reviewers judge PR risk](research/2026-10-18-review-risk-heuristics.md),
recommendations R4–R6.

**Setup.**
- Three new signals:
  - `change.concurrency`: 1 when a changed non-test code line uses a concurrency primitive;
  - `change.safety_removed`: log1p of deleted error-handling and guard lines, net per hunk;
  - `tests.weakened`: more assertion lines deleted than added, or a skip marker added.
- Replayed on 5 ApacheJIT projects (zookeeper, groovy, kafka, spark, zeppelin): 9,708 labelled
  commits, 44.6 % buggy. Calibrated per project and pooled, with and without the three signals on
  the same rows.

**Result.**

| Signal | Fires on | Buggy when it fires | Buggy otherwise | Fitted weight sign (5 projects) |
|---|---:|---:|---:|---|
| `change.concurrency` | 10.3 % | 68.7 % | 41.8 % | positive in all 5 |
| `change.safety_removed` | 15.4 % | 60.2 % | 41.7 % | near zero or negative in 4 |
| `tests.weakened` | 3.3 % | 48.1 % | 44.4 % | negative in all 5 |

| Calibrated test AUC | With the signals | Without |
|---|---:|---:|
| Pooled, 5 projects | 0.782 | 0.782 |
| zookeeper | 0.645 | 0.637 |
| groovy | 0.690 | 0.692 |
| kafka | 0.820 | 0.822 |
| spark | 0.756 | 0.756 |
| zeppelin | 0.672 | 0.671 |

**Verdict.** Rejected as score signals. They separate buggy from clean commits on their own, but
gave no improvement once size, history and the other signals were in the model: pooled calibrated
AUC was 0.782 with and without them, and per project the change ranged from −0.002 to +0.008.
`tests.weakened` was fitted a negative weight in all five projects. Whether they work as hard gate
rules or as review hints was not tested.

**Configuration.** So the experiment can be repeated exactly or deliberately varied:

- **Code.** opendrs 0.2.0 at commit `36a36c7` (bench build `d6ef98ecfa7a`), on top of `main` at
  `0699a9c`. The implementation is archived as
  [`bench/apachejit/archive/2026-10-18-review-signals.patch`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/archive/2026-10-18-review-signals.patch)
  (`src/` and `tests/` only), and the full benchmark report as
  [`2026-10-18-review-signals-results.md`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/archive/2026-10-18-review-signals-results.md).
  On `main` as of 2026-10-19, `git apply -3` applies it with one conflict in
  `src/signals/tests.ts`, which has since gained the exported `isTestPath`.
- **Signals.** Each reads only the diff's changed, non-comment lines in code files, outside test
  files unless stated:

  | Signal | Value | Default weight | Range |
  |---|---|---:|---|
  | `change.concurrency` | 1 when a changed line uses a concurrency primitive: Java's `synchronized`, `volatile`, locks, executors, atomics and concurrent collections, `wait`/`notify`/`lock`/`unlock` calls, `new Thread`, Go's `go func`, `Mutex`/`RwLock`/`WaitGroup`, Python's `threading`/`multiprocessing` | 0.2 | 0 or 1 |
  | `change.safety_removed` | `log1p` of deleted error-handling and guard lines, net of added ones per hunk: `catch`/`except`/`rescue`/`finally`, `throw`/`raise`, `assert`, null and `None` comparisons, Guava `check*` and `requireNonNull`, `Validate.*` | 0.2 | 0 to `log1p(10)` |
  | `tests.weakened` | 1 when test files lose more assertion lines than they gain (`assert*`, `expect(`, `verify(`, `.should`), or a skip marker is added (`@Ignore`, `@Disabled`, `pytest.mark.skip`, `xit`, `it.skip`, `t.Skip` and similar) | 0.3 | 0 or 1 |

- **Model.** The 0.2.0 `calibrate`: L2 logistic regression fitted on the oldest 80 % of labelled
  commits, with the newest 20 % held out to choose the penalty and whether to keep the priors.
- **Data.** A 5-project ApacheJIT subset (zookeeper, groovy, kafka, spark, zeppelin) on the
  official split, train 2003–2016 and test 2017–2019, chosen to keep the replay short. 9,708
  labelled commits, 44.6 % buggy; 4,299 test commits. No LLM judge.

**When to revisit.** Re-run with the archived patch if any of these change:

- **As captain facts rather than score signals.** The captain brief ships a fact when commits
  showing it are buggy at ≥ 1.2× the base rate. On this subset `change.concurrency` reached 1.54×
  (68.7 % against 44.6 %) and `change.safety_removed` 1.35×; `tests.weakened` only 1.08×. That rule
  did not exist when this ran, so a lift test on the full test split is the obvious next step.
- **As hard gate rules.** "Never auto-approve a PR that disables a test" is a policy, not a
  ranking question. This benchmark cannot test it.
- **The model.** These signals overlap size and churn. A model that handles correlated or
  non-linear features might use them where an L2 logistic regression could not.
- **The data.** The patterns are mostly Java-centric, and ApacheJIT is Java only. Repositories in
  other languages, or AI-written changes, may behave differently.
- **The baseline.** Compare against the current `calibrate` refit, not the 0.2.0 fit used here.

## Kamei features

**Question.** The Kamei LR uses four features opendrs lacked: entropy of the change across files
(ent), time since the files last changed (age), number of unique prior changes (nuc) and subsystem
experience (sexp). Does adding them close the gap?

**Setup.** The four features were added as opendrs signals, computed from git. All 15 ApacheJIT
projects were replayed and calibrated on the official split.

**Result.**

| Pooled, excluding `apache/hadoop` | AUC | Recall@10 % | Recall@30 % | F1 |
|---|---:|---:|---:|---:|
| opendrs, calibrated, without the four signals | 0.819 | 29.1 % | 66.1 % | 0.559 |
| opendrs, calibrated, with the four signals | 0.817 | 29.4 % | 65.4 % | 0.566 |
| Kamei LR | 0.821 | 29.6 % | 66.2 % | 0.554 |

opendrs led the Kamei LR in the same 4 of 14 projects as before: activemq, hadoop-mapreduce,
kafka and zeppelin.

**Verdict.** Rejected. The four features gave no significant improvement: pooled AUC moved from
0.819 to 0.817, recall@10 % from 29.1 % to 29.4 % and recall@30 % from 66.1 % to 65.4 %, all within
noise, while every replay paid for the extra history queries. The gap to the Kamei LR came from
how `calibrate` fitted its weights, not from missing features, which the
[fit experiment](#fit-experiment-and-the-calibrate-refit) then confirmed.

**Configuration.** So the experiment can be repeated exactly or deliberately varied:

- **Code.** opendrs 0.2.0 at commit `7af1abc` (bench build `5e4218379fda`), on top of `main` at
  `0699a9c`. The implementation is archived as
  [`bench/apachejit/archive/2026-10-18-kamei-features.patch`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/archive/2026-10-18-kamei-features.patch)
  (`src/` and `tests/` only). It still applied cleanly to `main` on 2026-10-19:
  `git apply bench/apachejit/archive/2026-10-18-kamei-features.patch`.
- **Signals**, each point-in-time (only history before the commit), `unknown` with no prior
  history or a shallow clone:

  | Kamei metric | Signal | Value | Default weight | Range |
  |---|---|---|---:|---|
  | ent | `diffusion.entropy` | Shannon entropy of changed lines over the files that have any, divided by `log2(n)`; 0 for one file | 0.2 | 0 to 1 |
  | age | `history.file_age` | `log1p` of the mean days since each pre-existing changed file last changed; 0 when only new files changed | 0 (sign left to calibration) | 0 to `log1p(3650)` |
  | nuc | `history.unique_changes` | `log1p` of distinct prior commits touching any changed file, over all history (no lookback window) | 0.05 | 0 to `log1p(1000)` |
  | sexp | `expertise.subsystem` | `log1p` of the author's prior non-merge commits touching a top-level directory this change touches (root files count as one directory) | −0.1 | 0 to `log1p(1000)` |

- **Model.** The 0.2.0 `calibrate`: L2 logistic regression fitted on the oldest 80 % of labelled
  commits, with the newest 20 % held out to choose the penalty and whether to keep the priors.
  This is the fit that 0.3.0 later replaced.
- **Data.** ApacheJIT, official split: train 2003–2016, test 2017–2019. All 15 projects replayed,
  pooled over 24,686 test commits (5,818 buggy), excluding `apache/hadoop`, which has no positive
  labels. Repository heads as listed in `bench/apachejit/results.md` at that commit; default
  `history` and `graph` settings; no LLM judge.

**When to revisit.** Re-run with the archived patch if any of these change, because each could
let the features add signal they could not add here:

- **The model.** These features overlap `diffusion.files`, `history.churn` and
  `expertise.author_commits`. A model that handles correlated or non-linear features
  (interactions, gradient-boosted trees) might use them where an L2 logistic regression could not.
- **The baseline.** Since 0.3.0, `calibrate` refits on all labelled commits (calibrated AUC 0.823).
  Compare against that refit, not against the 0.819 baseline used here.
- **The data.** ApacheJIT is large, mature Java projects. Smaller repositories, other languages,
  or AI-era histories with different change patterns may behave differently.
- **Per-project calibration.** Pooled numbers hide projects; check the ones where opendrs trails
  the Kamei LR.

## Structured outputs for the LLM judge

**Question.** In the first judged run ([LLM judge](#structured-llm-judge-on-sampled-apachejit)), the
judge's reply was malformed for 36 of 1,600 commits (2.3 %). Does constraining the reply to the
judge's JSON schema fix that?

**Setup.** The Anthropic provider sends the judge's JSON schema as a structured output. The 36
failed commits were judged again with the same model and prompt.

**Result.**

| | Judge failures |
|---|---:|
| Without structured outputs | 36 of 1,600 (2.3 %) |
| With structured outputs | 0 of 36 re-judged; 0 of 1,600 in the final run |

**Verdict.** Merged. The LLM-judge tables use the re-judged replies.

**Where.** Commit `a9f4882` (structured outputs), `59e07e3` (results);
[`bench/apachejit/results-llm.md`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/results-llm.md);
[Calibration and backtesting](calibration.md#with-the-structured-llm-judge).

## Structured LLM judge on sampled ApacheJIT

**Question.** Does opendrs's prompted LLM judge improve ranking? Is its `requireSafe` gate,
which auto-approves only when every hunk is classified safe, a useful filter?

**Setup.**
- Data: a seeded sample of 800 training commits (455 positive) and 800 test commits (204
  positive), excluding `apache/hadoop`.
- Judge: Claude Sonnet 5 with opendrs's judge prompt (prompt hash `678a59d397a9`), diffs cut to
  60,000 characters.
- Models compared with and without the `llm.*` signals.
- Cost: about $55 in API calls.

**Result.**

| Model (800 test commits) | AUC | Recall@10 % | Recall@30 % | F1 |
|---|---:|---:|---:|---:|
| opendrs, default priors | 0.776 | 23.5 % | 60.3 % | 0.518 |
| opendrs, default priors + LLM signals | 0.798 | 26.0 % | 63.2 % | 0.545 |
| opendrs, calibrated | 0.790 | 27.5 % | 56.9 % | 0.550 |
| opendrs, calibrated + LLM signals | 0.805 | 28.4 % | 60.8 % | 0.561 |
| Kamei LR (same commits) | 0.814 | 26.0 % | 63.7 % | 0.588 |

| `requireSafe` at `minConfidence` | Commits passing | Buggy among them |
|---:|---:|---:|
| 6 | 31.9 % | 5.9 % |
| 8 (default) | 28.5 % | 5.3 % |
| 9 | 22.4 % | 2.8 % |

The test sample's base rate is 25.5 % buggy.

| Risk category | Test commits flagged | Buggy among them |
|---|---:|---:|
| `logic_bug` | 393 | 38.9 % |
| `security` | 18 | 44.4 % |
| `performance` | 8 | 12.5 % |
| `structural` | 406 | 37.4 % |
| `complex` | 76 | 51.3 % |

**Verdict.** Merged, as an opt-in judge and gate.
- The gate is the win: the commits it passes are buggy at a fifth of the base rate.
- The ranking gain (about +0.02 AUC) is within noise on 800 commits.
- `logic_bug` and `structural` each flag about half the commits, which is why the categories rank
  poorly. The [research note](research/2026-10-18-review-risk-heuristics.md) proposes prompt
  changes to fix that.
- This sample was fitted before the refit in [fit experiment](#fit-experiment-and-the-calibrate-refit) and
  has not been re-run.

**Where.** Commits `2c9e452` and `59e07e3`;
[`bench/apachejit/results-llm.md`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/results-llm.md);
[LLM judge](llm-judge.md).

## ApacheJIT benchmark baseline

**Question.** How do default and calibrated opendrs compare with a logistic regression on the
classic Kamei JIT metrics, on a public benchmark with someone else's labels and split?

**Setup.**
- Data: [ApacheJIT](https://zenodo.org/records/5907002) (Keshavarz and Nagappan, MSR 2022),
  106,674 commits from 15 Apache Java projects, SZZ labels.
- Every labelled commit was replayed with opendrs's signals, computed from git alone.
- Models: default priors, `calibrate`'s fit on the training years, and a Kamei LR on the
  dataset's metrics.
- DRS-OSS is quoted from [its paper](https://arxiv.org/abs/2511.21964): a fine-tuned LLM on a
  different split.

**Result.**

| Model | AUC | Recall@5 % | Recall@10 % | Recall@30 % | Recall@50 % | F1 |
|---|---:|---:|---:|---:|---:|---:|
| opendrs, default priors | 0.771 | 13.6 % | 24.9 % | 59.6 % | 80.0 % | 0.473 |
| opendrs, calibrated | 0.819 | 15.5 % | 29.1 % | 66.1 % | 85.3 % | 0.559 |
| Kamei LR (dataset metrics) | 0.821 | 15.8 % | 29.6 % | 66.2 % | 85.4 % | 0.554 |
| DRS-OSS (published, other split) | 0.895 | 31.5 % | 50.3 % | 86.4 % | — | 0.641 |

Calibration raised AUC in 13 of 14 projects; hadoop-hdfs was the exception. opendrs led the
Kamei LR in 4 of 14 projects.

**Verdict.** Merged, as the project's benchmark. The calibrated row was later raised to 0.823 by
the refit ([fit experiment](#fit-experiment-and-the-calibrate-refit)). The gap to DRS-OSS is what LLM signals
would have to close.

**Where.** Commit `50060c5`; `bench/apachejit/run.ts`;
[`bench/apachejit/results.md`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/results.md);
[Calibration and backtesting](calibration.md#results-on-apachejit).

## Public-repository backtests

**Question.** Does the score rank later-fixed commits on real open-source repositories, with the
default priors and after `calibrate`, with nothing configured?

**Setup.**
- Runs: `opendrs calibrate`, then `opendrs backtest`, with opendrs 0.1.x, before the label horizon
  existed.
- Labels: reverts and SZZ blame on fix commits.
- Nine repositories (2026-10-15), up to 4,000 commits each.
- 18 more (2026-10-16), the newest 1,200–1,500 commits each.
- Held-out AUC is on commits newer than the calibration window.

**Result.**

| Run | Untuned: better than chance | Untuned AUC, all commits | Calibration vs default priors, held-out |
|---|---|---|---|
| 9 repositories | 9 of 9 | 0.58–0.70 | better in 9 of 9; median gain +0.04 |
| 18 repositories | 17 of 18 (serde 0.51) | median 0.71 | better in 11, flat in 1, worse in 6 |

**Verdict.** Kept as evidence. It led to two changes:
- `calibrate` keeps the default priors when the fit does not beat them on a validation slice.
- The label horizon: the newest commits' held-out AUC was near random (0.45–0.50 on tokio,
  terraform and eslint) because their bugs had not been found yet.

**Where.** Commits `1e557cd` (nine repositories) and `5442193` (18 repositories);
[Benchmark results](results.md).
