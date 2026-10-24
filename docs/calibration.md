---
title: "Calibration and backtesting"
description: "Measure how well a PR risk score ranks your own past commits with opendrs backtest, fit the weights to your repository with opendrs calibrate, and pick an auto-approval threshold from the capture rates."
---

# Calibration and backtesting

opendrs ships with hand-set prior weights. They rank obvious cases sensibly (a typo fix scores
low, a large untested change to a widely imported file scores high), but they have never seen your
repository. `opendrs backtest` tells you how well a model ranks your past commits, and
`opendrs calibrate` fits the weights to them.

```sh
npx @error-path/opendrs backtest                      # default priors on your history
npx @error-path/opendrs calibrate                     # writes .opendrs/model.json
npx @error-path/opendrs backtest                      # default vs calibrated
npx @error-path/opendrs calibrate --since 2025-10-01 --max-commits 5000
```

Commit `.opendrs/model.json`. It is used from then on, and the GitHub Action reads it from the PR's
base commit. Because `.opendrs/**` is a blocked path, a PR that updates the model always gets a
human review.

## Labels: which commits count as incident-linked

Calibration needs to know which past commits caused problems. opendrs labels a commit positive
from three sources, from strongest to weakest:

1. **Incidents you record** in `.opendrs/incidents.jsonl` (below).
2. **Reverts.** A commit named in "This reverts commit <sha>" is positive.
3. **SZZ-lite.** For each commit whose subject matches `history.fixPattern` (by default fix, bug,
   hotfix, regression, incident, sev, revert), opendrs blames the lines that commit deleted or
   modified, at its parent. The commits that last touched those lines are positive.

Every other non-merge commit is negative. These labels are noisy. SZZ blames whoever last touched
a line, which is sometimes a reformat or a rename. A fix pattern that matches "fix typo" adds false
positives, and incidents fixed by config or infrastructure changes are invisible. Recorded
incidents are the best way to reduce the noise.

### Label horizon: the newest commits are left out

A commit's bug is usually found and fixed weeks or months after it lands, so most of the newest
commits are labelled negative only because nobody has fixed them yet. In our benchmarks the
newest 20 % of commits ranked near random (AUC 0.45 to 0.50 on tokio, terraform and eslint) while
the same model scored 0.68 to 0.75 over all commits. `calibrate` and `backtest` therefore leave out
every commit newer than the newest replayed commit's time minus `history.labelHorizonDays`
(default 60). Those commits are neither fitted on nor evaluated, but they stay in the history, so
their fixes still label older commits. Both commands report how many were left out, for example
"120 commits newer than 60 days excluded from evaluation (their bugs may not be found yet)". The
80 / 20 time split then applies to the remaining commits.

Override it for one run with `--label-horizon-days <n>`. Set it to `0` to use every commit, as
earlier versions did. Raise it when your bugs typically surface slowly (for example infrequent releases).

### What `calibrate` fits on

`calibrate` decides everything on the oldest 80 % of the labelled commits. It picks the penalty
by a second time split inside them, and keeps the default priors if the fit does not rank that
split's newest commits better. It then scores that oldest-80 % fit on the newest 20 %. Those are
the held-out numbers it prints and records as `metrics` in the model file.

The weights it writes are the same setting refitted on every labelled commit, so the newest fifth
of your history is not thrown away. `trainedOn` in the model file covers that whole window. When the
priors are kept, nothing is refitted: the model file holds the priors and `trainedOn` covers the
oldest 80 %, as before.

## `.opendrs/incidents.jsonl`

One JSON object per line. Each object names the change that caused an incident, the change that
fixed it, or both:

```jsonl
{"inducing": "3f2a9c1e0b7d4a5e8f1c2b3a4d5e6f708192a3b4", "note": "SEV-1423: checkout 500s after cache key change"}
{"fix": "b81d07aa5c3e2f1d0a9b8c7d6e5f4a3b2c1d0e9f", "note": "SEV-1431: inducing commit unknown, found by blame"}
{"inducing": "9c44e2107a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d", "fix": "1e0f3b5d2c4a6e8f0b1d3c5e7a9b2d4f6a8c0e1b", "paths": ["services/payments/"], "note": "SEV-1450"}
```

| Field | Meaning |
|---|---|
| `inducing` | sha of the commit that caused the incident. Labelled positive directly. |
| `fix` | sha of the commit that fixed it. Its deleted and modified lines are blamed (SZZ), and the blamed commits are labelled positive. |
| `paths` | files or folders involved. Used by the `history.incident` signal for later PRs that touch them. |
| `note` | free text for people; ignored by opendrs. |

