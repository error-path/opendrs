import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { OpendrsError } from "./types.js";

export const CONFIG_FILE = ".opendrs.yml";

const thresholdsSchema = z
  .object({
    mode: z.enum(["absolute", "percentile"]).default("absolute"),
    green: z.number().min(0).max(100).default(0.3),
    yellow: z.number().min(0).max(100).default(0.6),
    red: z.number().min(0).max(100).default(0.8),
  })
  .superRefine(({ mode, green, yellow, red }, ctx) => {
    const ok = mode === "absolute" ? 0 <= green && green < yellow && yellow <= red && red <= 1 : 0 < green && green < yellow && yellow <= red && red < 100;
    if (ok) return;
    const rule = mode === "absolute" ? "0 ≤ green < yellow ≤ red ≤ 1 (scores)" : "0 < green < yellow ≤ red < 100 (percentiles)";
    ctx.addIssue({ code: "custom", message: `${mode} thresholds must satisfy ${rule}; got green ${green}, yellow ${yellow}, red ${red}` });
  });

/** Why a glob would silently match nothing (or the wrong thing) in our matcher, if it would. */
function globProblem(glob: string): string | undefined {
  if (/[[\]]/.test(glob)) return "uses [ or ], which are not supported (they match literally)";
  if (glob.includes("\\")) return "contains \\; use forward slashes";
  if (glob.startsWith("/") || glob.startsWith("./")) return "has a leading / or ./; globs match repo-relative paths like src/**";
  return undefined;
}

const globs = (defaults: string[]) =>
  z
    .array(
      z.string().superRefine((glob, ctx) => {
        const problem = globProblem(glob);
        if (problem) ctx.addIssue({ code: "custom", message: `glob "${glob}" ${problem}` });
      }),
    )
    .default(defaults);

/** Default `paths.block`. A config's own `block` adds to it; only `paths.unblock` removes an entry. */
export const DEFAULT_BLOCK: readonly string[] = [
  ".github/**",
  ".opendrs.yml",
  ".opendrs/**",
  "**/CODEOWNERS",
  "**/migrations/**",
  "**/migration/**",
  "**/migrate/**",
  "**/*.tf",
  ".gitmodules",
  "**/.gitattributes",
  // Files that execute code on install, build or CI.
  "**/package.json",
  "**/.npmrc",
  "**/.yarnrc",
  "**/.yarnrc.yml",
  "**/.pnpmfile.cjs",
  "**/setup.py",
  "**/setup.cfg",
  "**/pyproject.toml",
  "**/pip.conf",
  "**/build.gradle",
  "**/build.gradle.kts",
  "**/settings.gradle*",
  "**/gradle/wrapper/**",
  "**/pom.xml",
  "**/.mvn/**",
  "**/Cargo.toml",
  "**/build.rs",
  "**/go.mod",
  "**/Package.swift",
  "**/Gemfile",
  "**/Rakefile",
  "**/*.gemspec",
  "**/requirements*.txt",
  "**/conftest.py",
  "**/.pre-commit-config.y*ml",
  "**/tox.ini",
  "**/noxfile.py",
  "**/*.csproj",
  "**/*.sln",
  "**/Directory.Build.*",
  "**/nuget.config",
  "**/CMakeLists.txt",
  "**/*.cmake",
  "**/.cargo/**",
  "**/.husky/**",
  "**/Makefile",
  "**/GNUmakefile",
  "**/*.mk",
  "**/Dockerfile*",
  "**/docker-compose*.y*ml",
  "**/compose.y*ml",
  "**/Brewfile",
  "**/Vagrantfile",
  "**/Procfile",
  "**/*.nix",
  "**/flake.lock",
  "**/.devcontainer/**",
  "**/.envrc",
  "**/Taskfile.y*ml",
  "**/justfile",
  ".gitlab-ci.yml",
  "Jenkinsfile",
  ".circleci/**",
  "azure-pipelines.yml",
  ".buildkite/**",
  "**/bitbucket-pipelines.yml",
  "**/.drone.yml",
  "**/.travis.yml",
  "**/cloudbuild.y*ml",
  "**/Earthfile",
  "**/BUILD",
  "**/BUILD.bazel",
  "**/WORKSPACE*",
  "**/MODULE.bazel",
  "**/*.bzl",
  // AI agent and editor config that can run commands on a developer's machine.
  ".claude/**",
  "**/.claude-plugin/**",
  "**/hooks/hooks.json",
  "**/commands/*.md",
  "**/SKILL.md",
  "**/.mcp.json",
  ".cursor/mcp.json",
  ".vscode/mcp.json",
  ".vscode/tasks.json",
  // CI pipelines under other names and folders.
  ".gitlab-ci.yaml",
  ".gitlab/**",
  "**/Jenkinsfile*",
  "**/azure-pipelines*.y*ml",
  ".gitea/**",
  ".forgejo/**",
  "**/.woodpecker.y*ml",
  ".woodpecker/**",
  ".semaphore/**",
  ".teamcity/**",
  "**/appveyor.yml",
  "**/.appveyor.yml",
  // More install scripts, build wrappers and git hooks.
  "**/gradlew",
  "**/gradlew.bat",
  "**/gradle.properties",
  "**/mvnw",
  "**/mvnw.cmd",
  "**/.yarn/plugins/**",
  "**/.yarn/releases/**",
  "**/pnpm-workspace.yaml",
  "**/bunfig.toml",
  "**/deno.json",
  "**/deno.jsonc",
  "**/lefthook.y*ml",
  "**/.lefthook.y*ml",
  "**/Pipfile",
  "**/Podfile",
  "**/composer.json",
  "**/mix.exs",
  "**/build.sbt",
  "**/project/*.sbt",
  "**/go.work",
  "**/rust-toolchain*",
  "**/configure",
  "**/configure.ac",
  "**/Makefile.am",
  "**/Makefile.in",
  "**/meson.build",
  "**/Containerfile*",
  "**/Tiltfile",
  "**/.bazelrc",
  // Infrastructure and schema changes outside the migrations folders.
  "**/*.tfvars",
  "**/*.tf.json",
  "**/*.tfvars.json",
  "**/.terraform.lock.hcl",
  "**/terragrunt.hcl",
  "**/*.bicep",
  "**/Pulumi*.yaml",
  "**/serverless.y*ml",
  "**/schema.prisma",
  "**/alembic/versions/**",
  // Who reviews and what bots may merge.
  "**/OWNERS",
  "**/OWNERS_ALIASES",
  "renovate.json",
  "renovate.json5",
  ".renovaterc",
  ".renovaterc.json",
];

