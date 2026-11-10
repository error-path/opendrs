// Files written by `opendrs init`. CONFIG_TEMPLATE must parse to exactly defaultConfig()
// (tests/cli/init-mcp.test.ts checks this), so editing a default means editing both.

export const CONFIG_TEMPLATE = `# opendrs configuration. Every value below is the default; delete what you do not change.
# In the GitHub Action this file is read from the PR's BASE commit, so a PR cannot loosen
# its own gate. Reference: https://github.com/error-path/opendrs#configuration

# Score cut-offs for the tiers (Meta's DRS gates: green / yellow / red).
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
  sampleRate: 0.1       # share of eligible PRs still routed to a human, to detect drift
  maxChangedLines: 400  # never auto-approve above this, whatever the score
  # Lines excluded from maxChangedLines by default: docs-family files, blank lines, plain
  # comments, and anything listed below. paths.instructions always counts in full regardless.
  # sizeCapExempt:
  #   - "docs/assets/**"   # e.g. Jekyll/site assets under docs/ are not docs-family and would
  #                         # otherwise count in full; list them here once you trust them
  countInertLines: false  # true: every changed line counts, nothing excluded (old behaviour)
  landingDelayMinutes: 0  # minutes an eligible PR waits, on the same head commit, before approval
  deferredReview:       # RADAR: land now, review after merge, for scores just above green
    enabled: false
    # below: 0.45       # upper end of the deferred band (thresholds.mode units)
    sources: [human]

paths:
  # Hard block: a PR touching any of these always needs a human. Matched ignoring case.
  # These defaults always apply: globs you add here extend them, and deleting a line here does
  # not unblock it. To drop a default, list it under unblock below.
  block:
    - ".github/**"
    - ".opendrs.yml"
    - ".opendrs/**"
    - "**/CODEOWNERS"
    - "**/migrations/**"
    - "**/migration/**"
    - "**/migrate/**"
    - "**/*.tf"
    - ".gitmodules"
    - "**/.gitattributes"
    # Files that execute code on install, build or CI. Dependency bumps also change a lockfile,
    # which is ignored and so goes to a human anyway. To let a PR that touches one of these be
    # auto-approved, list it under unblock, deliberately.
    - "**/package.json"
    - "**/.npmrc"
    - "**/.yarnrc"
    - "**/.yarnrc.yml"
    - "**/.pnpmfile.cjs"
    - "**/setup.py"
    - "**/setup.cfg"
    - "**/pyproject.toml"
    - "**/pip.conf"
    - "**/build.gradle"
    - "**/build.gradle.kts"
    - "**/settings.gradle*"
    - "**/gradle/wrapper/**"
    - "**/pom.xml"
    - "**/.mvn/**"
    - "**/Cargo.toml"
    - "**/build.rs"
    - "**/go.mod"
    - "**/Package.swift"
    - "**/Gemfile"
    - "**/Rakefile"
    - "**/*.gemspec"
    - "**/requirements*.txt"
    - "**/conftest.py"
    - "**/.pre-commit-config.y*ml"
    - "**/tox.ini"
    - "**/noxfile.py"
    - "**/*.csproj"
    - "**/*.sln"
    - "**/Directory.Build.*"
    - "**/nuget.config"
    - "**/CMakeLists.txt"
    - "**/*.cmake"
    - "**/.cargo/**"
    - "**/.husky/**"
    - "**/Makefile"
    - "**/GNUmakefile"
    - "**/*.mk"
    - "**/Dockerfile*"
    - "**/docker-compose*.y*ml"
    - "**/compose.y*ml"
    - "**/Brewfile"
    - "**/Vagrantfile"
    - "**/Procfile"
    - "**/*.nix"
    - "**/flake.lock"
    - "**/.devcontainer/**"
    - "**/.envrc"
    - "**/Taskfile.y*ml"
    - "**/justfile"
    - ".gitlab-ci.yml"
    - "Jenkinsfile"
    - ".circleci/**"
    - "azure-pipelines.yml"
    - ".buildkite/**"
    - "**/bitbucket-pipelines.yml"
    - "**/.drone.yml"
    - "**/.travis.yml"
    - "**/cloudbuild.y*ml"
    - "**/Earthfile"
    - "**/BUILD"
    - "**/BUILD.bazel"
    - "**/WORKSPACE*"
    - "**/MODULE.bazel"
    - "**/*.bzl"
    # AI agent and editor config that can run commands on a developer's machine.
    - ".claude/**"
    - "**/.claude-plugin/**"
    - "**/hooks/hooks.json"
    - "**/commands/*.md"
    - "**/SKILL.md"
    - "**/.mcp.json"
    - ".cursor/mcp.json"
    - ".vscode/mcp.json"
    - ".vscode/tasks.json"
    # CI pipelines under other names and folders.
    - ".gitlab-ci.yaml"
    - ".gitlab/**"
    - "**/Jenkinsfile*"
    - "**/azure-pipelines*.y*ml"
    - ".gitea/**"
    - ".forgejo/**"
    - "**/.woodpecker.y*ml"
    - ".woodpecker/**"
    - ".semaphore/**"
    - ".teamcity/**"
    - "**/appveyor.yml"
    - "**/.appveyor.yml"
    # More install scripts, build wrappers and git hooks.
    - "**/gradlew"
    - "**/gradlew.bat"
    - "**/gradle.properties"
    - "**/mvnw"
    - "**/mvnw.cmd"
    - "**/.yarn/plugins/**"
    - "**/.yarn/releases/**"
    - "**/pnpm-workspace.yaml"
    - "**/bunfig.toml"
    - "**/deno.json"
    - "**/deno.jsonc"
    - "**/lefthook.y*ml"
    - "**/.lefthook.y*ml"
    - "**/Pipfile"
    - "**/Podfile"
    - "**/composer.json"
    - "**/mix.exs"
    - "**/build.sbt"
    - "**/project/*.sbt"
    - "**/go.work"
    - "**/rust-toolchain*"
    - "**/configure"
    - "**/configure.ac"
    - "**/Makefile.am"
    - "**/Makefile.in"
    - "**/meson.build"
    - "**/Containerfile*"
    - "**/Tiltfile"
    - "**/.bazelrc"
    # Infrastructure and schema changes outside the migrations folders.
    - "**/*.tfvars"
    - "**/*.tf.json"
    - "**/*.tfvars.json"
    - "**/.terraform.lock.hcl"
    - "**/terragrunt.hcl"
    - "**/*.bicep"
    - "**/Pulumi*.yaml"
    - "**/serverless.y*ml"
    - "**/schema.prisma"
    - "**/alembic/versions/**"
    # Who reviews and what bots may merge.
    - "**/OWNERS"
    - "**/OWNERS_ALIASES"
    - "renovate.json"
    - "renovate.json5"
    - ".renovaterc"
    - ".renovaterc.json"
  # Default block globs to remove, each written exactly as above, e.g. ["**/go.mod"].
  unblock: []
  # Raises the score (Meta's "high-criticality service" feature). Matched ignoring case.
  # Like block, globs you add extend these defaults.
  critical:
    - "**/auth/**"
    - "**/payment*/**"
    - "**/billing/**"
    - "**/security/**"
  # Excluded from size and churn (lockfiles, generated and vendored code); never auto-approved.
  # Unlike block and critical, a list you set for ignore or tests replaces the default.
  ignore:
    - "**/*.lock"
    - "**/package-lock.json"
    - "**/pnpm-lock.yaml"
    - "**/go.sum"
    - "**/dist/**"
    - "**/vendor/**"
    - "**/node_modules/**"
    - "**/*.min.js"
    - "**/*.snap"
  # Files that count as tests for the "source changed without tests" signal.
  tests:
    - "**/test/**"
    - "**/tests/**"
    - "**/__tests__/**"
    - "**/*.test.*"
    - "**/*.spec.*"
    - "**/*_test.*"
    - "**/test_*.py"
    - "**/spec/**"
    - "**/*_spec.rb"
    - "**/Tests/**"
    - "**/*Tests.swift"
  # Files that steer an AI agent or CI; never excluded from autoApprove.sizeCapExempt or the
  # docs-family exclusion (see autoApprove above), whatever their extension. Additive, like
  # block and critical.
  instructions:
    - "**/CLAUDE.md"
    - "**/AGENTS.md"
    - "**/GEMINI.md"
    - ".claude/**"
    - ".cursor/**"
    - ".cursorrules"
    - ".windsurfrules"
    - ".github/copilot-instructions.md"
    - ".github/instructions/**"
    - "**/SKILL.md"
    - "**/*.prompt.md"
    - "**/prompts/**"
    - ".opendrs/**"

# JS regular expressions matched against each added line; a match is never auto-approved.
# No inline flags such as (?i): write [Dd]rop instead.
content:
  block: []
  #   - "\\\\beval\\\\("
  #   - "dangerouslySetInnerHTML"

# Optional LLM judge, one extra signal. The diff and PR text are treated as untrusted.
llm:
  enabled: false
  provider: anthropic   # anthropic | openai (any OpenAI-compatible endpoint)
  model: claude-sonnet-5
  # baseUrl: https://api.openai.com/v1   # for OpenAI-compatible servers (Azure, Ollama, vLLM)
  # apiKeyEnv: MY_KEY_VAR                # default: ANTHROPIC_API_KEY or OPENAI_API_KEY
  includeDescription: false   # the PR body is untrusted; the title only by default
  maxDiffChars: 60000

history:
  lookbackDays: 365
  fixPattern: "\\\\b(fix(es|ed)?|bug|hotfix|regression|incident|sev\\\\d?|revert)\\\\b"
  maxCommits: 20000
  labelHorizonDays: 60   # calibrate/backtest skip the newest 60 days: their bugs may not be found yet (0 = off)

# Reverse import graph used for blast radius.
graph:
  enabled: true
  maxDepth: 3
  maxFiles: 50000

# Calibrated model written by \`opendrs calibrate\`; the default priors are used until it exists.
model: .opendrs/model.json

# Freeze windows (Meta's weekend gate and "code chill"): while one is active, auto-approval is
# suspended, or held to a stricter green (same units as thresholds). Tiers do not change.
freezes: []
#  - name: weekend
#    timezone: America/New_York   # IANA name; default UTC
#    days: [sat, sun]
#  - name: black-friday
#    from: "2026-11-26"           # inclusive local dates
#    to: "2026-11-30"
#    green: 0.15

# Per-source policy (RADAR): PRs are classified as human, bot or agent (AI coding agent) from commit
# trailers, author emails and, in CI, the GitHub account type. Every setting only tightens the gate.
sources:
  agent: {}
#    green: 0.2               # stricter green for AI-agent PRs
#    requireSafe: true        # LLM judge must call every hunk safe (needs llm.enabled)
#    dailyCap: 20             # at most 20 agent commits landed in the last 24 hours
#    trackRecord: { days: 60, minCommits: 10, maxRevertRate: 0.05 }
#    patterns: []             # extra regexes over commit messages and author emails
  bot: {}
  human: {}
`;

export const WORKFLOW_TEMPLATE = `# opendrs: comment a risk score on every pull request.
# Comment-only until you set autoApprove.enabled in .opendrs.yml on the default branch.
# Docs: https://github.com/error-path/opendrs/blob/main/docs/github-action.md
name: opendrs

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review, labeled, unlabeled]

# A newer push cancels the run for the older head, so it cannot approve or merge a stale commit.
concurrency:
  group: opendrs-\${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: write
  checks: read

jobs:
  opendrs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0   # full history: the score uses past commits and authors
      - uses: error-path/opendrs@v0
        id: opendrs
        # with:
        #   llm-api-key: \${{ secrets.ANTHROPIC_API_KEY }}   # only used when llm.enabled
`;
