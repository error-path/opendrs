---
title: "What predicts a risky pull request: lessons from backtesting on 27 repositories"
description: "What the opendrs benchmarks on 27 public repositories and the ApacheJIT dataset say about predicting which changes later need a fix: what ranked risk, what added nothing, and where the labels mislead."
date: 2026-11-20
---

# What predicts a risky pull request: lessons from backtesting on 27 repositories

Simple signals from git (size, spread, file history, author experience) rank later-fixed commits
better than chance on almost every repository we tried, and fitting them to a repository's own
history usually helps, but not always. Several ideas that sound like they should help (reviewer
checklist patterns, more of the classic defect-prediction metrics, re-centred default weights)
added nothing or made things worse. The largest source of error is not the model but the labels.

This note collects results already published in the [benchmark results](../results.md),
[calibration](../calibration.md) and [experiment log](../experiments.md) pages. It runs nothing
new. Every number below links to the page it comes from.

## The question

Given a pull request and the repository's history, can you tell, before merging, which changes
are more likely to need a fix later? Not "is this change correct", which is a code review's job,
but "where should a reviewer spend attention, and what is safe to wave through?"

## Setup in brief

opendrs computes signals modelled on the features of Meta's Diff Risk Score
baseline, all from git alone: changed lines and files, how many directories and authors are
involved, prior fixes and reverts in the touched files, branch-keyword complexity, author
experience, missing or deleted tests, and how many files import the changed ones. The full list
is on the [signals page](../signals.md). A logistic regression combines them into a 0 to 1 score.
It ships with hand-set prior weights; `calibrate` refits them on a repository's own history.