/** Default `paths.critical`. A config's own `critical` adds to it. */
export const DEFAULT_CRITICAL: readonly string[] = ["**/auth/**", "**/payment*/**", "**/billing/**", "**/security/**"];

/**
 * Default `paths.instructions`: files that steer an AI agent or CI, never excluded from the size
 * cap (2026-10-20 inert-changes spec §3). Additive only, like DEFAULT_BLOCK/DEFAULT_CRITICAL — no
 * unblock-style removal.
 */
export const DEFAULT_INSTRUCTIONS: readonly string[] = [
  "**/CLAUDE.md",
  "**/AGENTS.md",
  "**/GEMINI.md",
  ".claude/**",
  ".cursor/**",
  ".cursorrules",
  ".windsurfrules",
  ".github/copilot-instructions.md",
  ".github/instructions/**",
  "**/SKILL.md",
  "**/*.prompt.md",
  "**/prompts/**",
  ".opendrs/**",
];

/** An unblock entry must name a default block glob exactly, so a typo cannot pass silently. */
function unblockable(glob: string, ctx: z.RefinementCtx): void {
  if (DEFAULT_BLOCK.includes(glob)) return;
  ctx.addIssue({
    code: "custom",
    message: `paths.unblock entry "${glob}" is not a default paths.block glob; valid entries: ${DEFAULT_BLOCK.map((g) => `"${g}"`).join(", ")}`,
  });
}

const union = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];

function compiles(pattern: string, ctx: z.RefinementCtx): void {
  try {
    new RegExp(pattern);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: `content.block entry "${pattern}" is not a valid JS regular expression: ${(e as Error).message}` });
  }
}

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD date");

/**
 * Policy for PRs from one source. Every field can only tighten the gate: a source cannot loosen
 * the base thresholds, because agent authorship comes from commit trailers the PR author controls.
 */
