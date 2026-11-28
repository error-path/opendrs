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
- New functions and comments follow the [comment standard](https://github.com/error-path/opendrs/blob/main/CONTRIBUTING.md#code-comments),
  and new or changed names follow the [naming standard](https://github.com/error-path/opendrs/blob/main/CONTRIBUTING.md#naming).
  Coding agents find both through `AGENTS.md` (and `CLAUDE.md`, which imports it).
- Prefer squash merges, so `main` reads as one commit per change.

## Releasing

Most of a release runs in GitHub Actions. You do only the steps that need your judgement or your
2FA code: starting it, reading and merging the release PR, publishing the draft release, approving
npm, and finishing.

1. Under **Actions**, open **Prepare a release** (`release-prepare.yml`), choose **Run workflow**
   and give the version, such as `0.7.2`. Only the repository owner can run it. Its first job runs
   `npm run release:prepare` on `main` with no secret: that sets the version in `package.json`,
   `package-lock.json`, `src/version.ts`, both fields of `server.json` and the golden score
   fixture, renames `## Unreleased` in `CHANGELOG.md` to the dated release, and rebuilds
   `action/dist`. Its second job installs nothing, refuses a patch that touches any other file, and
   opens the release PR as opendrs-bot, so CI runs on it. Before you run it, make sure the
   `## Unreleased` section says what the release ships.
2. Read the changelog section in the PR and merge it when CI passes. The self-modification guard
   never auto-approves it (it changes `action/dist`), so you merge it.
3. **Tag a release** (`release-tag.yml`) runs on that merge: it tags the merge commit `vX.Y.Z` and
   drafts the GitHub release with the changelog section as notes. A push to `main` whose
   `package.json` version is already tagged does nothing.
4. Open the draft from the run's summary or the **Releases** page, tick **Publish this Action to
   the GitHub Marketplace** (only the web form has it), and publish with your 2FA code. That
   updates the Marketplace listing from `action.yml`; the form refuses a `description` of 125
   characters or more (a test in `tests/action/workflows.test.ts` checks this). Publishing starts
   the **Publish to npm** workflow (`publish.yml`), which stages the package on npm (see below).
5. When that run passes, approve the staged version on npmjs.com, in the package's
   **Staged Packages** tab, with your 2FA code.
6. Under **Actions**, open **Finish a release** (`release-finish.yml`), choose **Run workflow** and
   give the tag, such as `v0.7.2`. Only the repository owner can run it. It checks that npm serves
   the version, publishes `server.json` to the MCP registry with the run's OIDC token (a re-run
   skips a version the registry already lists), moves the major tag (`v0`) to the release, and
   opens one PR as opendrs-bot that pins the Claude Code plugin and `llms-install.md` (`pin-plugin`) and this
   repository's own opendrs step (`pin-dogfood`, in `.github/actions/opendrs-release/action.yml`)
   to the release. Untick **Move the major tag** for a release with a breaking change; a
   prerelease never moves it. The registry checks that the npm package's `mcpName` matches
   `server.json`'s `name`, so this must run after npm has the version.
7. Merge the pins PR when CI passes. The plugin directory follows `main`, so a pin merged before
   npm has the version would point at a version that does not exist yet; that is why it comes
   last. The dogfood pin is in a composite action rather than in `opendrs.yml` because a
   workflow's token may not change files under `.github/workflows/`. `opendrs.yml` restores
   that file from the PR's base commit before running it, so a PR never runs its own copy of the pin:
   the pins PR is still scored by the previous release, and the new one applies from the next PR.

   If a workflow cannot run, every step still works by hand: `npm run release:prepare -- 0.7.2` on
   a branch and a PR; `git tag v0.7.2 && git push origin v0.7.2` after the merge;
   `git tag -f v0 v0.7.2 && git push -f origin v0`; `mcp-publisher login github` and
   `mcp-publisher publish` from the tag; and `node scripts/release.mjs pin-plugin 0.7.2` plus
   `node scripts/release.mjs pin-dogfood 0.7.2 <tag commit SHA>` on a branch and a PR. To move to a
   newer mcp-publisher, update `PUBLISHER_VERSION` and `PUBLISHER_SHA256` (the release's
   `mcp-publisher_linux_amd64.tar.gz` digest) together.

   **Prepare a release** and **Finish a release** push and open PRs with the opendrs-bot app
   (`OPENDRS_APP_CLIENT_ID`, `OPENDRS_APP_PRIVATE_KEY`), with a token narrowed to contents and pull
   requests, because a PR opened with the workflow's own token would not start CI.
8. Refresh the directory listings that are not driven by the registry: on
   [Glama](https://glama.ai/mcp/servers) (configured by `glama.json`) and on
   [mcp.so](https://mcp.so/servers/opendrs), sign in as a maintainer and check that the listing
   shows the new version; update it by hand if it does not.

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

**If a run fails** (npm down, setup missing), fix the cause, then open the **Publish to npm**
workflow under **Actions**, choose **Run workflow** and give the release tag, such as `v0.5.2`. If
the version is already staged, approve or reject that one instead of staging it again. Publishing
by hand from the tag with `npm login` and `npm publish` also still works, with your 2FA code.

## Docs site

The site in `docs/` is built and deployed by the **Deploy to GitHub Pages** workflow (`pages.yml`),
using Jekyll 4.4 (see `docs/Gemfile`). It needs no secrets. Every run:

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
