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
- New functions and comments follow the [comment standard](https://github.com/error-path/opendrs/blob/main/CONTRIBUTING.md#code-comments).
- Prefer squash merges, so `main` reads as one commit per change.

## Releasing

1. Update `version` in `package.json`, `package-lock.json`, `src/version.ts` and both fields of
   `server.json`, add a section to `CHANGELOG.md`, and rebuild `action/dist`.
2. Merge that PR.
3. Tag the release and move the major tag (from a network that allows pushes):

   ```sh
   git checkout main && git pull
   git tag v0.2.0 && git tag -f v0
   git push origin v0.2.0 && git push -f origin v0
   ```

4. Create a GitHub release from the tag with the changelog section as notes. Publishing it starts
   the `publish` workflow, which stages the package on npm (see below).
5. When the `publish` run passes, approve the staged version on npmjs.com, in the package's
   **Staged Packages** tab, with your 2FA code. Then check that
   `npm view @error-path/opendrs version` shows the release.
6. Update the MCP registry entry: run `mcp-publisher login github` and `mcp-publisher publish` from
   the tag. The registry checks that the npm package's `mcpName` matches `server.json`'s `name`,
   so publish to npm first.
7. Only after npm has the new version, open a PR that updates the plugin: set `version` in
   `plugin/.claude-plugin/plugin.json` and every pinned `@error-path/opendrs@<version>` in
   `plugin/.claude-plugin/plugin.json`, `plugin/commands/opendrs-review.md` and
   `plugin/skills/opendrs/SKILL.md`. The directory follows `main`, so a pin merged before you
   approve the staged version would point at a version that does not exist yet.

Users pin `@v0`, so moving `v0` ships the release to them. Never move `v0` to a version with a
breaking change; release `v1` instead.

### Publishing to npm

`.github/workflows/publish.yml` stages `@error-path/opendrs` with
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers) and
[staged publishing](https://docs.npmjs.com/staged-publishing): npm checks the workflow's GitHub
OIDC token, so no npm token is stored anywhere, and each version gets a provenance statement. The
run refuses a tag that is not on `main` or does not match `package.json`, skips a version npm
already has, runs the typecheck and fast tests, then runs `npm stage publish` (`publishConfig`
makes it public; `prepack` builds `dist`). A prerelease such as `1.2.3-rc.1` goes to the `next`
dist-tag.

A staged version is not installable until a maintainer approves it with 2FA, on npmjs.com or with
`npm stage approve <stage-id>`. So a compromised workflow or dependency can stage a version, but
never publish one. Before approving, check the staged version's files and size (`npm stage view`
or `npm stage download`).

**One-time setup:**

1. On npmjs.com, open the package's **Settings**, then **Trusted Publisher**, choose **GitHub
   Actions**, and enter organization or user `error-path`, repository `opendrs`, workflow
   filename `publish.yml` and environment `npm`. Under **Allowed actions**, leave
   **Allow npm publish** and **Allow npm dist-tag** unticked, so the workflow can only stage.
2. After the first release through the workflow works, set the package's **Publishing access** to
   "Require two-factor authentication and disallow tokens", and delete any old npm tokens.

**If a run fails** (npm down, setup missing), fix the cause, then open the `publish` workflow under
**Actions**, choose **Run workflow** and give the release tag, such as `v0.5.2`. If the version is
already staged, approve or reject that one instead of staging it again. Publishing by hand from the
tag with `npm login` and `npm publish` also still works, with your 2FA code.

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
- `evals/` sits outside `plugin/`, and `claude plugin eval` only looks inside the plugin folder. Copy
  it in for the run with `cp -r evals plugin/evals && claude plugin eval ./plugin` (`plugin/evals/` is
  gitignored). Results land in `plugin/evals/results/`; record the run below before you delete `plugin/evals/`.
- After a `claude plugin eval` run, append its result with
  `node scripts/record-eval-run.mjs plugin/evals/results/<timestamp>/aggregate-result.json` — it reads
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