const sourcePolicySchema = z.object({
  /** Stricter green threshold for this source (thresholds.mode units); must be below thresholds.green. */
  green: z.number().optional(),
  /** Like llm.requireSafe, for this source only. Needs llm.enabled. */
  requireSafe: z.boolean().default(false),
  /** A longer landing delay for this source; the larger of this and autoApprove.landingDelayMinutes applies. */
  landingDelayMinutes: z.number().int().min(0).optional(),
  /** At most this many commits of this source landed on the base branch in the last 24 hours. */
  dailyCap: z.number().int().positive().optional(),
  /** RADAR's track record: enough recent landed commits of this source, and few of them reverted. */
  trackRecord: z
    .object({
      days: z.number().int().positive().default(60),
      minCommits: z.number().int().min(0).default(10),
      maxRevertRate: z.number().min(0).max(1).default(0.05),
    })
    .optional(),
});

/** A freeze window: active when the local date in `timezone` meets every condition it sets. */
const freezeSchema = z
  .object({
    name: z.string().min(1),
    timezone: z
      .string()
      .default("UTC")
      .superRefine((timeZone, ctx) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone });
        } catch {
          ctx.addIssue({ code: "custom", message: `"${timeZone}" is not an IANA timezone (e.g. America/New_York)` });
        }
      }),
    days: z.array(z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"])).min(1).optional(),
    from: localDate.optional(),
    to: localDate.optional(),
    // Stricter green threshold while active; without one, auto-approval is suspended.
    green: z.number().min(0).max(100).optional(),
  })
  .superRefine(({ days, from, to }, ctx) => {
    if (!days && !from && !to) ctx.addIssue({ code: "custom", message: "a freeze window must set days, from or to" });
    if (from && to && from > to) ctx.addIssue({ code: "custom", message: `freeze from ${from} is after to ${to}`, path: ["from"] });
  });

