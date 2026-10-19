---
title: "Field test: opendrs 0.4.0 on six new repositories"
description: "opendrs 0.4.0 run against about 8 merged PRs each on psf/black, cli/cli, actix/actix-web, vitejs/vite, fastlane/fastlane and vapor/vapor: captain-fact quality, score saturation, language coverage gaps, module-boundary fit and performance, with a ranked fix list."
---

# Field test: opendrs 0.4.0 on six new repositories

Research note, 2026-10-19. Based on six field-test session notes in
`~/.cache/opendrs/field-test/notes/` (`black.md`, `cli-cli.md`, `actix-web.md`, `vite.md`,
`fastlane.md`, `vapor.md`), plus raw `brief`/`score` JSON for a subset of PRs under `notes/raw/`.
This note summarizes those six sessions; it does not re-run opendrs.

## Purpose and setup

Six repositories, chosen to spread across language, layout and manifest shape, each scored with
opendrs 0.4.0 (CLI, `--no-llm`, no API calls) against roughly 8 recently merged pull requests:

| Repo | Language / layout | HEAD at test time |
|---|---|---|
| psf/black | Python, src-layout (`src/black`, `src/blackd`, `src/blib2to3`) | `56a7ee682ada03e086f62d66ac01b752fbda21db` (2026-10-18) |
| cli/cli | Go, `cmd/` + `pkg/` + `internal/` | `5b0cc54248a3d069b96147188d13cd2f1e976176` (2026-10-19) |
| actix/actix-web | Rust, Cargo workspace, 11 crates | `2db7119a990511e90e234d8ba118234b51bce68a` (2026-10-19) |
| vitejs/vite | TypeScript, pnpm monorepo (`packages/*`) | `467f7ac3b8c7cca0b33290e7fd86f3fc79ce92cb` (2026-10-19) |
| fastlane/fastlane | Ruby, one top-level dir per tool, each with its own `lib/`+`spec/` | `e3ef1469e786892bc8c9d2773ae342d858c8567e` (2026-10-17) |
| vapor/vapor | Swift, single module, no import extractor in opendrs | `3966c26927d27a7b950229375820fd084e1897f6` (2026-10-19) |

Each PR was run as `opendrs brief --base <base> --head <head> --no-llm --json` and
`opendrs score --base <base> --head <head> --no-llm --json`, base commonly `<head>~1`. cli/cli's
history rarely carries a GitHub PR number on trunk (only 9 of 276 sampled commits do), so 3 of its
8 rows are commit-range stand-ins picked via `git log --shortstat`, per the test instructions, not
real PRs. vapor's note tested 9 PRs, one more than the nominal 8. fastlane ran with
`history.maxCommits: 1500` and `history.lookbackDays: 90` set locally (default config crashed
outright — see Findings, theme 4); the other five repos ran default config. fastlane also used a
full (non-shallow) clone; the other five used blobless (`--filter=blob:none`) clones. These two
setup differences mean fastlane's raw score numbers are not directly comparable to the other five
repos' numbers, though its captain-fact and detector findings are.

