---
title: "Maintaining opendrs"
description: "The maintainer runbook for opendrs: weekly triage, releases and security."
---

# Maintaining opendrs

A short runbook for the maintainer.

## Weekly (about 15 minutes)

1. **Pull requests.** Dependabot opens grouped PRs for npm and GitHub Actions updates. If CI is
   green, merge them. For an Action update, check its release notes first.
2. **Issues.** Label each new issue `bug`, `enhancement` or `question`, and reply within a week.
   Close an issue that has no reproduction after 14 days without an answer.
3. **Security tab.** Check for private vulnerability reports and Dependabot alerts.

## Merging a contribution

- CI (`check (22)`, `check (24)`) must pass; the `main` ruleset enforces it.
- When `src/` changes, the PR must also include a rebuilt `action/dist`. CI fails otherwise.
- Read every change to `src/action/`, `src/policy/` or `.github/workflows/` line by line. These are
  the approval rails. A bug there lets someone merge code without review in every repo that uses
  opendrs.
- Prefer squash merges, so `main` reads as one commit per change.

## Releasing

1. Update `version` in `package.json` and `src/version.ts`, and add a section to `CHANGELOG.md`.
2. Merge that PR.
3. Tag the release and move the major tag (from a network that allows pushes):

   ```sh
   git checkout main && git pull
   git tag v0.2.0 && git tag -f v0
   git push origin v0.2.0 && git push -f origin v0
   ```

4. Create a GitHub release from the tag with the changelog section as notes.
5. Publish to npm from the tag with `npm publish`. The package is `@error-path/opendrs`;
   `publishConfig` makes it public, and the `prepack` script builds `dist`.
6. Update the MCP registry entry: set both `version` fields in `server.json` to the release
   (do this in step 1), then run `mcp-publisher login github` and `mcp-publisher publish` from
   the tag. The registry checks that the npm package's `mcpName` matches `server.json`'s `name`,
   so publish to npm first.

Users pin `@v0`, so moving `v0` ships the release to them. Never move `v0` to a version with a
breaking change; release `v1` instead.

## Docs site

The site in `docs/` is built and deployed by the `pages` workflow, using Jekyll 4.4 (see
`docs/Gemfile`). It needs no secrets. Every run:

1. builds the site and runs `scripts/check-site.mjs`, which fails on a broken internal link, a
   missing or duplicate title or description, more than one `<h1>`, a page no other page links
   to, a sitemap entry without `lastmod`, invalid JSON-LD or a broken `llms.txt` link. Pull
   requests that touch `docs/` run the same build and check, without deploying;
2. deploys to GitHub Pages;
3. sends IndexNow the pages that were added, changed (new `lastmod`) or removed, by comparing the
   live sitemap with the new one.

To tell Bing about URLs by hand, such as pages removed outside a deploy, run the workflow from the
Actions tab and paste them into `extra_urls`, separated by spaces. The IndexNow key is the file
`docs/7761d20ca5295159e2dd2f14ffccbe2b.txt` and `KEY` in `.github/workflows/pages.yml`. To rotate
it, replace both. To preview locally: `cd docs && bundle install && bundle exec jekyll serve`.

## Dev loop metrics

A shared, gitignored, append-only `runs.jsonl` is a record of how long `check`, `test`,
`test:slow`, `build:action`, `claude plugin eval` and any other repeatable command take, so "is
the dev loop getting slower" has a measured answer instead of a guess. Background: see
[Where the dev loop's time goes](research/2026-10-22-dev-loop-time-sinks.md).

**Where it lives:** `scripts/metrics-path.mjs` resolves the file the same way for every script,
in this order: the `OPENDRS_METRICS_FILE` env var if set; otherwise
`<git rev-parse --git-common-dir>/opendrs-dev-metrics/runs.jsonl`, which is the one `.git` dir
shared by the main checkout and every `git worktree`, so it survives pruning a worktree; otherwise
(git unavailable) the old `.dev-metrics/runs.jsonl` in the current directory. Set
`OPENDRS_METRICS_FILE` to point every script at a different file, e.g. for a one-off experiment.

**How it's written:**

- `npm run check`, `npm test`, `npm run test:slow` and `npm run build:action` are each wrapped by
  `scripts/record-run.mjs <kind> -- <command>`, which times the command, then appends one JSON
  line (`ts`, `kind`, `command`, `gitSha`, `gitBranch`, `worktree`, `durationMs`, `exitCode`,
  `loadAvg1m`, `source: "live"`) and exits with the wrapped command's own exit code. `<kind>` is
  free-form, so any repeatable action can be timed the same way, e.g.
  `node scripts/record-run.mjs bench:apachejit -- <bench command>` or
  `node scripts/record-run.mjs eval:case -- <command>`. `gitBranch` and `worktree` keep timings
  from different worktrees of the clone distinguishable in the shared file.
- After a `claude plugin eval` run, append its result with
  `node scripts/record-eval-run.mjs evals/results/<timestamp>/aggregate-result.json` — it reads
  `durationSeconds`, `costUsd` and each case's `passRate` out of that file and appends a `kind:
  "eval"` entry the same way. There's no automatic hook for this (eval is run by hand or by a
  worker, not by an npm script), so it's a manual or scripted post-step.
- The historical numbers in the research note above were seeded into the ledger with
  `"source": "backfill"` instead of `"live"`, so a report can tell measured runs from
  reconstructed ones.

**How to read it:** `node scripts/metrics-report.mjs` prints totals and averages by kind, the top
10 slowest individual runs, a "parallelism candidates" section listing every kind whose median
(p50) duration is over 10 minutes (count, p50, max) — override with
`--slow-threshold-min=<N>` — and an older-half-vs-newer-half trend per kind (so a regression shows
up as "up" before it's a surprise in CI). Anything flagged there is a candidate to split into
parallel work.

**Extending it:** add a new `kind` by picking a short string and using it consistently; both
scripts are dependency-free (Node builtins only) by design, so keep additions that way rather than
reaching for a package.

## Handling a security report

1. Acknowledge it within 7 days in the private advisory thread.
2. Reproduce it with a test. Fix it in a private fork from the advisory, or a normal PR if the
   report is already public.
3. Release a patch, move `v0`, publish the advisory, and credit the reporter.