Use full 40-character shas of commits reachable from the default branch. A postmortem template that asks
for "the commit that caused this" makes the file cheap to maintain. `calibrate` and `backtest` warn
about an `inducing` sha that is not in the indexed history or a `fix` sha that does not resolve in
the repository, and do not count it. They also report how many commits they skipped because they
could not be read (for example objects missing from a partial clone).

### Recording incidents with `opendrs feedback`

`opendrs feedback` appends the line for you and resolves refs to full shas:
`opendrs feedback --inducing <sha|ref> [--fix <sha|ref>] [--paths a,b] [--note "SEV-12: ..."]`.
When you only know the PR, `opendrs feedback --pr <number> --was-incident` finds the commit that
landed it on the current branch (a squash commit whose subject ends in `(#N)`, or every commit a
`Merge pull request #N` merge brought in) and records each as `inducing`. A pair already in the
file is skipped. Commit the file afterwards: `.opendrs/**` is a blocked path, so that PR is routed
to a human reviewer on purpose.

## Results on ApacheJIT

[ApacheJIT](https://zenodo.org/records/5907002) (Keshavarz and Nagappan, MSR 2022) is a public
benchmark of 106,674 commits from 15 Apache Java projects, labelled by SZZ with JIRA links. We
replayed its commits with opendrs's own signals, fitted `calibrate`'s model on the official
training years (2003–2016), and scored the held-out years (2017–2019). The Kamei row is a logistic
regression on the dataset's classic JIT metrics for the same commits. The DRS-OSS row is quoted
from [its paper](https://arxiv.org/abs/2511.21964), which used a fine-tuned LLM on a different
split, so read it as a reference point, not a like-for-like comparison.

Held-out commits, excluding `apache/hadoop` (it has no positive labels): 24,686 commits, 5,818
labelled positive.

| Model | AUC | Caught at 5 % | at 10 % | at 30 % | at 50 % | F1 |
|---|---:|---:|---:|---:|---:|---:|
| opendrs, default priors | 0.771 | 13.6 % | 24.9 % | 59.6 % | 80.0 % | 0.473 |
| opendrs, calibrated | 0.823 | 15.7 % | 29.7 % | 66.8 % | 85.5 % | 0.568 |
| Kamei LR (dataset metrics) | 0.821 | 15.8 % | 29.6 % | 66.2 % | 85.4 % | 0.554 |
| DRS-OSS (published, other split) | 0.895 | 31.5 % | 50.3 % | 86.4 % | — | 0.641 |

- **Calibration helps.** Fitting the weights raised AUC from 0.771 to 0.823 pooled, and in all 14
  projects with positives (groovy only barely, 0.605 → 0.609).
- **opendrs matches the classic JIT metrics pooled.** Calibrated opendrs reaches 0.823 AUC and
  catches 29.7 % / 66.8 % of buggy commits in its riskiest 10 % / 30 %. The Kamei regression
  reaches 0.821, 29.6 % and 66.2 %. That is a tie within noise, not a win.
- **Per project, opendrs is ahead in 4 of 14 and behind in 10.** It leads on activemq, kafka,
  hadoop-mapreduce and zeppelin. It trails by up to 0.15 AUC on groovy (0.609 vs 0.760) and 0.09
  on zookeeper. Note that opendrs computes its signals from git alone, with no issue tracker.
- **Refitting on all training commits closed the pooled gap.** Earlier versions fitted the saved
  weights on the oldest 80 % only and scored 0.819. The rest of the fit is unchanged, so the gain
  comes from the newest training years alone
  ([`bench/apachejit/fit-experiment.md`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/fit-experiment.md)).
- **The refit is not a win everywhere.** Most projects moved up or stayed level, for example
  hadoop-hdfs 0.851 → 0.882 and hadoop-mapreduce 0.867 → 0.888. activemq fell 0.863 → 0.843 and
  groovy fell 0.692 → 0.609. For those two, adding the newest training years made the test-year
  ranking worse.
- **A model that reads the diff ranks much better.** DRS-OSS catches 86 % of buggy commits in its
  riskiest 30 %, against 66 % here. That gap is what an LLM signal such as `llm.semantic` would have to
  close, and this benchmark is how to measure it.

Every experiment behind these numbers, including the ones that did not help, is in the
[experiment log](experiments.md).

The full report, with per-project numbers, coverage and caveats, is in
[`bench/apachejit/results.md`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/results.md); [`bench/apachejit/README.md`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/README.md)
explains how to reproduce it.

### With the structured LLM judge

This sample was fitted before the refit described above, and has not been re-run since.

A second run sampled 800 training and 800 test commits (excluding `apache/hadoop`) and had Claude
Sonnet 5 judge each one with opendrs's prompt (about $55 in API calls). The first run's judge failed on 36
of 1,600 commits (2.3 %, malformed replies). With structured outputs (the reply is constrained to
the judge's JSON schema) all 36 were judged again without a failure; the tables use those judgements.

| Model (800 test commits, 204 positive) | AUC | Caught at 10 % | at 30 % | F1 |
|---|---:|---:|---:|---:|
| opendrs, default priors | 0.776 | 23.5 % | 60.3 % | 0.518 |
| opendrs, default priors + LLM signals | 0.798 | 26.0 % | 63.2 % | 0.545 |
| opendrs, calibrated | 0.790 | 27.5 % | 56.9 % | 0.550 |
| opendrs, calibrated + LLM signals | 0.805 | 28.4 % | 60.8 % | 0.561 |
| Kamei LR (same commits) | 0.814 | 26.0 % | 63.7 % | 0.588 |

The `requireSafe` gate, applied to the same test commits (25.5 % of them buggy):

| `minConfidence` | Commits passing | Buggy among them |
|---:|---:|---:|
| 6 | 31.9 % | 5.9 % |
| 8 (default) | 28.5 % | 5.3 % |
| 9 | 22.4 % | 2.8 % |

- **The gate is the bigger win.** At the default confidence of 8, the commits the judge calls
  all-safe are buggy at 5.3 %, a fifth of the 25.5 % base rate. As in RADAR, it is a filter in front
  of auto-approval, not a replacement for the score.
- **The risk categories add ranking signal.** They raise AUC by about 0.02 for both the default and
  the calibrated model. With 800 test commits that is within noise of the Kamei baseline, so treat
  it as a direction, not a result.

The full report is [`bench/apachejit/results-llm.md`](https://github.com/error-path/opendrs/blob/main/bench/apachejit/results-llm.md).

## Reading the metrics

**captured@X%.** Sort the commits by score, gate the riskiest X %, and count what share of
positive commits fall inside that set. `captured@10% = 35 %` means: if a human had looked only at
the riskiest tenth of commits, they would have seen 35 % of the incident-linked ones. A random
ordering captures X % at X %, so compare against that. This is the metric Meta reports for DRS.

**AUC.** The probability that a randomly chosen positive commit scores higher than a randomly
chosen negative one. 0.5 is random. Published just-in-time defect prediction studies commonly
report 0.7 to 0.8.

**Base rate.** The share of commits labelled positive. With a base rate of 3 %, a model can look
accurate while catching nothing, which is why opendrs reports capture rates instead of accuracy.

**Commits and positives.** With fewer than about 50 positives the numbers move a lot between runs
and windows; read them as rough. `backtest` evaluates the calibrated model only on commits newer
than its training window (`trainedOn.to` in the model file), so it never scores a commit it was
trained on. It also reports the default priors on those same held-out commits; compare those two
rows, not the calibrated row with the all-commits default row. When no replayed commit is newer
than the training window, the calibrated model has no held-out rows of its own. That is the usual
case right after `calibrate`, because the model is refitted on every labelled commit. `backtest`
then shows a `calibrated (recorded)` row with calibrate's own held-out evaluation (the oldest-80 %
fit scored on the newest 20 %) and says so in a note. Once newer commits have landed and their
labels have matured past the label horizon, `backtest` scores the saved model on them instead.

**Meta's numbers.** `backtest` prints Meta's published LR baseline (18.7 % / 27.9 % / 84.6 % of
SEVs captured at 5 / 10 / 50 % gated) for orientation. Those come from Meta's own code and SEV
data, which differ from yours in size, labels and practice. They are not a target.

## Focus hit rate

`opendrs backtest --brief` adds one more, free measurement: for every commit a later fix's SZZ-lite
blame points back to, did the review brief's "Review first" hunks (built at that commit's own point
in time) contain at least one of the lines that fix changed? This is report-only — it never gates
anything — and is the signal the ranking weights in `src/brief/rank.ts` get tuned against over time.
It needs no LLM and no incident log beyond what `calibrate`/`backtest` already use.

```sh
npx @error-path/opendrs backtest --brief
```

The output adds one line: the hit rate, and the average share of each commit's changed lines that
fell inside its focus hunks (the same shape as Meta's reported 53.85 % hit rate / 26.28 % share for
their top-2 hunks — see the approved spec for the comparison).

## Choosing thresholds

The `green` threshold decides what can be auto-approved, so choose it from the capture curve rather
than from the score itself. For example, if gating the riskiest 50 % of commits captures 85 % of
positives on your history, a green threshold at the 50th percentile means about 15 % of
incident-linked commits would have been eligible for auto-approval, before the AI review, the size
cap, the hard blocks and sampling stop some of them.

Percentile thresholds make this explicit:

```yaml
thresholds:
  mode: percentile      # needs a calibrated model with score percentiles
  green: 50
  yellow: 90
  red: 95
```

Re-run `calibrate` every few months, or after large changes to the codebase or team, and compare
with `backtest` before you commit the new model.