export const configSchema = z.object({
  thresholds: thresholdsSchema.prefault({}),
  autoApprove: z
    .object({
      enabled: z.boolean().default(false),
      requireAiReview: z
        .object({
          // A check name, or { name, app } to also require the GitHub App (slug) that published the check run.
          checks: z.array(z.union([z.string(), z.strictObject({ name: z.string(), app: z.string().min(1) })])).default([]),
          // Removed in 0.1.1; kept only so that a config still listing it fails with a clear error.
          labels: z
            .undefined({
              error:
                "requireAiReview.labels was removed in 0.1.1: labels are not tied to a commit and can be added by anyone with triage access; " +
                "require a check run instead (requireAiReview.checks)",
            })
            .optional(),
        })
        .prefault({}),
      mergeMethod: z.enum(["queue", "auto-merge", "none"]).default("queue"),
      sampleRate: z.number().min(0).max(1).default(0.1),
      maxChangedLines: z.number().int().positive().default(400),
      /** Never excluded from the size cap (spec §2.3), whatever its language family; glob-matched like paths.*. */
      sizeCapExempt: globs([]),
      /** true restores pre-2026-10-20 behaviour: every changed line counts, nothing is excluded. */
      countInertLines: z.boolean().default(false),
      /** Minutes an eligible PR waits, on the same head commit, before opendrs approves it (a veto window). */
      landingDelayMinutes: z.number().int().min(0).default(0),
      /**
       * RADAR's deferred review: a PR whose score is at or above green but below `below` (thresholds.mode
       * units), and that passes every other rule, is approved and lands now, with a human review assigned
       * after merge. Only for the listed sources; the trusted floor must be listed too.
       */
      deferredReview: z
        .object({
          enabled: z.boolean().default(false),
          below: z.number().optional(),
          sources: z.array(z.enum(["human", "bot", "agent"])).default(["human"]),
        })
        .prefault({}),
    })
    .prefault({}),
  paths: z
    .object({
      block: globs([]),
      critical: globs([]),
      unblock: z.array(z.string().superRefine(unblockable)).default([]),
      instructions: globs([]),
      ignore: globs([
        "**/*.lock",
        "**/package-lock.json",
        "**/pnpm-lock.yaml",
        "**/go.sum",
        "**/dist/**",
        "**/vendor/**",
        "**/node_modules/**",
        "**/*.min.js",
        "**/*.snap",
      ]),
      tests: globs([
        "**/test/**",
        "**/tests/**",
        "**/__tests__/**",
        "**/*.test.*",
        "**/*.spec.*",
        "**/*_test.*",
        "**/test_*.py",
        "**/spec/**",
        "**/*_spec.rb",
        "**/Tests/**",
        "**/*Tests.swift",
      ]),
    })
    // block and critical extend the defaults (ignore and tests replace theirs); unblock wins over both.
    .transform((p) => ({
      ...p,
      block: union(DEFAULT_BLOCK, p.block).filter((g) => !p.unblock.includes(g)),
      critical: union(DEFAULT_CRITICAL, p.critical),
      instructions: union(DEFAULT_INSTRUCTIONS, p.instructions),
    }))
    .prefault({}),
  content: z
    .object({
      // JS regular expressions matched against each added line; a match is never auto-approved.
      block: z.array(z.string().superRefine(compiles)).default([]),
    })
    .prefault({}),
  llm: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(["anthropic", "openai"]).default("anthropic"),
      model: z.string().default("claude-sonnet-5"),
      baseUrl: z.string().optional(),
      apiKeyEnv: z.string().optional(),
      includeDescription: z.boolean().default(false),
      maxDiffChars: z.number().int().positive().default(60_000),
      /** Auto-approve only when the judge calls every hunk it saw safe, with at least minConfidence. */
      requireSafe: z.boolean().default(false),
      minConfidence: z.number().int().min(0).max(10).default(8),
      /** Phase 2: a second, batched LLM call that verifies the brief's facts, hunks and checks (verification spec §3). */
      verify: z
        .object({
          enabled: z.boolean().default(false),
          /** Estimated prompt tokens (chars / 3.5) above which the call is skipped and the brief fails open. */
          maxTokens: z.number().int().positive().default(40_000),
        })
        .prefault({}),
    })
    .prefault({}),
  history: z
    .object({
      lookbackDays: z.number().int().positive().default(365),
      fixPattern: z.string().default("\\b(fix(es|ed)?|bug|hotfix|regression|incident|sev\\d?|revert)\\b"),
      maxCommits: z.number().int().positive().default(20_000),
      /** calibrate/backtest leave out commits this many days younger than the newest: their bugs may not be found yet. 0 = off. */
      labelHorizonDays: z.number().int().min(0).default(60),
      /** Timeout for the one-time `git log` history scan, in ms. Raise this (or lower maxCommits) if it times out on a large or blobless clone. */
      gitTimeoutMs: z.number().int().positive().default(600_000),
    })
    .prefault({}),
  graph: z
    .object({
      enabled: z.boolean().default(true),
      maxDepth: z.number().int().min(1).max(10).default(3),
      maxFiles: z.number().int().positive().default(50_000),
    })
    .prefault({}),
  /** Path to calibrated model JSON, relative to repo root. Used when it exists. */
  model: z.string().default(".opendrs/model.json"),
  brief: z
    .object({
      /** Token budget for the review brief's Markdown (characters / 3.5); 300 is roughly the cost of the mandatory sections alone, the hard ceiling is 6000. */
      maxTokens: z.number().int().min(300, "brief.maxTokens must be at least 300 (the mandatory sections alone cost roughly that many tokens)").max(6_000).default(2_500),
    })
    .prefault({}),
  captain: z
    .object({
      /** false: no captain line, block, labels, output or brief section (spec §9). */
      enabled: z.boolean().default(true),
      /**
       * Path segments that make a module for the layers detector (spec §6.2), when set explicitly.
       * Unset (the default): modules are auto-detected from each ecosystem's own package/workspace
       * manifests (module-boundaries spec §3), falling back to a flat depth of 2 only where no
       * manifest is found. Setting this disables auto-detection for the whole repo and goes back to
       * today's flat-depth behaviour everywhere.
       */
      moduleDepth: z.number().int().min(1).max(6).optional(),
      /** Literal globs overriding auto-detection, e.g. one glob per package's source tree; highest precedence (module-boundaries spec §5). */
      modules: globs([]),
      coupling: z
        .object({
          // Tuned on ApacheJIT (spec §10.1; docs/experiments.md, "Change coupling on ApacheJIT"):
          // test lift 1.931x at minSupport 8 / minConfidence 0.6, chosen by train lift.
          enabled: z.boolean().default(true),
          minSupport: z.number().int().min(2).default(8),
          minConfidence: z.number().min(0).max(1).default(0.6),
        })
        .prefault({}),
      contracts: z
        .object({
          /** Extra schema/contract globs, added to the defaults (spec §6.3). */
          paths: globs([]),
        })
        .prefault({}),
    })
    .prefault({}),
  freezes: z.array(freezeSchema).default([]),
  sources: z
    .object({
      human: sourcePolicySchema.prefault({}),
      bot: sourcePolicySchema.prefault({}),
      agent: sourcePolicySchema
        .extend({
          /** Extra regexes (case-insensitive) over commit messages and author emails that mark agent authorship. */
          patterns: z
            .array(
              z.string().superRefine((pattern, ctx) => {
                try {
                  new RegExp(pattern, "i");
                } catch (e) {
                  ctx.addIssue({ code: "custom", message: `invalid regex: ${(e as Error).message}` });
                }
              }),
            )
            .default([]),
        })
        .prefault({}),
    })
    .prefault({}),
})
  .superRefine(({ thresholds, freezes, llm, sources, autoApprove }, ctx) => {
    const deferred = autoApprove.deferredReview;
    if (deferred.enabled && (deferred.below === undefined || deferred.below <= thresholds.green || deferred.below > thresholds.yellow)) {
      ctx.addIssue({
        code: "custom",
        message: `autoApprove.deferredReview.below must be set above thresholds.green (${thresholds.green}) and at most thresholds.yellow (${thresholds.yellow}), in ${thresholds.mode} units`,
        path: ["autoApprove", "deferredReview", "below"],
      });
    }
    if (deferred.enabled && deferred.sources.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "autoApprove.deferredReview.sources must list at least one source kind (a PR from a user account is human); with none, deferral can never apply",
        path: ["autoApprove", "deferredReview", "sources"],
      });
    }
    for (const kind of ["human", "bot", "agent"] as const) {
      const policy = sources[kind];
      if (policy.green !== undefined && policy.green >= thresholds.green) {
        ctx.addIssue({
          code: "custom",
          message: `sources.${kind}.green ${policy.green} must be less than thresholds.green (${thresholds.green}): a source can only tighten the gate`,
          path: ["sources", kind, "green"],
        });
      }
      if (policy.requireSafe && !llm.enabled) {
        ctx.addIssue({ code: "custom", message: `sources.${kind}.requireSafe needs llm.enabled: true`, path: ["sources", kind, "requireSafe"] });
      }
    }
    if (llm.requireSafe && !llm.enabled) {
      ctx.addIssue({ code: "custom", message: "llm.requireSafe needs llm.enabled: true", path: ["llm", "requireSafe"] });
    }
    freezes.forEach((f, i) => {
      if (f.green === undefined || f.green < thresholds.green) return;
      ctx.addIssue({
        code: "custom",
        message: `freeze "${f.name}" green ${f.green} must be less than thresholds.green (${thresholds.green}), in ${thresholds.mode} units`,
        path: ["freezes", i, "green"],
      });
    });
  });

export type OpendrsConfig = z.infer<typeof configSchema>;

export function parseConfig(raw: unknown): OpendrsConfig {
  const result = configSchema.safeParse(raw ?? {});
  if (!result.success) {
    throw new OpendrsError(`Invalid ${CONFIG_FILE}: ${z.prettifyError(result.error)}`, "config");
  }
  return result.data;
}

export const defaultConfig = (): OpendrsConfig => parseConfig({});

/** Load .opendrs.yml from a directory; missing file means defaults. */
export async function loadConfig(repoDir: string): Promise<OpendrsConfig> {
  let text: string;
  try {
    text = await readFile(join(repoDir, CONFIG_FILE), "utf8");
  } catch {
    return defaultConfig();
  }
  return parseConfigText(text);
}

/** Parse YAML text (e.g. config read from the base branch via `git show`). */
export function parseConfigText(text: string): OpendrsConfig {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    throw new OpendrsError(`Invalid ${CONFIG_FILE}: ${(e as Error).message}`, "config");
  }
  return parseConfig(raw);
}