A commit counts as positive (risky) if it was later reverted, or if a later fix commit's deleted
or modified lines blame back to it (an SZZ-style label). These are "later needed a fix" labels,
not production incidents ([calibration: labels](../calibration.md#labels-which-commits-count-as-incident-linked)).

Two kinds of data:

- **27 public repositories** across JavaScript, Python, Go, Rust, Java, Ruby and more: nine with up to 4,000 commits each, 18 more with
  their newest 1,200 to 1,500 commits, all with no configuration
  ([results](../results.md)).
- **ApacheJIT**, a public benchmark of 106,674 commits from 15 Apache Java projects, scored on its
  official held-out years (2017 to 2019): 24,686 commits, 5,818 labelled buggy
  ([calibration: ApacheJIT](../calibration.md#results-on-apachejit)).

The main metrics are AUC (0.5 is random) and "caught at X %": the share of later-fixed commits
that land in the riskiest X % of commits. A random ranking catches X % at X %.

## What worked

**Untuned signals rank risk better than chance almost everywhere.** With the default weights, AUC
over all replayed commits was 0.58 to 0.70 on the first nine repositories, and the median was
0.71 on the next 18. The riskiest 10 % of commits held 15 % to 45 % of the later-fixed ones,
against 10 % for a random pick. The one exception was serde-rs/serde, at 0.51
([results](../results.md#what-the-broader-run-adds)). That is useful for triage, and far from a
verdict on any single PR.

**Fitting to your own history usually helps.** On held-out commits, calibration beat the default
weights in all nine of the first repositories, with a median AUC gain of +0.04. On ApacheJIT it
raised pooled AUC from 0.771 to 0.823, and improved all 14 projects with positive labels
([calibration](../calibration.md#results-on-apachejit)).

**Git-only signals tie the classic just-in-time defect metrics.** On ApacheJIT, calibrated opendrs
reached AUC 0.823 and caught 66.8 % of buggy commits in its riskiest 30 %. A logistic regression on
the dataset's own classic metrics (Kamei et al.) reached 0.821 and 66.2 %. That is a tie within
noise, not a win. Per project, opendrs was ahead in 4 of 14 and behind in 10, by up to 0.15 AUC on
groovy ([calibration](../calibration.md#results-on-apachejit)).

**How the model is fitted mattered more than which features it has.** The gap to the Kamei
regression closed when `calibrate` refitted the saved weights on all training commits instead of
the oldest 80 %: AUC 0.819 to 0.823 ([experiments](../experiments.md#fit-experiment-and-the-calibrate-refit)).
Adding features did not do that, as the next section shows.

**An LLM works better as a filter than as a ranker.** On an 800-commit ApacheJIT sample, a
prompted LLM judge raised AUC by about 0.02, within noise of the Kamei baseline. But the commits it
called safe at its default confidence (28.5 % of them) were buggy at 5.3 %, against a 25.5 % base
rate ([calibration: LLM judge](../calibration.md#with-the-structured-llm-judge)).

## What did not work, or surprised us

**Calibration hurt on a third of the smaller repositories.** On the 18-repository run it helped in
11, was flat in 1 and made held-out AUC worse in 6, for example eslint 0.48 to 0.40 and requests
0.79 to 0.71. Two of those six, fastapi and laravel, had fewer than 15 held-out positives. Since then,
`calibrate` keeps the default weights when the fit does not beat them on a validation slice of the
repository's own history ([results](../results.md#what-the-broader-run-adds)).

**Reviewer-checklist patterns predict bugs but add nothing to the score.** Commits that touch
concurrency primitives were buggy 68.7 % of the time against 41.8 % otherwise, and commits that
remove error handling 60.2 % against 41.7 %, on five ApacheJIT projects. Yet calibrated AUC was
0.782 with and without these signals, and a "tests weakened" signal was fitted a negative weight in
all five projects. They overlap with size and churn, which the model already has
([experiments: review-heuristic signals](../experiments.md#review-heuristic-signals)). They are
now shown as review hints in the brief rather than scored.

**More classic metrics did not help.** Adding the four Kamei features opendrs lacked (change
entropy, file age, number of unique prior changes, subsystem experience) moved pooled AUC from
0.819 to 0.817, within noise, while every replay paid for the extra history queries
([experiments: Kamei features](../experiments.md#kamei-features)).

**Files that usually change together did not help the score either.** A "co-changed file missing
from this PR" signal had a 1.931x bug lift on ApacheJIT, but adding it to the score left AUC at
0.823, with a confidence interval just below zero
([experiments: change coupling](../experiments.md#change-coupling-on-apachejit)). On 1,010 merged
PRs from six active repositories, none of its 45 flags drew reviewer comments, and later
fixes landed there no more often than elsewhere in the same PR (0.92x), so it was demoted
([experiments: outcome labels](../experiments.md#outcome-labels-on-active-public-repos)).

**The obvious fix for score saturation made it worse.** On mature, busy repositories most
non-trivial PRs scored red regardless of size
([field test](2026-10-19-field-test.md)). Re-centring the default intercept was expected to spread
scores out. On ApacheJIT it raised the share of red scores from 25.6 % to 40.3 %, because the
pre-registered premise (a median score near red) did not hold
([experiments: default weights](../experiments.md#default-weights-re-centred-intercept-and-repo-age-scaling-on-apachejit)).

**The newest commits look safe because nobody has found their bugs yet.** Held-out AUC on the
newest 20 % of commits was 0.45 to 0.50 on tokio, terraform and eslint, while the same model scored
0.68 to 0.75 over all commits. Recent commits are labelled clean only because their fixes have not
landed. `calibrate` and `backtest` now leave out the newest 60 days of history by default
([calibration: label horizon](../calibration.md#label-horizon-the-newest-commits-are-left-out)).

## Limits of the data

- **The labels are proxies.** SZZ blames whoever last touched a line, which is sometimes a
  reformat. A fix pattern that matches "fix typo" adds false positives, and incidents fixed by a
  config change never appear in git ([limitations](../limitations.md#the-model-and-its-labels)).
- **Positive rates vary from 4 % (spring-boot) to 29 % (cargo)**, which says as much about each
  project's commit-message habits as about its bugs ([results](../results.md#what-the-nine-repository-run-shows)).
- **Small samples swing.** With fewer than about 50 positives, numbers move a lot between runs
  ([calibration: reading the metrics](../calibration.md#reading-the-metrics)).
- **The public-repository runs predate the label horizon.** Re-running them with it should mostly
  change the held-out column ([results](../results.md#a-broader-run-18-more-repositories)).
- **ApacheJIT is Java only.** Its projects are large and mature. A model that reads the diff does
  better: the published DRS-OSS model, a fine-tuned LLM on a different split of the same dataset,
  reports AUC 0.895, which is a reference point rather than a like-for-like comparison
  ([calibration](../calibration.md#results-on-apachejit)).

## Check it on your own repository

The numbers that matter are the ones on your own history.
`npx @error-path/opendrs backtest` ranks your past commits with the default weights, and
`npx @error-path/opendrs calibrate` fits them and reports held-out results; the steps and how to
read them are on the [calibration page](../calibration.md). If you record real incidents in
`.opendrs/incidents.jsonl`, they become the strongest labels the fit has.