Every fact was judged by hand against the real diff: **TRUE+USEFUL** (correct and worth a
reviewer's attention), **NOISE** (technically true but not worth flagging on this PR), **WRONG**
(the fact is factually incorrect), or **MISSED** (a fact an architect would expect that did not
fire). Facts reported in a note's per-PR table but not covered by that note's own per-fact judgment
section are called out as unclassified rather than silently counted.

**Caveats.** Samples are small: 8–9 PRs per repo, one score per PR, no cross-repo replication. All
six sessions ran concurrently on the same Mac, sharing CPU and a slow git-spawn environment (a
security agent intercepts process spawns); wall-clock numbers below are noted as contention-
affected where the source note says so, but the *failure modes* they expose (fixed timeouts, no
fallback, no progress output) are real regardless of absolute seconds. **`calibrate`/`backtest`
timed out or were killed in every one of the six repos, inside the 15-minute time box each session
was given. No held-out AUC was obtained for any of the six repos in this field test.** Every tier
and priority below is the uncalibrated default model.

## Per-repo summary

| Repo | PRs | Score / tier spread | Captain priorities | Facts fired | Notable result |
|---|---|---|---|---|---|
| black | 8 | 0.089–0.956; 1 green, 7 red | 1 quick, 7 careful | 14 (13 individually classified; see below) | 7 of 8 non-docs PRs scored red (0.80–0.96) regardless of size; pyproject PEP 508 marker parser fabricated deps `,`/`win32` and missed the real new dep `winloop` (8b9d3e3, PR #4996) |
| cli-cli | 8 | 0.019–0.659; 5 green, 3 yellow | 2 quick, 2 standard, 4 careful | 0 | Go import resolution picks a nested go.mod with the same module path, so `opendrs explain` reports 0 dependents for heavily-imported files repo-wide; 2 confirmed missed `contract.api` facts (a45729e87 #14620, ba51bb477 #14430) |
| actix-web | 8 | 0.132–0.752; 3 green, 5 yellow, 0 red | 1 quick, 1 standard, 6 careful | 5 | A platform-gated Cargo dependency (8487ab79 #4335, `winapi-util`) and two Cargo feature-flag breaks (7a3ef12d #4213, 3bb00075 #4198) are invisible to every signal; `contract.api` itself was correct on all 3 real public-API changes it saw |
| vite | 8 | 0.36–0.96; 2 yellow, 6 red | 0 quick, 2 standard, 6 careful | 17 | 6 of 8 PRs landed in the same red tier (0.83–0.96) regardless of size or stakes; `history.incident` folder-level matching and `history.fixPattern` both inflate scores; the node↔client module boundary never produced a `layers.edge` fact (0 of 8) |
| fastlane | 8 | 0.057–0.823; 3 green, 4 yellow, 1 red | 2 quick, 2 standard, 4 careful | 2 | Ruby's public-declaration detector is a hardcoded stub, disabling `contract.api` for 100% of this Ruby repo; a real symlink-escape security fix (sigh-30380 #30380) scored green/quick/auto-approve |
| vapor | 9 | 0.05–0.95; 1 green, 6 yellow, 2 red | 1 quick, 5 standard, 3 careful | 0 | Every one of 9 briefs produced 0 captain facts; `tests.missing`/`tests.deleted` confidently misjudge Swift test files — a pure test-only PR (#3592) scored yellow/standard, and two deleted test files (#3593) were reported as "no test deletion" |

## Captain-fact quality, by fact type, across all six repos

Captain facts are the eight types `docs/captain.md` defines: `layers.edge`, `layers.cycle`,
`contract.dependency`, `contract.api`, `contract.schema`, `contract.env`, `coupling.missing`,
`drift.scope`. (`tests.missing`/`tests.deleted` are separate score/gate signals, not captain facts;
their failures are covered under Findings, theme 2.) `drift.scope` runs only inside the GitHub
Action, so this CLI-only field test could not exercise it at all.

| Fact type | Fired | True+useful | Noise | Wrong | Confirmed missed |
|---|---:|---:|---:|---:|---|
| `contract.api` | 10 | 8 | 2 | 0 | cli-cli ×2 (graph resolver bug, a45729e87, ba51bb477); vite ×1 (interface-field addition, bc0f21c56); permanently 0 for all of fastlane (Ruby public-decl stub) and all of vapor (no Swift extractor or public-decl rule) — confirmed against ≥3 PRs in each |
| `contract.dependency` | 7 | 5 | 0 | 2 (black, 8b9d3e3) | black ×1 (`winloop`, 8b9d3e3); cli-cli ×1 (indirect→direct promotion, 2c7ec97fd); actix-web ×1 (cfg-gated dep, 8487ab79) + 1 design gap (major-version bump treated like a patch, efa9c213); vite ×1 (no "removed dependency" fact, ce4293f15); fastlane ×1 (`.gemspec` unsupported, gemspec-30062); vapor — 0 ever, `Package.swift` unsupported (#3570, #3593, #3603) |
| `coupling.missing` | 18 | 0 | 18 | 0 | not a documented miss anywhere — it over-fires, it does not under-fire |
| `layers.edge` / `layers.cycle` | 1 | 0 | 1 (fastlane, newaction-30025) | 0 | cli-cli (structural — graph is broken repo-wide); vite (1 confirmed real case never caught, even at a manually tested `moduleDepth: 4`, because the coupling is a generated code string, not a literal import, 182f5b2a6); black, actix-web, fastlane (structural `moduleDepth` blind spots, not demonstrated as false negatives in-sample); vapor (no extractor at all) |
| `contract.env` | 2 | 2 | 0 | 0 | cli-cli (`os.LookupEnv` unsupported, confirmed present but not exercised by a sampled PR); vapor (no Swift pattern at all, confirmed via a deletion, #3593) |
| `contract.schema` | 0 | 0 | 0 | 0 | black flags one high-blast-radius near-miss not covered by any schema glob or `captain.contracts.paths` override: `src/blib2to3/Grammar.txt` (f705197, #4805) |
| `drift.scope` | not exercised (Action-only) | — | — | — | — |

**Bottom line.** Where opendrs's language support is complete (Python, Rust, most of TypeScript),
`contract.api` and `contract.dependency` mostly fire correctly and usefully. Where it is not —
Ruby's public-declaration rule is an unconditional `false`, Swift has no import extractor at all,
and Go's import graph resolves against the wrong module on this specific repo — those same two fact
types are silently and completely absent, with no `unknown` marker to say so. `coupling.missing` is
the opposite problem: it fired 18 times across the sample and was judged noise all 18 times,
consistent with `docs/captain.md`'s own note that it does not improve calibrated AUC and is kept as
a captain fact, not a score signal, for exactly this reason.

## Findings

### 1. Score saturation on mature repos

- **black**: 7 of 8 non-docs PRs scored red, 0.80–0.96 — a3cb9e1 (#5477) 0.876, c45f21d (#5504)
  0.880, 1ed66a8 (#5433) 0.956, d078e8e (#5296) 0.901, 8b9d3e3 (#4996) 0.953, f705197 (#4805) 0.829,
  27c6fd0 (#5475) 0.803 — indistinguishable from each other whether the PR was a 22-line whitespace
  fix or a 759-line release-pipeline rewrite. Root cause per the note: `diffusion.authors`,
  `history.churn` and `history.prior_fixes` are raw historical counts over any touched file;
  `linegen.py`/`nodes.py` have 200–350 distinct authors and 180+ commits/year simply because they
  are the oldest, busiest files in an 11-year-old repo, which is a property of the file, not of any
  one diff.
- **vite**: 6 of 8 PRs landed in the same red tier, 0.83–0.96 (77d837351 #23826 0.83, ce4293f15
  #23744 0.90, b28db28e9 #23643 0.89, 182f5b2a6 #23674 0.90, bc0f21c56 #23463 0.92, 5b7393588
  #23746 0.96) — a clean 101-line single-function bug fix (b28db28e9) scored the same tier as a
  651-line lint-tooling migration (5b7393588).
- **`history.fixPattern` conflates Conventional-Commit `fix:`/`fix(deps)` with real incident
  fixes.** vite: the purely cosmetic docs PR a6d310e42 (#23718, 3 files, 20 lines) scored 0.36/
  yellow largely because `history.prior_fixes` cited `fix(deps): update all non-major dependencies`
  renovate commits against `docs/guide/api-plugin.md` as "prior fixes." vapor: `history.incident`
  contributed a flat +0.80 on 7 of 9 PRs, including the trivial 1-line Package.swift pin #3603,
  because the repo's history is dense with routine "Fix ..." PR titles that the same broad regex
  matches.
- **`history.incident`'s folder-level revert matching is too coarse for a monorepo.** vite: one
  8-file revert (`2d66b7b14` reverting `acfe939e1`) is matched at the containing-folder level, so
  it flags `history.incident = 1` (a flat +0.8 contribution) on hundreds of files anywhere under
  `packages/vite/src/node/` that the revert never touched — confirmed on 5 of 8 sampled PRs
  (b28db28e9, 5b7393588, ce4293f15, bc0f21c56, 182f5b2a6).

### 2. Language coverage gaps

- **Go import resolution picks a nested go.mod with the same module path.**
  `.github/codeql/tests/unsanitized-response-to-terminal/go.mod` in cli/cli declares
  `module github.com/cli/cli/v2`, byte-identical to the real root module. The resolver's
  longest-path-first sort has no tie-break for equal-length paths, so `Array.prototype.find` picks
  whichever go.mod was visited first by file order. Confirmed: `opendrs explain api/client.go` and
  `opendrs explain pkg/extensions/official.go` both report `directDependents: 0` at trunk HEAD
  despite real, dozens-deep usage. This single collision guts `contract.api`, `layers.edge`,
  `blast.dependents` and `blast.public_surface` for roughly 1,039 Go files, and concretely swallowed
  two real changes: a45729e87 (#14620) deletes and replaces an exported `IsOfficial` signature with
  a live caller, ba51bb477 (#14430) deletes the only call site of an exported, renamed type — both
  0 facts.
- **go.mod `// indirect` is not distinguished from direct.** cli-cli PR 2c7ec97fd (#14578) promotes
  `charmbracelet/x/ansi` from indirect to direct and drops three libraries (`tcell`, `tview`,
  `gdamore/encoding`) — `contract.dependency` fired nothing, because `parseGoMod` buckets every
  `require (...)` name into the same runtime set regardless of the `// indirect` comment.
- **`os.LookupEnv` is not in `contract.env`'s Go pattern** (only `os.Getenv` is). cli-cli's own
  non-test code uses `os.LookupEnv` 14 times across 7 files; none of the 8 sampled PRs happened to
  add an env var this way, so this is a confirmed-present, not-yet-observed gap.
- **Cargo target-specific dependency tables are unscanned.** actix-web PR 8487ab79 (#4335) adds
  `winapi-util` under `[target.'cfg(windows)'.dependencies]` in `actix-files/Cargo.toml` — a genuine
  new runtime dependency, 0 `contract.dependency` facts.
- **Cargo `[features]` table changes are invisible to every signal.** actix-web 7a3ef12d (#4213)
  silently un-implies `http2` from the `openssl`/`rustls-*` TLS features (a downstream compatibility
  break); 3bb00075 (#4198) removes the `experimental-io-uring` feature. Neither produced a fact; the
  only reason either PR was flagged at all is the blanket `Cargo.toml` `paths.block` rule.
- **pyproject.toml's PEP 508 environment-marker parsing is broken.** black PR 8b9d3e3 (#4996):
  `manifests.ts`'s `quotedStrings` regex alternates single/double quotes without regard to which
  quote actually opened the TOML string, so `"uvloop>=0.15.2; sys_platform != 'win32'"` desyncs the
  rest of the array. Result: fake "new dependencies" `,` and `win32` reported, and the real new
  dependency `winloop` never reported.
- **Ruby's public-declaration detector is an unconditional stub** (`src/graph/public-decl.ts`:
  `ruby: () => false`). This permanently disables `contract.api` and holds `blast.public_surface` at
  0 for all of fastlane, regardless of what changes. Confirmed misses: refactor-30411 (#30411)
  deletes 4 public classes with no caller since 2015–2020; crosstool2-27547 (#27547) changes the
  signature of a public method, `Spaceship::ConnectAPI::Profile.create`, with live callers. Neither
  produced a fact.
- **`.gemspec` `add_dependency` is unsupported.** fastlane gemspec-30062 (#30062) adds
  `spec.add_dependency('multi_json', '~> 1.12')` to `fastlane.gemspec` — `contract.dependency` has
  no `.gemspec` entry in its `ManifestKind` union at all, 0 facts (the file is still hard-blocked by
  `paths.block`, but for an undifferentiated "this file type is blocked" reason, not a named
  dependency fact).
- **RSpec and Swift/XCTest test-file conventions are not in the default `paths.tests` globs.**
  fastlane: every one of 8 sampled PRs' own new `*_spec.rb` files were flagged as "no test changed,"
  including sigh-30380's (#30380) own 67-line `resign_sh_spec.rb` and newaction-30025's (#30025)
  219-line `update_app_age_rating_spec.rb`. vapor: PR #3592, a pure 2-file test-only change, scored
  `tests.missing = 1` and landed yellow/standard instead of green/quick; PR #3593 deletes two whole
  test files (`DotEnvTests.swift`, `EnvironmentTests.swift`) and `tests.deleted` still reports "no
  test deletion."
- **`Package.swift` is not parsed by `contract.dependency` and is not in `paths.block`.** vapor
  #3570 adds two brand-new runtime dependencies (`swift-nio-http3`, `swift-nio-quic`) and bumps two
  more; #3593 removes a dependency; #3603 is a one-line version pin. All three: 0
  `contract.dependency` facts and `paths.blocked = 0`.
- **Swift has no import extractor or public-declaration rule at all**, so `contract.api` can never
  fire. Confirmed misses: #3552 changes `public final class Request` to `public struct Request`
  (a source- and ABI-breaking change); #3464 adds 5 new `public macro` declarations; #3593 removes
  `public struct Process`, two `public subscript`s and `public static func get`/`secret`. All silent.

### 3. Module boundaries (`captain.moduleDepth: 2`)

The default of 2 path segments is the wrong module unit for every layout tested:

- **vite** — `packages/vite/src/{node,client,shared,module-runner}` all collapse to the single
  module `packages/vite`, hiding the one boundary that matters most in a bundler (dev-time Node code
  vs. code shipped to the browser). Tested directly on PR 182f5b2a6 with a temporary
  `moduleDepth: 4` override: still 0 `layers.edge` facts, because that PR's node↔client coupling is
  a generated JS string, not a literal `import`. `layers.edge`/`layers.cycle` fired zero times across
  all 8 sampled PRs. Suggested: `moduleDepth: 4`, or better, a glob-based module map
  (`packages/*/src/*`).
- **actix-web** — every file is `<crate>/src/<file>.rs`, so depth 2 always resolves to `<crate>/src`:
  correct for cross-crate boundaries, but structurally blind to intra-crate seams
  (`actix-http/src/h1` vs. `h2` vs. `ws`). Not demonstrated as a false negative in this 8-PR sample.
  Suggested: `moduleDepth: 3` for Cargo workspaces.
- **cli-cli** — `pkg/cmd/<command>/<subcommand>/file.go` collapses 40+ CLI subcommands into one
  "pkg/cmd" module, so `layers.edge` can only ever notice coupling between top-level trees
  (`pkg/cmd`, `internal/*`, `api`), never between subcommands.
- **fastlane** — every tool's `lib/` is one module at depth 2 (`fastlane/lib`, `match/lib`, ...),
  correct for cross-tool edges but collapsing all 400+ files of
  `fastlane/lib/fastlane/actions/*.rb` into one. Suggested: `moduleDepth: 4` for `fastlane` itself
  (other, smaller tool dirs are fine at 2).
- **black** — `src/<pkg>` is already 2 segments, so depth 2 correctly separates `black`/`blackd`/
  `blib2to3` but collapses the entire ~20-file `black` core into one module.

### 4. Robustness and performance

- **Fixed 120-second git-subprocess timeout, surfaced as an opaque, misleading error, with no CLI
  override on `brief`/`score`.** cli-cli: the first `score` call on a freshly-cloned blobless repo
  took 121.2s and failed (exit 2), citing git's own benign `"Auto packing the repository in
  background..."` stderr chatter as the error reason; an identical retry succeeded in 1–7s.
  fastlane: the same failure mode on `docs-30414` with default `history.maxCommits: 20000` on a
  10+-year-old repo — confirmed in source (`src/git/exec.ts`) that `git()` hardcodes
  `timeout: opts.timeoutMs ?? 120_000` with no override exposed by `brief`/`score` (only `calibrate`/
  `backtest` expose `--max-commits`/`--since`). An isolated raw `git log -n20000 --name-status -M`
  took 7m47s wall-clock but only 1.78s user + 2.92s system CPU — cheap in actual work, expensive only
  in wall time under contention, which the fixed timeout cannot tell apart from a real hang.
- **`git blame` calls are a significant, silently-degrading cost under slow-git conditions.**
  actix-web: nearly every brief with more than one hunk printed a "blame unavailable" note; a manual
  repro of one such `git blame -L ...` call took over 120 seconds (it did eventually succeed). vite:
  blame-unavailable notes appeared on all 8 sampled PRs, 1–14 times each. Not a crash — opendrs
  degrades gracefully to a note — but it silently loses the "last changed by fix X" provenance that
  makes "Check specifically" lines concrete.
- **`calibrate`/`backtest` could not complete within the 15-minute time box on any of the six repos.**
  black: killed after 13.5 minutes, no output. cli-cli: `backtest` alone consumed over 10 minutes
  with zero output across two attempts; `calibrate` was never started. actix-web: `calibrate` killed
  after 15 minutes, no `.opendrs/model.json` written. vite: `calibrate` killed at ~15:23 elapsed,
  having accumulated only ~1.4s of actual CPU time (starved on git spawns, not computing). fastlane:
  `calibrate` killed at exactly 600s (`timeout` exit 124) with zero stdout/stderr. vapor:
  `calibrate` killed after 11m37s with no output; the broad `pkill` pattern used to kill it likely
  also killed a concurrent fastlane-repo `calibrate` process. **No held-out AUC was obtained for any
  of the six repos.** This field test cannot say anything about how well default or calibrated
  weights rank real PRs on these repos — only that the uncalibrated default tiers look saturated or
  flat on several of them (theme 1).

### 5. Rendering

- **The captain "why" one-liner truncates almost every fact, sometimes to nothing.** Confirmed in
  black only (not checked against the other five repos' output, though the bug is in shared
  rendering code, not black-specific). `src/brief/build.ts`'s `firstClause` splits each fact's text
  on `/[;.]/` to take "the first clause," but every fact names a file path with a `.` in its
  extension, and workflow paths often start with a dot. On PR d078e8e (#5296) the "why" rendered as
  two bare backticks — cut at the first `.` in `.github`, before any real content. On 8b9d3e3,
  27c6fd0 and f705197 it cut mid-filename, e.g. dropping `.py:30` from a function's file path. Since
  this is the line printed in the PR comment (`**Captain: careful review** · @alice · why: ...` per
  `docs/captain.md` §5), this degrades the single most human-visible summary opendrs produces.

## What to fix or build next, ranked

Sizes are as estimated in the source notes (S/M/L), not independently re-estimated here.

| Rank | Problem | Evidence | Suggested change | Size | Languages |
|---|---|---|---|---|---|
| 1 | Go import graph resolves against the wrong module (duplicate go.mod path, no tie-break) — silently zeroes `contract.api`, `layers.edge`, `blast.*` for ~1,039 files | cli-cli: `opendrs explain api/client.go` / `pkg/extensions/official.go` → `directDependents: 0`; PRs a45729e87 (#14620), ba51bb477 (#14430) | Resolve each import against the nearest enclosing go.mod only (stop at the first match, Go module semantics), or warn on duplicate module paths and exclude test-fixture trees | S | Go |
| 2 | Ruby public-declaration detector is an unconditional stub (`ruby: () => false`) — disables `contract.api` for 100% of Ruby code | fastlane: refactor-30411 (#30411, 4 dead public classes), crosstool2-27547 (#27547, public method signature change with live callers) | Add a real heuristic: top-level `def self.foo`/`def foo` not under `private`/`protected`, plus `class`/`module` declarations | M | Ruby |
| 3 | `paths.tests` defaults don't match RSpec or Swift/XCTest conventions — `tests.missing`/`tests.deleted` give confidently wrong, not `unknown`, answers | fastlane: all 8 PRs' own `*_spec.rb` files flagged "no test changed"; vapor: #3592 (test-only) scored yellow/standard, #3593 (2 deleted test files) reported "no test deletion" | Add `**/spec/**`, `**/*_spec.rb` (Ruby) and a case-insensitive `**/Tests/**` / `**/*Tests.swift` (Swift) to the default `paths.tests` list | S | Ruby, Swift |
| 4 | `pyproject.toml` PEP 508 marker parser desyncs on nested quotes — fabricates dependency names and misses the real new one | black: 8b9d3e3 (#4996), fake deps `,`/`win32` reported, real new dep `winloop` never reported | Parse each quoted TOML string with its own matching delimiter (separate single-/double-quote regexes, unioned) instead of one alternating character class | S | Python |
| 5 | Captain "why" line truncates on any `.`/`;` inside a file path, sometimes to nothing | black: d078e8e (#5296) rendered as two bare backticks; 8b9d3e3, 27c6fd0, f705197 cut mid-filename | In `firstClause`, require the period be followed by whitespace/end-of-string, or strip backtick-quoted spans before splitting | S | All (shared rendering) |
| 6 | `go.mod` doesn't distinguish `// indirect` from direct — misses real dependency promotions | cli-cli: 2c7ec97fd (#14578), `charmbracelet/x/ansi` promoted + 3 libraries dropped, 0 facts | Track direct and indirect name sets separately in `parseGoMod`; a direct-set addition previously only indirect is "new runtime dependency" | S | Go |
| 7 | Cargo target-specific dependency tables (`[target.'cfg(...)'].dependencies]`) unscanned | actix-web: 8487ab79 (#4335), new `winapi-util` dep, 0 facts | Extend the manifest parser to also scan `[target.*.dependencies]` / `[target.*.dev-dependencies]` | S | Rust |
| 8 | No `Package.swift` manifest support — not parsed, not in `paths.block` | vapor: #3570 (2 new deps + 2 bumps), #3593 (removal), #3603 (version pin) — 0 facts, `paths.blocked = 0` on all three | Add `**/Package.swift` to `paths.block` (it executes code at resolve time like `Cargo.toml`/`go.mod`); add a line-regex parser for `.package(url:...)` entries | S (block) + M (parser) | Swift |
| 9 | `os.LookupEnv` missing from `contract.env`'s Go pattern (only `os.Getenv` covered) | cli-cli: 14 live uses across 7 files, confirmed present, not exercised by a sampled PR | Add `/\bos\.LookupEnv\(["']([A-Za-z_]\w*)["']/` to `ENV_PATTERNS` | S | Go |
| 10 | No Swift env-read pattern at all (`ProcessInfo.processInfo.environment`, `Environment.get`) | vapor: #3593 deletes `Environment.get` with 0 `contract.env` signal | Add Swift patterns to `ENV_PATTERNS` | S | Swift |
| 11 | Swift has no import extractor or public-declaration rule — `contract.api`/`layers.*`/`blast.*` fully disabled | vapor: #3552 (`class`→`struct`), #3464 (5 new public macros), #3593 (3 public removals) — all silent | A minimal Swift import extractor (`import Foo` → module `Foo`); a `swift` entry in `isPublicDeclaration` (`public`/`open`, `public macro`). The two are coupled: `contract.api` also gates on `dependentsOf().length > 0` | L (extractor) + M (public-decl) | Swift |
| 12 | `history.incident`'s folder-level revert matching is too coarse for a large monorepo directory | vite: one 8-file revert (`2d66b7b14`) flags +0.8 on hundreds of unrelated files under `packages/vite/src/node/`; confirmed on 5 of 8 sampled PRs | Restrict folder matching to a shallow radius and/or decay the contribution by directory size or time since the incident | M | All (monorepo-shaped repos) |
| 13 | `history.fixPattern` conflates Conventional-Commit `fix:`/`fix(deps)` maintenance commits with real incident fixes | vite: a6d310e42 (#23718) cosmetic docs PR scored 0.36/yellow from renovate `fix(deps)` commits; vapor: flat +0.80 `history.incident` on 7 of 9 PRs from routine "Fix ..." titles | Exclude routine maintenance scopes/types (`fix(deps)`, `chore`) from `fixPattern` by default, or support a composable exclude-pattern | M | All |
| 14 | Diffusion/history signals are raw historical counts, not normalized per repo — saturates tiers on old, active repos | black: 7 of 8 non-docs PRs scored red 0.80–0.96 regardless of size, because `linegen.py`/`nodes.py` have 200–350 authors/180+ commits a year simply from repo age | Normalize diffusion/churn against the repo's own file-level distribution (e.g. percentile within repo) instead of raw `log1p` counts; document that `calibrate` is close to required on a mature repo | L | All |
| 15 | No "removed dependency" fact, and no major/minor/patch distinction, in `contract.dependency` | vite: ce4293f15 (#23744), `@vercel/detect-agent` removed / `std-env` added, only the add is a fact; actix-web: efa9c213 (#4319), brotli 8→9 major bump treated like a patch bump | Add a `contract.dependency.removed` fact; add an info-level fact for a major-version bump on an existing name | S | All (manifest-level) |
| 16 | Cargo `[features]` table changes invisible to every signal | actix-web: 7a3ef12d (#4213, `http2` un-implied from TLS features), 3bb00075 (#4198, `experimental-io-uring` removed) | Add a `contract.feature` signal that diffs `[features]` tables: a feature removed, or a feature's implied-feature list shrinking | M | Rust |
| 17 | Exported-interface field additions under-promoted — `contract.api` only catches new top-level declarations or changed/removed signatures | vite: bc0f21c56 (#23463), `HotCallback.exports` field addition — the PR's real public-contract change — never became a fact; a test helper's new exports became the headline instead | Promote exported-interface field additions to `contract.api`, not just new top-level declarations | S–M | TypeScript (likely generalizes) |
| 18 | Default `paths.critical` (`auth/`, `payment*/`, `billing/`, `security/`) misses domain-specific critical code | fastlane: sigh-30380 (#30380), a symlink-escape fix in `sigh/lib/assets/resign.sh`, scored green/quick/auto-approve; vapor: TLS/certificate code organized by file name, never matched by the folder-name heuristic | Document and encourage a project-specific `paths.critical` override per repo; no generic default can cover domain-specific signing/crypto code | S (config/docs) | All |
| 19 | `moduleDepth: 2` default is wrong for every layout tested: `packages/*/src` (vite), `<crate>/src` (actix-web), `pkg/cmd/*` (cli-cli), `<tool>/lib` (fastlane) | See Findings, theme 3 | Detect and skip a bare `src`/`lib` path segment so depth counts from the package root, or document per-layout recommendations (depth 3 for Cargo workspaces, depth 4 for vite/fastlane); consider a glob-based module map longer-term | S (per-repo config) / L (structural) | All |
| 20 | Fixed 120s git-subprocess timeout with no override on `brief`/`score`, and an error message that surfaces git's own stderr instead of saying "timeout" | cli-cli: first `score` call failed at 121.2s citing git's benign auto-packing message; fastlane: same crash with default `history.maxCommits: 20000` on a 10+-year repo (raw `git log -n20000` took 7m47s wall / 1.78s user+2.92s system CPU) | Check `err.killed`/`err.signal` in `git()`'s reject path and report "timed out after Nms" distinctly from stderr content; expose `--max-commits`/`--since` on `brief`/`score` the way `calibrate`/`backtest` already do | S/M | All |
| 21 | `git blame` spawned once per hunk range is slow and failure-prone under contention, silently losing review-focus provenance | actix-web: every brief with >1 hunk printed blame-unavailable notes; vite: blame-unavailable notes on all 8 PRs, 1–14 times each | A configurable blame timeout, plus a single combined `git blame` call instead of one per hunk range | S | All |
| 22 | `calibrate`/`backtest` could not complete within a 15-minute time box on any of the six repos; no AUC obtained anywhere in this field test | All six notes; see Findings, theme 4 | Progress output during the history replay; a documented fast-start recipe (narrow `--since`, capped `--max-commits`) for a first run on an unfamiliar repo | M | All |

## What could not be reconciled

- black's per-PR table reports 14 fact instances total, but the note's own per-fact judgment section
  only individually classifies 13 of them (1ed66a8 is credited with 4 facts in the table but only 3
  — two `contract.api`, one `coupling.missing` — are discussed). The note does not say what the 14th
  fact was.
- vapor's session tested 9 PRs, one more than the ~8 the other five repos tested; the note does not
  explain the extra PR.
- fastlane ran with a non-default `history.maxCommits`/`history.lookbackDays` (forced by a crash
  under default settings) and a full, non-blobless clone, unlike the other five repos. Its detector
  and fact-quality findings are directly comparable to the other five repos; its raw score numbers
  are not.
- vapor's note flags that the broad `pkill` pattern used to kill its own stuck `calibrate` run likely
  also killed a concurrent fastlane `calibrate` process on the shared machine. Neither note confirms
  whether that fastlane `calibrate` run was the same one reported as killed at 600s in fastlane's own
  note, or a separate, unreported casualty.
