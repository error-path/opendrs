# opendrs: An Open-Source, No-LLM Reproduction of Meta's Diff Risk Score for Pull Requests

<!-- Draft. Section drafts were generated with a local 7B model, then every number and claim was
re-checked by hand against the repository files named in the comments. -->

## Abstract

Meta's Diff Risk Score (DRS) predicts how likely a code change is to cause an incident, and gates
low-risk changes for faster landing. DRS itself is internal to Meta. We present opendrs, an
open-source tool that reproduces the DRS approach for any git repository: a calibrated 0-1 risk
score from a logistic model over signals computed from git alone (change size, diffusion, file
history, critical paths, complexity, author expertise, missing tests and import-graph blast
radius). The default needs no LLM and no API key; an optional LLM judge can only raise a score.
opendrs ships as a GitHub Action, a command-line tool and a Model Context Protocol (MCP) server for
coding agents. On the public ApacheJIT benchmark (official 2017-2019 test years, excluding
`apache/hadoop`), calibrated opendrs reaches AUC 0.823 and catches 66.8 % of buggy commits in its
riskiest 30 %, on par with a logistic regression on the classic just-in-time metrics (0.821,
66.2 %), and below the published DRS-OSS LLM classifier (0.895, 86.4 %), which used a different
split. We also report replays on 27 further open-source repositories and the tool's use on its own
pull requests, and we state the limits of each comparison.

## 1 Introduction

AI agents now write and review code faster than people can read it, so human review has become a
bottleneck, while most pull requests are low risk and a few cause most incidents. Meta describes a
Diff Risk Score that ranks changes by incident risk and lets low-risk changes skip waiting for
review, but the model is trained on Meta's own incidents and is not released.

opendrs is an independent implementation of that idea that runs in any git repository with no
service to host. This report describes the tool (Section 2), reproduces the DRS evaluation on a
public benchmark and on further repositories (Section 3), lists threats to validity (Section 4),
places the work among related papers (Section 5) and gives availability information (Section 6).
Our claim is deliberately modest: a git-only model reaches the accuracy of the classic
just-in-time metrics, and an LLM that reads the diff ranks better still, so the open question is how
much of that gap cheap signals can close.

## 2 Tool

**What it computes.** For a pull request, opendrs computes signals from git and from an import
graph, and combines them with a logistic model into a 0-1 risk score and a green, yellow or red tier.
The signals map to the features of Meta's DRS: log of changed lines (absolute and relative to file
size), new-files-only and comment-only changes, number of files and directories touched, distinct
authors of the changed files, prior incidents and fixes in the files, critical-path matches,
branch-keyword complexity, language, and the author's ownership and experience. It adds signals Meta
does not list: missing or deleted tests, and blast radius (transitive dependents of the changed
files, depth 3, from regex-based import extractors for six language families).
<!-- source: docs/signals.md -->

**Calibration and backtesting.** `opendrs calibrate` fits the model weights to a repository's own
history, with labels from reverts, SZZ-style blame on fix commits and an optional incident list.
`opendrs backtest` compares the default priors and the calibrated model on commits newer than the
training window. The default priors work without any fitting.
<!-- source: docs/calibration.md, docs/cli-and-mcp.md, docs/results.md -->

**No-LLM default.** The score needs no LLM and no API key. An optional, prompted LLM judge adds
`llm.semantic` and `llm.risk.*` signals and can only raise a score, never lower it. It can also gate
auto-approval.
<!-- source: README.md, docs/signals.md -->

**Delivery.** The tool is delivered three ways, all from one engine.
- *GitHub Action* (`uses: error-path/opendrs@v0`): comments the score and breakdown on the pull
  request, labels it and, optionally, approves it and sends it to the merge queue under a policy.
- *CLI* (`npx @error-path/opendrs score`): commands include `score`, `brief`, `explain`,
  `hotspots`, `feedback`, `calibrate`, `backtest`, `init` and `mcp`.
- *MCP server* (`npx -y @error-path/opendrs mcp`): six read-only tools (`score_diff`,
  `review_brief`, `self_check_items`, `explain_file_risk`, `list_hotspots`, `suggest_reviewers`) so
  a coding agent can check risk before it opens a pull request.
<!-- source: README.md (Install table), docs/cli-and-mcp.md -->

## 3 Reproduction of Diff Risk Score

### 3.1 Data

