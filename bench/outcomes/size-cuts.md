# Size-normalized cuts: risk per line or exposure?

PRs touching 16+ files were later fixed or reverted 44.4 % of the time, against 4.5 % for 1-2
files. Edward Izgorodin, in the comments on the dev.to post, pointed out that the label needs only
one later fix to blame any line the PR wrote, so big PRs may just be bigger targets (exposure)
rather than riskier per line. He proposed two cuts: the fix rate per hundred lines written, and
the share of a fixed PR's lines that its fixes blamed. Both are below, over the same 1,010 PRs in
`corpus.jsonl` and `labels.jsonl`.

## Method

- **Fixed**: the eval's definition, reverted or a fix commit within 90 days blames at least one
  line back to the PR's commits (`hits` non-empty). It reproduces the published table exactly.
- **Lines added**: the lines blame can hit. The same `loadDiff` the briefs used, non-binary files
  outside `paths.ignore`, blank and comment lines left out (the `isMeaningful` rule in
  `src/model/label.ts` that `blameFix` uses).
- **Blamed lines**: every fix commit of the 99 fixed PRs was re-blamed with `blameFix`; the result
  matched `labels.jsonl` on every PR. Reverted PRs (5) count as 100 % blamed.

## Cut 1: fix rate per 1,000 lines added

| Files changed | PRs | Lines added | Median lines added | Fixed or reverted | Fixed PRs per 1,000 lines | Blaming (PR, fix) pairs per 1,000 lines |
|---|---:|---:|---:|---:|---:|---:|
| 1-2 | 550 | 10,501 | 4 | 25 (4.5 %) | 2.38 | 2.48 |
| 3-5 | 275 | 19,039 | 32 | 25 (9.1 %) | 1.31 | 1.68 |
| 6-15 | 149 | 32,896 | 65 | 33 (22.1 %) | 1.00 | 1.49 |
| 16+ | 36 | 42,260 | 232 | 16 (44.4 %) | 0.38 | 0.80 |

Counting every added line (blank, comment and ignored files too) lowers the rates but keeps the
order: 1.71, 1.04, 0.84, 0.32.

## Cut 2: share of a fixed PR's lines that its fixes blamed

| Files changed | Fixed PRs | Q1 | Median | Q3 | Fixed PRs with ≤ 2 blamed lines |
|---|---:|---:|---:|---:|---:|
| 1-2 | 25 | 25.0 % | 100.0 % | 100.0 % | 18 |
| 3-5 | 25 | 1.9 % | 8.7 % | 25.0 % | 11 |
| 6-15 | 33 | 1.2 % | 2.5 % | 11.1 % | 18 |
| 16+ | 16 | 0.4 % | 0.7 % | 3.0 % | 7 |

## Verdict

Mostly exposure. Per line, the fix rate falls as PRs grow (2.38 to 0.38 fixed PRs per 1,000
lines), and in the big PRs that were fixed, the fixes blamed a sliver: a median 0.7 % of the
lines, 7 of 16 at two lines or fewer. The per-PR rate still climbs (4.5 % to 44.4 %), so a big PR
is more likely to need some follow-up fix, but nothing here says its lines are worse. The table
measures how much there is to review, not how risky each line is.

## Limits

- 99 fixed PRs in all, 16 in the 16+ bucket.
- The 1-2 bucket's median PR adds 4 lines, so its per-line rate is noisy.
- SZZ-style blame misses fixes that only add lines, and cannot tell a real fix from a cleanup.
- Six repos, one per language; not a sample of all projects.

## Reproduce

The script, its tests and the per-PR rows (`size-cuts.ts`, `size-cuts-lib.ts`, `size-cuts.jsonl`)
are at commit [`bbdb31d`](https://github.com/error-path/opendrs/tree/bbdb31d/bench/outcomes).
