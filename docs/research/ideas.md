---
title: "Ideas not yet tested"
description: "Changes to opendrs that results suggest but no experiment has tested yet, each with why it is not adopted and how it would be tested."
---

# Ideas not yet tested

Changes that a result points to but that have not been tested. Nothing here is in opendrs. Each
entry says why it is not adopted yet and how it would be tested; a test would be pre-registered
in the [experiment log](../experiments.md) like the other runs there.

## Exposure-adjusted labels or size signal

**What.** Adjust for how many lines a PR writes: weight a later fix by the share of the PR's lines
it blamed, or normalize the size signal per line instead of per PR.

**Why.** On the outcome corpus, the fix rate per line falls as PRs grow: 2.38 fixed PRs per 1,000
lines for 1-2 files, 0.38 for 16+ files. In fixed PRs touching 16+ files, the fixes blamed a
median 0.7 % of the lines
([size-normalized cuts](https://github.com/error-path/opendrs/blob/main/bench/outcomes/size-cuts.md)).
Big PRs are later fixed more often mostly because they have more lines to hit.

**Why not adopted.** The score predicts "this PR will need a later fix", and that rate still
climbs with size, so the per-PR size signal is doing its job. Whether an exposure adjustment
ranks PRs any better is untested.

**How to test.** A pre-registered ApacheJIT run, as for the other entries in the experiment log:
compare AUC and fixes caught in the top 30 % with and without the adjustment.

**Status.** Not picked.