We use ApacheJIT (Keshavarz and Nagappan, MSR 2022): 106,674 commits from 15 Apache Java projects,
labelled by SZZ with JIRA links. The official training years are 2003-2016 and the held-out test
years are 2017-2019. `apache/hadoop` has no positive labels and is excluded from the headline
table (it is kept in the pooled table that includes it). Held-out commits after exclusion: 24,686,
of which 5,818 are positive.
<!-- source: docs/calibration.md (Results on ApacheJIT); bench/apachejit/results.md (pooled, excluding apache/hadoop) -->

We also replay 27 other open-source repositories without any configuration: nine larger ones
with up to 4,000 to 6,000 commits each, and 18 with the newest 1,200 to 1,500 commits each, labelled
by reverts and SZZ blame on fix commits.
<!-- source: docs/results.md (sections "The nine-repository run" and "A broader run") -->

### 3.2 Method

Every ApacheJIT commit is replayed with opendrs's own signals (`bench/apachejit/run.ts`). The model is
fitted exactly as `opendrs calibrate` fits it, on all training-year commits, and scored on the
test years. Four models are compared: opendrs with default priors, opendrs calibrated, a Kamei-style
logistic regression on the dataset's classic JIT metrics, and the published DRS-OSS numbers, which
we quote and do not re-run. Metrics are AUC and recall at the riskiest 5, 10, 30 and 50 % of
commits (captured@X %). The run used opendrs 0.2.0, repository commit `c14da1c`, dated 2026-10-18,
with the three dataset CSVs pinned by sha256.
<!-- source: bench/apachejit/README.md; bench/apachejit/results.md header -->

### 3.3 Results

**ApacheJIT, pooled, excluding `apache/hadoop`** (24,686 test commits, 5,818 positive):

| Model | AUC | Caught at 10 % | Caught at 30 % | F1 |
|---|---:|---:|---:|---:|
| opendrs, default priors | 0.771 | 24.9 % | 59.6 % | 0.473 |
| opendrs, calibrated | 0.823 | 29.7 % | 66.8 % | 0.568 |
| Kamei LR (dataset metrics) | 0.821 | 29.6 % | 66.2 % | 0.554 |
| DRS-OSS (published, other split) | 0.895 | 50.3 % | 86.4 % | 0.641 |

<!-- source: bench/apachejit/results.md, "pooled (excluding apache/hadoop)"; docs/calibration.md -->

- Calibration raises pooled AUC from 0.771 to 0.823, and AUC rises in all 14 projects with
  positives (apache/groovy only barely, 0.605 to 0.609).
  <!-- source: docs/calibration.md; bench/apachejit/results.md per-project table -->
- Calibrated opendrs ties the Kamei regression pooled (0.823 vs 0.821); we call this a tie within
  noise, not a win. Per project, opendrs is ahead in 4 of 14 and behind in 10, trailing by up to
  0.15 AUC on groovy (0.609 vs 0.760).
  <!-- source: docs/calibration.md; bench/apachejit/results.md per-project table -->
- A model that reads the diff ranks much better: DRS-OSS catches 86.4 % of buggy commits in its
  riskiest 30 %, against 66.8 % here, on a different split.
  <!-- source: bench/apachejit/results.md -->

**With a structured LLM judge** (a sample of 800 training and 800 test commits, 204 test positives, judged
by Claude Sonnet 5; about $55 in API calls). Adding the judge's signals raised AUC from 0.790 to
0.805 for the calibrated model and from 0.776 to 0.798 for default priors, within noise of the Kamei
baseline on the same commits (0.814). Used as a gate at confidence 8, the commits the judge calls
all-safe are buggy at 5.3 % against a 25.5 % base rate. This run predates the final refit and has not
been repeated.
<!-- source: docs/calibration.md ("With the structured LLM judge"); TODO-verify against bench/apachejit/results-llm.md directly -->

**Replays on other repositories.** On the nine-repository run, calibration beat the default priors
on held-out commits in all nine (median AUC gain +0.04). On the 18-repository run, the untuned score
ranks risk better than chance in 17 of 18 (median AUC 0.71 over all replayed commits); calibration
helped in 11, was flat in 1 and hurt in 6, and several held-out windows are small and noisy.
<!-- source: docs/results.md -->

