---
title: "Configuration reference (.opendrs.yml)"
description: "Every key in .opendrs.yml with its default: thresholds, auto-approval, blocked, critical, ignored and test paths, the LLM judge, history, import graph, freezes and per-source policy, and which values opendrs refuses."
---

# Configuration reference (.opendrs.yml)

`.opendrs.yml` at the repository root configures the score, the gate and the Action; this page is the full file with every default, followed by how the path lists combine and what opendrs refuses.

| Section | What it controls |
|---|---|
| `thresholds` | The green, yellow and red cut-offs, in absolute scores or percentiles of your calibrated history (ordering rule under [What opendrs refuses](#what-opendrs-refuses)) |
| `autoApprove` | Whether auto-approval is on, the AI-review checks that must have passed, the merge method, the share of eligible PRs still routed to a human, the changed-lines ceiling and which lines count toward it |
| `paths` | Blocked, unblocked, critical, instructions, ignored and test globs (see [Why the default block list is long](#why-the-default-block-list-is-long), [Your lists add to the defaults](#your-lists-add-to-the-defaults) and [Inert lines and the size cap](#inert-lines-and-the-size-cap)) |
| `llm` | The optional LLM judge: provider, model, endpoint, API key variable, whether the PR body is included, diff size limit |
| `history` | Lookback window, fix-commit pattern, commit cap, the `git log` timeout and the label horizon that `calibrate` and `backtest` skip |
| `graph` | The import graph: on or off, depth and file cap |
| `model` | Where `opendrs calibrate` writes the fitted model; priors are used until it exists |
| `brief` | Token budget for the review brief's Markdown |
| `captain` | The [captain brief](captain.md): the module map for the layers detector (auto-detected by default, or a flat depth / literal globs), the change-coupling detector's thresholds, and extra schema/contract globs |
| `content` | JS regexes matched against each added line (see [What opendrs refuses](#what-opendrs-refuses)) |
| `freezes` | Windows in which auto-approval is suspended or held to a stricter green (see [What opendrs refuses](#what-opendrs-refuses)) |
| `sources` | Per-source policy for agent, bot and human PRs; every setting only tightens the gate |

## The full file with every default

All keys are optional. This is the full file with every default (`opendrs init` writes it):

```yaml
thresholds:
  mode: absolute        # absolute: scores in 0..1; percentile: percentiles of your
                        # calibrated history (e.g. green: 50, yellow: 90, red: 95)
  green: 0.3            # below green: eligible for auto-approval
  yellow: 0.6
  red: 0.8

autoApprove:
  enabled: false        # false = comment and label only (dry run)
  requireAiReview:      # every listed check must have passed on the PR's head commit
    checks: []          # check-run names that must have concluded success, e.g. ["claude-review"]
  mergeMethod: queue    # queue | auto-merge | none
  sampleRate: 0.1       # share of eligible PRs still routed to a human
  maxChangedLines: 400  # never auto-approve above this, whatever the score
  sizeCapExempt: []     # never counts toward maxChangedLines, whatever its language family
  countInertLines: false   # true restores the old behaviour: every changed line counts

paths:
  # block and critical are matched ignoring case, and a list you set adds to these defaults.
  block: [".github/**", ".opendrs.yml", ".opendrs/**", "**/CODEOWNERS",
          "**/migrations/**", "**/migration/**", "**/migrate/**", "**/*.tf",
          ".gitmodules", "**/.gitattributes",
          # files that execute code on install, build or CI
          "**/package.json", "**/.npmrc", "**/.yarnrc", "**/.yarnrc.yml", "**/.pnpmfile.cjs",
          "**/setup.py", "**/setup.cfg", "**/pyproject.toml", "**/pip.conf",
          "**/build.gradle", "**/build.gradle.kts", "**/settings.gradle*", "**/gradle/wrapper/**",
          "**/pom.xml", "**/.mvn/**",
          "**/Cargo.toml", "**/build.rs", "**/go.mod",
          "**/Gemfile", "**/Rakefile", "**/*.gemspec",
          "**/requirements*.txt", "**/conftest.py", "**/.pre-commit-config.y*ml", "**/tox.ini",
          "**/noxfile.py",
          "**/*.csproj", "**/*.sln", "**/Directory.Build.*", "**/nuget.config",
          "**/CMakeLists.txt", "**/*.cmake", "**/.cargo/**", "**/.husky/**",
          "**/Makefile", "**/GNUmakefile", "**/*.mk",
          "**/Dockerfile*", "**/docker-compose*.y*ml", "**/compose.y*ml",
          "**/Brewfile", "**/Vagrantfile", "**/Procfile", "**/*.nix", "**/flake.lock",
          "**/.devcontainer/**", "**/.envrc", "**/Taskfile.y*ml", "**/justfile",
          ".gitlab-ci.yml", "Jenkinsfile", ".circleci/**", "azure-pipelines.yml", ".buildkite/**",
          "**/bitbucket-pipelines.yml", "**/.drone.yml", "**/.travis.yml", "**/cloudbuild.y*ml",
          "**/Earthfile", "**/BUILD", "**/BUILD.bazel", "**/WORKSPACE*", "**/MODULE.bazel", "**/*.bzl"]
  unblock: []           # default block globs to drop, written exactly as above, e.g. ["**/go.mod"]
  critical: ["**/auth/**", "**/payment*/**", "**/billing/**", "**/security/**"]
  # ignore and tests: a list you set replaces the default.
  # Scored as no risk (a lockfile bump stays green) but never auto-approved, like binary files.
  ignore: ["**/*.lock", "**/package-lock.json", "**/pnpm-lock.yaml", "**/go.sum", "**/dist/**",
           "**/vendor/**", "**/node_modules/**", "**/*.min.js", "**/*.snap"]
  tests: ["**/test/**", "**/tests/**", "**/__tests__/**", "**/*.test.*", "**/*.spec.*",
          "**/*_test.*", "**/test_*.py", "**/spec/**", "**/*_spec.rb", "**/Tests/**",
          "**/*Tests.swift"]
  # Never excluded from the size cap, whatever the extension; additive like block and critical.
  instructions: ["**/CLAUDE.md", "**/AGENTS.md", "**/GEMINI.md", ".claude/**", ".cursor/**",
                 ".cursorrules", ".windsurfrules", ".github/copilot-instructions.md",
                 ".github/instructions/**", "**/SKILL.md", "**/*.prompt.md", "**/prompts/**",
                 ".opendrs/**"]

llm:
  enabled: false
  provider: anthropic   # anthropic | openai (any OpenAI-compatible endpoint)
  model: claude-sonnet-5
  # baseUrl: https://api.openai.com/v1
  # apiKeyEnv: MY_KEY_VAR
  includeDescription: false   # the PR body is untrusted; title only by default
  maxDiffChars: 60000
  verify:                     # the verification pass, see verification.html
    enabled: false            # one batched call that keeps, drops or downgrades each brief item
    maxTokens: 40000          # estimated prompt tokens above which the call is skipped (fails open)

history:
  lookbackDays: 365
  fixPattern: "\\b(fix(es|ed)?|bug|hotfix|regression|incident|sev\\d?|revert)\\b"
  maxCommits: 20000
  gitTimeoutMs: 600000   # timeout for the one-time `git log` history scan; raise this (or lower maxCommits)
                         # if brief/score fails with "git log timed out ..." on a large or blobless clone
  labelHorizonDays: 60   # calibrate/backtest skip the newest 60 days: their bugs may not be found yet (0 = off)

graph:
  enabled: true
  maxDepth: 3
  maxFiles: 50000

model: .opendrs/model.json   # written by `opendrs calibrate`; priors are used until it exists

brief:
  maxTokens: 2500   # token budget for the review brief's Markdown (characters / 3.5); min 300, max 6000

captain:
  enabled: true          # false: no captain line, block, labels, output or brief section
  # moduleDepth: 2        # unset by default (auto-detection on); set to disable it and use a flat depth everywhere
  modules: []             # literal globs overriding auto-detection, e.g. one per package's source tree
  coupling:
    enabled: true         # set by the ApacheJIT experiment; see docs/experiments.md
    minSupport: 8         # set by the ApacheJIT experiment; see docs/experiments.md
    minConfidence: 0.6    # set by the ApacheJIT experiment; see docs/experiments.md
  contracts:
    paths: []              # extra schema/contract globs, added to the defaults

content:
  block: []   # JS regexes matched against each added line, e.g. ["\\beval\\(", "dangerouslySetInnerHTML"]

freezes: []   # while a window is active: auto-approval suspended, or held to a stricter green
#  - name: weekend
#    timezone: America/New_York   # IANA name; default UTC
#    days: [sat, sun]
#  - name: black-friday
#    from: "2026-11-26"           # inclusive local dates, quoted
#    to: "2026-11-30"
#    green: 0.15                  # same units as thresholds; must be below thresholds.green

sources:      # per-source policy; every setting only tightens the gate
  agent:
    green: 0.2                # stricter green for AI-agent PRs (thresholds.mode units)
    requireSafe: true         # LLM judge must call every hunk safe (needs llm.enabled)
    dailyCap: 20              # at most 20 agent commits landed in the last 24 hours
    trackRecord: { days: 60, minCommits: 10, maxRevertRate: 0.05 }
    patterns: []              # extra regexes over commit messages / author emails
  bot: {}
  human: {}
```

## Why the default block list is long

Besides the gate's own files, `paths.block` lists
files that execute code on install, build or CI: package manifests and their registry settings
(`package.json`, `.npmrc`, `setup.py`, `pyproject.toml`, `requirements.txt`, ...), build scripts
and project files (`build.gradle`, `pom.xml`, `build.rs`, `Makefile`, `CMakeLists.txt`, `*.csproj`,
`Dockerfile`, Bazel and Nix files, ...), developer hooks and environments (`.husky/`,
`.pre-commit-config.yaml`, `conftest.py`, `.envrc`, `.devcontainer/`, ...) and CI pipelines outside
`.github/`. Block and critical globs are matched ignoring case, so `makefile` or an EF Core
`Migrations/` folder cannot slip past `**/Makefile` or `**/migrations/**`. A
one-line change there (a `postinstall` hook, a registry pointed at another host, a new build
step) scores as small and low-risk, but runs on every developer machine and CI runner. Dependency
bumps also change a lockfile, which is in `paths.ignore` and so already goes to a human.

## Inert lines and the size cap

`autoApprove.maxChangedLines` no longer counts every changed line by default. Blank lines, plain
comments, and whole files in the docs family (`.md`, `.rst`, `.txt`, `.patch`, `.diff`) are
excluded, in this order (first match wins): a `paths.instructions` file always counts in full;
then a `paths.tests` file always counts in full; then a file matching `autoApprove.sizeCapExempt`
never counts; then a docs-family file never counts; then, in any other file, a hunk where every
changed line is blank or a plain comment in that file's own syntax never counts (a sibling
real-code hunk in the same file still does); everything else counts in full. A binary file always
counts as 1. The reason shown when the cap fires names both numbers, e.g. "500 changed lines, 200
counted toward maxChangedLines after excluding 300 inert docs/comment lines (cap 400)".

**Docs folders with executable content are not exempt by default.** A Jekyll layout
(`docs/_layouts/*.html`), a notebook (`.ipynb`), or site JS/CSS under `docs/assets/**` is not
`.md`/`.rst`/`.txt`, so it is classified `"other"`, not `"docs"` — those lines keep counting in
full unless you explicitly add them to `autoApprove.sizeCapExempt` (e.g. `sizeCapExempt:
["docs/assets/**"]`) on the default branch, the same trust boundary every other `.opendrs.yml`
setting has. `countInertLines: true` turns this whole feature off and restores the old,
unfiltered count.

## Your lists add to the defaults

A `paths.block`, `paths.critical` or `paths.instructions` you set extends the
default list; it never replaces it, so `block: ["infra/**"]` blocks `infra/**` as well as
everything above. To drop a default block entry, name it under `paths.unblock` on the default
branch, written exactly as in the list, for example `unblock: ["**/go.mod"]` if you trust `go.mod`
edits to code review alone. An `unblock` entry that is not a default block glob is a config error
that lists the valid ones, so a typo cannot pass silently. `paths.unblock` wins over the same glob
under `paths.block`. Default `critical` and `instructions` globs cannot be removed —
`instructions` has no `unblock`-style escape at all. `paths.ignore` and `paths.tests`
work the other way: a list you set replaces the default. In the Action, the self-modification
guard keeps `.github/**`, `.opendrs.yml`, `.opendrs/**`, the action, `.gitmodules` and
`.gitattributes` blocked whatever the lists say.

## Repositories that use Conventional Commits

The default `history.fixPattern` counts any commit subject matching
`\b(fix(es|ed)?|bug|hotfix|regression|incident|sev\d?|revert)\b` as a prior fix for
`history.prior_fixes`. On a repository that uses Conventional Commits heavily, this also counts
routine housekeeping — `fix(deps): update dependencies`, `chore(deps)`, `fix(ci)`, `fix(docs)`,
`fix: typo` — as if it were a real bug fix. The [score-saturation
experiment](experiments.md#score-saturation-fixpattern-and-incident-granularity-on-apachejit)
measured this on `vitejs/vite`: excluding those commits dropped the share matched by
`fixPattern` by 21.6 %. It was not significant pooled across ApacheJIT's mostly pre-Conventional-
Commits Java projects, so it is not a new default — but it is worth setting per repo if you use the
convention:

```yaml
history:
  fixPattern: "^(?!(?:deps?|dependencies|ci|docs?|build|chore|style|tests?)(?:\\([^)]*\\))?:)(?!\\w+\\((?:deps?|dependencies|ci|docs?|build|chore|style|tests?)\\):)(?!fix:\\s*typo\\b).*\\b(fix(es|ed)?|bug|hotfix|regression|incident|sev\\d?|revert)\\b"
```

This is the same keyword match as the default, unless the subject opens with a Conventional-Commit
header whose type or scope is `deps[/dependencies]`, `ci`, `docs`, `build`, `chore`, `style` or
`test[s]`, or is the literal `fix: typo`.

## What opendrs refuses

opendrs refuses a config that would fail silently, naming the offending value:

- **Globs** are repo-relative and support `**`, `*`, `?` and `{a,b}`. A glob with `[` or `]`
  (character classes are not supported), a backslash, or a leading `/` or `./` is an error.
- **`paths.unblock`** entries must each be a default `paths.block` glob, character for character.
- **Thresholds** must be ordered: `0 ≤ green < yellow ≤ red ≤ 1` in absolute mode, and
  `0 < green < yellow ≤ red < 100` in percentile mode.
- **`content.block`** entries must compile as JS regular expressions. JS has no inline flags such as
  `(?i)`, so write `[Dd]rop` instead.
- **`freezes`** need at least one of `days`, `from` or `to`, a real IANA timezone, `YYYY-MM-DD`
  dates with `from` ≤ `to`, and a `green` below `thresholds.green`.
