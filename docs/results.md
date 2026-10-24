---
title: "Benchmark results on public repositories"
description: "How the opendrs PR risk score ranks later-fixed commits on 27 open-source repositories, with default priors and after calibration, and how to reproduce a row."
---

# Benchmark results on public repositories

These are the numbers behind opendrs's claims: `opendrs backtest` replayed on open-source repositories, untuned and after `opendrs calibrate`, with nothing configured.

## The nine-repository run

On the public [ApacheJIT](calibration.md#results-on-apachejit) benchmark (Apache Java
projects, official 2017–2019 test years, `apache/hadoop` left out because it has no positive
labels), calibrated opendrs reaches AUC 0.823 and catches 67 % of buggy commits in its riskiest
30 %, on par with a regression on the classic JIT metrics (0.821, 66 %).

We ran `opendrs calibrate` and then `opendrs backtest --max-commits 4000` on nine open-source
repositories with opendrs v0.1.0, without changing any configuration. Labels come from reverts and
SZZ blame on fix commits only, since none of these repos publish an incident list. Read them as
"later needed a fix", not as production incidents.

**Held-out commits** are the commits newer than the calibration window, and so unseen by the fitted
model. That is the fair comparison between the default priors and a calibrated model:

| Repository | Language | Commits | Positives | AUC: default priors (held-out) | AUC: calibrated (held-out) | Caught in riskiest 10 %: default, all commits |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| [expressjs/express](https://github.com/expressjs/express) | JavaScript | 4,000 | 628 | 0.62 | **0.73** | 17.8 % |
| [pallets/flask](https://github.com/pallets/flask) | Python | 3,828 | 793 | 0.75 | **0.78** | 12.5 % |
| [django/django](https://github.com/django/django) | Python | 4,000 | 1,102 | 0.63 | **0.70** | 19.6 % |
| [gin-gonic/gin](https://github.com/gin-gonic/gin) | Go | 1,806 | 380 | 0.63 | **0.67** | 15.0 % |
| [prometheus/prometheus](https://github.com/prometheus/prometheus) | Go | 4,000 | 619 | 0.59 | **0.62** | 24.7 % |
| [rust-lang/cargo](https://github.com/rust-lang/cargo) | Rust | 4,000 | 1,163 | 0.61 | **0.75** | 15.2 % |
| [spring-projects/spring-boot](https://github.com/spring-projects/spring-boot) | Java | 4,000 | 152 | 0.61 | **0.62** | 32.9 % |
| [quarkusio/quarkus](https://github.com/quarkusio/quarkus) | Java | 6,000 | 497 | 0.65 | **0.66** | 28.2 % |
| [rails/rails](https://github.com/rails/rails) | Ruby | 4,000 | 351 | 0.63 | **0.71** | 17.9 % |

## What the nine-repository run shows

- **Calibration beat the default priors on held-out commits in all nine repositories.** The median
  AUC gain is +0.04, but on spring-boot and quarkus the gain is too small to matter. Fit the
  model on your own history; don't rely on the defaults.
- The default priors alone rank risk better than chance everywhere. Their AUC over all replayed
  commits ranges from 0.58 to 0.70. On quarkus, gating the riskiest 5 % and 10 % caught 18.5 % and
  28.2 % of positives. For orientation only, Meta reports 18.7 % and 27.9 % for its internal
  logistic-regression baseline. Different code, labels and population make this an analogy, not a
  comparison.
- Positive rates range from 4 % (spring-boot) to 29 % (cargo). SZZ labels are noisy, and a project's
  fix-commit habits shape them. Your own incident list (`.opendrs/incidents.jsonl`) is the
  strongest label you can add.
- Two known approximations, both reported by `backtest`: the import graph comes from the newest
  commit, and the newest commits' labels are incomplete.

## A broader run: 18 more repositories

Both runs used opendrs 0.1.2, before the label horizon (`history.labelHorizonDays`) existed. Re-running with it should mostly change the held-out column, by leaving out commits too new to have been fixed yet.

A second, shorter run used the newest 1,200–1,500 commits of each of 18 more repositories, again
without any configuration. "Caught" is the share of later-fixed commits that fall in the riskiest
10 % of commits; a random ranking catches 10 %.

| Repository | Positives | Default: caught / AUC (all commits) | Held-out AUC: default → calibrated |
| --- | ---: | ---: | ---: |
| [tiangolo/fastapi](https://github.com/tiangolo/fastapi) | 29 | 44.8 % / 0.78 | 0.73 → 0.70 |
| [ktorio/ktor](https://github.com/ktorio/ktor) | 261 | 26.4 % / 0.78 | 0.77 → **0.84** |
| [square/okhttp](https://github.com/square/okhttp) | 82 | 31.7 % / 0.76 | 0.66 → **0.70** |
| [hashicorp/terraform](https://github.com/hashicorp/terraform) | 96 | 36.5 % / 0.75 | 0.48 → 0.50 |
| [alacritty/alacritty](https://github.com/alacritty/alacritty) | 462 | 20.6 % / 0.74 | 0.69 → **0.76** |
| [eslint/eslint](https://github.com/eslint/eslint) | 119 | 31.1 % / 0.74 | 0.48 → 0.40 |
| [python-poetry/poetry](https://github.com/python-poetry/poetry) | 372 | 23.9 % / 0.73 | 0.71 → **0.79** |
| [laravel/framework](https://github.com/laravel/framework) | 58 | 31.0 % / 0.72 | 0.73 → 0.71 |
| [celery/celery](https://github.com/celery/celery) | 144 | 26.4 % / 0.72 | 0.77 → **0.81** |
| [prettier/prettier](https://github.com/prettier/prettier) | 86 | 25.6 % / 0.71 | 0.71 → **0.85** |
| [gohugoio/hugo](https://github.com/gohugoio/hugo) | 180 | 23.9 % / 0.69 | 0.64 → **0.72** |
| [sveltejs/svelte](https://github.com/sveltejs/svelte) | 325 | 21.2 % / 0.69 | 0.63 → **0.66** |
| [pydantic/pydantic](https://github.com/pydantic/pydantic) | 156 | 23.1 % / 0.68 | 0.79 → 0.77 |
| [tokio-rs/tokio](https://github.com/tokio-rs/tokio) | 87 | 40.2 % / 0.68 | 0.45 → 0.45 |
| [psf/requests](https://github.com/psf/requests) | 104 | 23.1 % / 0.67 | 0.79 → 0.71 |
| [etcd-io/etcd](https://github.com/etcd-io/etcd) | 127 | 22.8 % / 0.65 | 0.63 → **0.76** |
| [sinatra/sinatra](https://github.com/sinatra/sinatra) | 229 | 15.3 % / 0.60 | 0.59 → 0.56 |
| [serde-rs/serde](https://github.com/serde-rs/serde) | 92 | 15.2 % / 0.51 | 0.50 → **0.63** |

## What the broader run adds

- **Untuned, the score ranks risk better than chance in 17 of 18 repositories.** The median AUC
  over all replayed commits is 0.71, and the riskiest 10 % of commits hold 15–45 % of the
  later-fixed ones, against 10 % for a random pick. serde (0.51) is the exception.
- **Calibration helped in 11, was flat in 1 and hurt in 6.** Small held-out windows make these
  numbers noisy: fastapi and laravel have fewer than 15 positives in theirs. Since this run,
  `calibrate` keeps the default priors when the fitted weights do not beat them on a validation
  slice of your own history. Either way, run `backtest` before you trust a threshold.
- Held-out AUCs near 0.45–0.50 (tokio, terraform, eslint) come from the newest commits, whose
  bugs mostly haven't been found and fixed yet. Expect labels there to be incomplete.

## Reproduce a row

Reproduce a row: `git clone <repo> && cd <repo> && npx @error-path/opendrs calibrate --max-commits 4000 && npx @error-path/opendrs backtest --max-commits 4000`.
Runs took 1 to 16 minutes per repository on a 4-core Linux machine.

## ApacheJIT

On the public ApacheJIT benchmark, calibrated opendrs is compared with a logistic regression on the classic JIT metrics and with the published DRS-OSS numbers, pooled and per project, with and without the structured LLM judge. Those tables, and the caveats on what the split and labels let you read from them, are in [Calibration and backtesting: Results on ApacheJIT](calibration.md#results-on-apachejit).