**On its own pull requests.** opendrs scored PRs #25-#90 of its own repository (opened 2026-10-18 to
2026-11-17): 54 PRs, of which 31 green, 21 yellow and 2 red; 11 were auto-approved, all green. This is a
single-maintainer sample without incident labels, so it shows how the gate behaves, not how well the
score predicts bugs.
<!-- source: docs/results.md ("opendrs on its own pull requests") -->

## 4 Threats to validity

- **Different split from DRS-OSS.** DRS-OSS used its own chronological 80/10/10 split of all ApacheJIT
  commits; its numbers are a reference, not a like-for-like comparison.
  <!-- source: bench/apachejit/results.md (Caveats) -->
- **Possible LLM contamination.** The DRS-OSS paper itself names pretraining contamination (the base
  model may have seen Apache code) as a threat.
  <!-- source: docs/calibration.md -->
- **Graph approximation.** The import graph is built once per project at the end of 2019, so an
  early commit sees later dependents; `backtest` reports the same approximation.
  <!-- source: bench/apachejit/results.md (Caveats) -->
- **Label noise.** ApacheJIT labels are SZZ with JIRA links and are noisy in the usual ways
  (reformatting, wide fixes). Labels on the other repositories are "later needed a fix", not
  production incidents, and the newest commits' labels are incomplete.
  <!-- source: bench/apachejit/results.md; docs/results.md -->
- **Java only.** ApacheJIT exercises the language-agnostic signals and the Java import extractor,
  not the other languages' extractors.
  <!-- source: bench/apachejit/results.md (Caveats) -->
- **Balanced training file and F1.** The training file is undersampled to about 50/50; AUC and
  recall@k do not depend on that, but F1 does, so the F1 threshold is chosen on reweighted training
  scores only.
  <!-- source: bench/apachejit/results.md (Caveats) -->
- **Small and noisy samples.** Some held-out windows have fewer than 15 positives; the LLM-judge
  sample is 800 test commits and the AUC gain is within noise; the self-use sample is one
  maintainer's PRs.
  <!-- source: docs/results.md; docs/calibration.md -->
- **Author involvement.** The benchmark harness was written by the tool's author; every experiment,
  including those that did not help, is logged in `docs/experiments.md`.

## 5 Related work

Meta's Diff Risk Score is described in an engineering post (Engineering at Meta, 2025) and in Abreu
et al., "Moving Faster and Reducing Risk: Using LLMs in Release Deployment" (arXiv 2410.06351, 2024);
opendrs takes its feature set, tiered gates and capture-at-X %-gated metric from this work. RADAR
(Adams et al., arXiv 2605.30208, 2026) motivates the structured LLM reviewer with safe and risk
categories used by the optional judge. DRS-OSS (Sayedsalehi, Rigby and Mockus, arXiv 2511.21964,
2025) is the open-source LLM counterpart, a fine-tuned Llama 3.1 8B classifier over the diff and
commit message, whose numbers we quote. ApacheJIT (Keshavarz and Nagappan, MSR 2022) is the
dataset. The classic just-in-time defect prediction baseline follows Mockus and Weiss, "Predicting
risk of software changes" (2000), Kamei et al. (2013), and SZZ labelling (Sliwerski, Zimmermann and
Zeller, 2005). Reviewer-recommendation work at Meta (Rigby et al., arXiv 2312.17169) informs
reviewer suggestions.
<!-- source: README.md ("Prior art and credits"), docs/alternatives.md -->

TODO: confirm venues, full author lists and page numbers for each reference before the LaTeX
conversion; none was re-read for this draft. TODO: the RADAR identifier 2605.30208 and its 2026 date
come from the README and were not independently checked.

## 6 Availability

- Repository: <https://github.com/error-path/opendrs> (MIT license, `LICENSE`).
- npm package: `@error-path/opendrs`; GitHub Marketplace action
  "opendrs PR Risk Score and Blast Radius"; Docker image via the repository `Dockerfile`.
- Documentation: <https://error-path.github.io/opendrs/>.
- Reproduction: `docs/results.md` ("Reproduce a row") and `bench/apachejit/README.md`. The ApacheJIT
  run needs Node 23.6 or later, git and about 15 GB of disk for 15 clones; the full replay is estimated at
  3 to 8 hours on 16 cores.
  <!-- source: docs/results.md; bench/apachejit/README.md -->
- Dataset: ApacheJIT, <https://doi.org/10.5281/zenodo.5907002>.
- TODO: archive a release on Zenodo and cite its DOI (`CITATION.cff` exists in the repository).
- TODO: demo video URL (tool-demo track).
