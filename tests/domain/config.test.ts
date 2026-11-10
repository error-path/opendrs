import { describe, expect, it } from "vitest";
import { defaultConfig, parseConfig } from "../../src/domain/config.js";
import { OpendrsError } from "../../src/domain/types.js";
import { matchAny } from "../../src/git/glob.js";

const configError = (raw: unknown): string => {
  try {
    parseConfig(raw);
  } catch (e) {
    expect(e).toBeInstanceOf(OpendrsError);
    return (e as OpendrsError).message;
  }
  throw new Error("expected parseConfig to throw");
};

describe("default paths.ignore", () => {
  it("does not ignore source directories named build", () => {
    const { ignore } = defaultConfig().paths;
    expect(ignore).not.toContain("**/build/**");
    expect(matchAny(ignore, "scripts/build/release.ts")).toBe(false);
  });
});

describe("default paths.tests", () => {
  const isTest = (path: string) => matchAny(defaultConfig().paths.tests, path);

  it.each([
    "spec/models/user_spec.rb", // RSpec directory
    "lib/foo/thing_spec.rb", // RSpec file suffix, no spec/ directory
    "Tests/VaporTests/EnvironmentTests.swift", // Swift XCTest directory (capital T)
    "Sources/Vapor/Utilities/DotEnvTests.swift", // Swift XCTest file suffix
    "pkg/cart/cart_test.go", // Go
    "pkg/test_mod.py", // Python test_*.py
    "pkg/mod_test.py", // Python *_test.py
    "tests/test_integration.py", // Python tests/** directory
    "src/foo.test.ts", // JS/TS
    "src/foo.spec.ts",
    "src/__tests__/foo.ts",
    "src/test/java/com/acme/FooTest.java", // Kotlin/Java src/test/**
  ])("recognises %s as a test path", (path) => {
    expect(isTest(path)).toBe(true);
  });

  it.each([
    "src/foo.ts",
    "Sources/Vapor/Utilities/DotEnv.swift",
    "lib/foo.rb",
  ])("does not treat %s as a test path", (path) => {
    expect(isTest(path)).toBe(false);
  });
});

describe("default paths.block", () => {
  const blocked = (path: string) => matchAny(defaultConfig().paths.block, path);

  it("blocks .gitmodules, which can repoint a submodule at another repository", () => {
    expect(blocked(".gitmodules")).toBe(true);
  });

  it.each([".gitattributes", "tools/.gitattributes"])("blocks %s, which can make git call a binary text", (path) => {
    expect(blocked(path)).toBe(true);
  });

  it.each([
    "package.json",
    "web/package.json",
    ".npmrc",
    ".yarnrc",
    "web/.yarnrc.yml",
    ".pnpmfile.cjs",
    "setup.py",
    "pkg/setup.cfg",
    "pyproject.toml",
    "pip.conf",
    "build.gradle",
    "app/build.gradle.kts",
    "settings.gradle",
    "settings.gradle.kts",
    "gradle/wrapper/gradle-wrapper.properties",
    "sub/gradle/wrapper/gradle-wrapper.jar",
    "pom.xml",
    ".mvn/wrapper/maven-wrapper.properties",
    "Cargo.toml",
    "crates/x/build.rs",
    "go.mod",
    "Package.swift",
    "sub/Package.swift",
    "Gemfile",
    "Rakefile",
    "lib/x.gemspec",
    "Makefile",
    "native/Makefile",
    "Dockerfile",
    "svc/Dockerfile.dev",
    "docker-compose.yml",
    "deploy/docker-compose.prod.yml",
    ".gitlab-ci.yml",
    "Jenkinsfile",
    ".circleci/config.yml",
    "azure-pipelines.yml",
    ".buildkite/pipeline.yml",
  ])("blocks %s, which can run code at install, build or CI time", (path) => {
    expect(blocked(path)).toBe(true);
  });

  it.each([
    "makefile",
    "GNUmakefile",
    "lib/rules.mk",
    "compose.yaml",
    "deploy/compose.yml",
    "docker-compose.yaml",
    "Data/Migrations/20240101_Init.cs",
    "db/migrate/20240101_add_users.rb",
    "src/main/resources/db/migration/V1__init.sql",
    "requirements.txt",
    "requirements-dev.txt",
    "tests/conftest.py",
    ".pre-commit-config.yaml",
    "tox.ini",
    "noxfile.py",
    "App/App.csproj",
    "App.sln",
    "Directory.Build.props",
    "Directory.Build.targets",
    "NuGet.Config",
    "CMakeLists.txt",
    "cmake/deps.cmake",
    ".cargo/config.toml",
    ".husky/pre-commit",
    "Brewfile",
    "Vagrantfile",
    "Procfile",
    "default.nix",
    "flake.lock",
    ".devcontainer/devcontainer.json",
    ".envrc",
    "Taskfile.yml",
    "justfile",
    "bitbucket-pipelines.yml",
    ".drone.yml",
    ".travis.yml",
    "cloudbuild.yaml",
    "Earthfile",
    "pkg/BUILD",
    "pkg/BUILD.bazel",
    "WORKSPACE",
    "WORKSPACE.bazel",
    "MODULE.bazel",
    "tools/defs.bzl",
    "dockerfile",
    "infra/Main.TF",
    ".GITHUB/workflows/ci.yml",
  ])("blocks %s, matching case-insensitively", (path) => {
    expect(matchAny(defaultConfig().paths.block, path, { ignoreCase: true })).toBe(true);
  });

  it("keeps the original entries and leaves ordinary source alone", () => {
    expect(defaultConfig().paths.block).toEqual(
      expect.arrayContaining([".github/**", ".opendrs.yml", ".opendrs/**", "**/CODEOWNERS", "**/migrations/**", "**/*.tf"]),
    );
    for (const path of ["src/a.ts", "docs/Makefile.md", "src/package.ts", "README.md", "src/build.rs.md", "src/build/index.ts", "docs/requirements.md"]) {
      expect(matchAny(defaultConfig().paths.block, path, { ignoreCase: true }), path).toBe(false);
    }
  });

  it.each([
    ".claude/settings.json",
    ".claude/hooks/format.sh",
    ".claude/commands/deploy.md",
    "plugin/.claude-plugin/plugin.json",
    "plugin/hooks/hooks.json",
    "plugin/commands/opendrs-review.md",
    "plugin/skills/opendrs/SKILL.md",
    ".mcp.json",
    "plugin/.mcp.json",
    ".cursor/mcp.json",
    ".vscode/mcp.json",
    ".vscode/tasks.json",
  ])("blocks %s, agent or editor config that can run commands", (path) => {
    expect(matchAny(defaultConfig().paths.block, path, { ignoreCase: true })).toBe(true);
  });

  it.each([
    ".gitlab-ci.yaml",
    ".gitlab/ci/build.yml",
    "ci/Jenkinsfile",
    "Jenkinsfile.release",
    "azure-pipelines.yaml",
    "build/azure-pipelines.release.yml",
    ".gitea/workflows/ci.yml",
    ".forgejo/workflows/ci.yml",
    ".woodpecker.yml",
    ".woodpecker/build.yaml",
    ".semaphore/semaphore.yml",
    ".teamcity/settings.kts",
    "appveyor.yml",
    ".appveyor.yml",
  ])("blocks %s, a CI pipeline under another name or folder", (path) => {
    expect(matchAny(defaultConfig().paths.block, path, { ignoreCase: true })).toBe(true);
  });

  it.each([
    "gradlew",
    "android/gradlew.bat",
    "gradle.properties",
    "mvnw",
    "mvnw.cmd",
    ".yarn/plugins/plugin.cjs",
    ".yarn/releases/yarn-4.1.0.cjs",
    "pnpm-workspace.yaml",
    "bunfig.toml",
    "deno.json",
    "deno.jsonc",
    "lefthook.yml",
    ".lefthook.yaml",
    "Pipfile",
    "ios/Podfile",
    "composer.json",
    "mix.exs",
    "build.sbt",
    "project/plugins.sbt",
    "go.work",
    "rust-toolchain.toml",
    "configure",
    "configure.ac",
    "Makefile.am",
    "Makefile.in",
    "meson.build",
    "Containerfile",
    "Tiltfile",
    ".bazelrc",
    "prod.tfvars",
    "main.tf.json",
    "prod.tfvars.json",
    ".terraform.lock.hcl",
    "live/terragrunt.hcl",
    "infra/main.bicep",
    "Pulumi.yaml",
    "Pulumi.prod.yaml",
    "serverless.yml",
    "prisma/schema.prisma",
    "db/alembic/versions/0001_init.py",
    "OWNERS",
    "pkg/OWNERS_ALIASES",
    "renovate.json",
    "renovate.json5",
    ".renovaterc",
    ".renovaterc.json",
  ])("blocks %s, a build, install, infrastructure or ownership file", (path) => {
    expect(matchAny(defaultConfig().paths.block, path, { ignoreCase: true })).toBe(true);
  });

  it("leaves plain agent instructions and ordinary source to the score", () => {
    for (const path of [
      "CLAUDE.md",
      "AGENTS.md",
      "src/cli/commands/review.ts",
      "docs/cli-and-mcp.md",
      "src/hooks/useAuth.ts",
      "src/configure.ts",
      "vite.config.ts",
      ".vscode/settings.json",
      "src/skills/parse.ts",
    ]) {
      expect(matchAny(defaultConfig().paths.block, path, { ignoreCase: true }), path).toBe(false);
    }
  });
});

describe("user paths.block, paths.critical and paths.unblock", () => {
  const defaults = defaultConfig().paths;

  it("extend the default block list instead of replacing it", () => {
    const { block } = parseConfig({ paths: { block: ["infra/**"] } }).paths;
    expect(block).toEqual([...defaults.block, "infra/**"]);
    expect(matchAny(block, "package.json", { ignoreCase: true })).toBe(true);
  });

  it("extend the default critical list instead of replacing it", () => {
    expect(parseConfig({ paths: { critical: ["core/**"] } }).paths.critical).toEqual([...defaults.critical, "core/**"]);
  });

  it("do not duplicate a default the user lists again (as `opendrs init` writes them)", () => {
    expect(parseConfig({ paths: { block: [".github/**", "infra/**"], critical: ["**/auth/**"] } }).paths).toMatchObject({
      block: [...defaults.block, "infra/**"],
      critical: defaults.critical,
    });
  });

  it("an empty block list keeps every default", () => {
    expect(parseConfig({ paths: { block: [] } }).paths.block).toEqual(defaults.block);
  });

  it("unblock removes exactly the listed default globs", () => {
    const { block, unblock } = parseConfig({ paths: { unblock: ["**/go.mod", "**/Makefile"] } }).paths;
    expect(block).toEqual(defaults.block.filter((g) => g !== "**/go.mod" && g !== "**/Makefile"));
    expect(unblock).toEqual(["**/go.mod", "**/Makefile"]);
  });

  it("unblock wins over the same glob listed under block", () => {
    expect(parseConfig({ paths: { block: ["**/go.mod"], unblock: ["**/go.mod"] } }).paths.block).not.toContain("**/go.mod");
  });

  it("defaults to an empty unblock list", () => {
    expect(defaults.unblock).toEqual([]);
  });

  it.each([["go.mod"], ["**/GO.MOD"], ["infra/**"]])("rejects unblock entry %s that is not exactly a default glob, naming the valid ones", (entry) => {
    const message = configError({ paths: { unblock: [entry] } });
    expect(message).toContain(`"${entry}"`);
    expect(message).toContain('"**/go.mod"');
    expect(message).toContain('".github/**"');
  });

  it("keeps replace semantics for ignore and tests", () => {
    expect(parseConfig({ paths: { ignore: ["gen/**"], tests: ["spec/**"] } }).paths).toMatchObject({ ignore: ["gen/**"], tests: ["spec/**"] });
  });
});

describe("paths.instructions", () => {
  it("is additive like block and critical: a config's own list extends the defaults", () => {
    const defaults = defaultConfig().paths.instructions;
    expect(defaults).toContain("**/CLAUDE.md");
    expect(defaults).toContain(".claude/**");
    expect(parseConfig({ paths: { instructions: ["**/MY_AGENT.md"] } }).paths.instructions).toEqual([...defaults, "**/MY_AGENT.md"]);
  });
});

describe("autoApprove.sizeCapExempt and autoApprove.countInertLines", () => {
  it("sizeCapExempt defaults to empty and gets the same glob validation as other lists", () => {
    expect(defaultConfig().autoApprove.sizeCapExempt).toEqual([]);
    expect(() => parseConfig({ autoApprove: { sizeCapExempt: ["[bad"] } })).toThrow(/\[ or \].*sizeCapExempt/s);
  });

  it("countInertLines defaults to false", () => {
    expect(defaultConfig().autoApprove.countInertLines).toBe(false);
  });
});

describe("glob validation", () => {
  it.each([
    ["block", "src/[ab]/**"],
    ["critical", "src/auth]/**"],
    ["ignore", "/dist/**"],
    ["tests", "./tests/**"],
    ["block", "infra\\main.tf"],
  ])("rejects paths.%s glob %s, naming it", (key, glob) => {
    expect(configError({ paths: { [key]: [glob] } })).toContain(`"${glob}"`);
  });

  it("explains what is wrong", () => {
    expect(configError({ paths: { block: ["src/[ab].ts"] } })).toMatch(/\[ or \]/);
    expect(configError({ paths: { block: ["./a/**"] } })).toMatch(/leading/);
    expect(configError({ paths: { block: ["a\\b"] } })).toMatch(/forward slash/);
  });

  it("accepts the supported syntax", () => {
    expect(() => parseConfig({ paths: { block: ["**/*.{tf,tfvars}", "src/?/x.ts", ".github/**"] } })).not.toThrow();
  });
});

describe("threshold validation", () => {
  it.each([
    [{ green: -0.1, yellow: 0.6, red: 0.8 }],
    [{ green: 0.6, yellow: 0.6, red: 0.8 }],
    [{ green: 0.3, yellow: 0.9, red: 0.8 }],
    [{ green: 0.3, yellow: 0.6, red: 1.5 }],
    [{ green: 30, yellow: 60, red: 80 }],
  ])("rejects absolute thresholds outside 0 ≤ green < yellow ≤ red ≤ 1: %o", (t) => {
    expect(configError({ thresholds: { mode: "absolute", ...t } })).toMatch(/0 ≤ green < yellow ≤ red ≤ 1/);
  });

  it("accepts absolute thresholds at the bounds", () => {
    expect(() => parseConfig({ thresholds: { green: 0, yellow: 1, red: 1 } })).not.toThrow();
  });

  it.each([
    [{ green: 0, yellow: 90, red: 95 }],
    [{ green: 90, yellow: 90, red: 95 }],
    [{ green: 50, yellow: 96, red: 95 }],
    [{ green: 50, yellow: 90, red: 100 }],
  ])("rejects percentile thresholds outside 0 < green < yellow ≤ red < 100: %o", (t) => {
    expect(configError({ thresholds: { mode: "percentile", ...t } })).toMatch(/0 < green < yellow ≤ red < 100/);
  });

  it("accepts ordered percentile thresholds", () => {
    expect(() => parseConfig({ thresholds: { mode: "percentile", green: 50, yellow: 90, red: 90 } })).not.toThrow();
  });
});

describe("history.labelHorizonDays", () => {
  it("defaults to 60 days and accepts 0 (off)", () => {
    expect(defaultConfig().history.labelHorizonDays).toBe(60);
    expect(parseConfig({ history: { labelHorizonDays: 0 } }).history.labelHorizonDays).toBe(0);
  });

  it("rejects a negative horizon", () => {
    expect(configError({ history: { labelHorizonDays: -1 } })).toMatch(/labelHorizonDays/);
  });
});

describe("history.gitTimeoutMs", () => {
  it("defaults to a timeout well above the old fixed 120s, for large or blobless clones", () => {
    expect(defaultConfig().history.gitTimeoutMs).toBeGreaterThan(120_000);
  });

  it("is overridable", () => {
    expect(parseConfig({ history: { gitTimeoutMs: 5_000 } }).history.gitTimeoutMs).toBe(5_000);
  });

  it("rejects a non-positive timeout", () => {
    expect(configError({ history: { gitTimeoutMs: 0 } })).toMatch(/gitTimeoutMs/);
  });
});

describe("content.block", () => {
  it("defaults to no patterns and accepts valid regular expressions", () => {
    expect(defaultConfig().content.block).toEqual([]);
    const block = ["\\beval\\(", "dangerouslySetInnerHTML", "[Dd][Rr][Oo][Pp] [Tt][Aa][Bb][Ll][Ee]"];
    expect(parseConfig({ content: { block } }).content.block).toEqual(block);
  });

  it("rejects an entry that is not a valid regular expression, naming it", () => {
    const message = configError({ content: { block: ["ok", "(?i)drop table"] } });
    expect(message).toContain("content.block entry");
    expect(message).toContain("(?i)drop table");
  });
});

describe("freezes", () => {
  it("defaults to none, and a window's timezone to UTC", () => {
    expect(defaultConfig().freezes).toEqual([]);
    expect(parseConfig({ freezes: [{ name: "weekend", days: ["sat", "sun"] }] }).freezes[0]!.timezone).toBe("UTC");
  });

  it("accepts a dated window with a stricter green", () => {
    const window = { name: "black-friday", timezone: "America/New_York", from: "2026-11-26", to: "2026-11-30", green: 0.15 };
    expect(parseConfig({ freezes: [window] }).freezes).toEqual([window]);
  });

  it("rejects a window that sets none of days, from or to", () => {
    expect(configError({ freezes: [{ name: "always" }] })).toContain("days, from or to");
  });

  it("rejects an unknown timezone, weekday or date format", () => {
    expect(configError({ freezes: [{ name: "x", timezone: "Mars/Olympus", days: ["sat"] }] })).toContain("IANA timezone");
    expect(configError({ freezes: [{ name: "x", days: ["saturday"] }] })).toMatch(/days/);
    expect(configError({ freezes: [{ name: "x", from: "11/26/2026" }] })).toContain("YYYY-MM-DD");
  });

  it("rejects from after to", () => {
    expect(configError({ freezes: [{ name: "x", from: "2026-12-01", to: "2026-11-30" }] })).toMatch(/from .* after to/);
  });

  it("requires a freeze green stricter than thresholds.green, in the same units", () => {
    expect(configError({ freezes: [{ name: "x", days: ["sat"], green: 0.3 }] })).toContain("less than thresholds.green (0.3)");
    const percentile = { thresholds: { mode: "percentile", green: 50, yellow: 90, red: 95 } };
    expect(configError({ ...percentile, freezes: [{ name: "x", days: ["sat"], green: 60 }] })).toContain("less than thresholds.green (50)");
    expect(() => parseConfig({ ...percentile, freezes: [{ name: "x", days: ["sat"], green: 25 }] })).not.toThrow();
  });
});

describe("sources", () => {
  it("defaults every source to no green, no cap, no track record and requireSafe off", () => {
    const { human, bot, agent } = defaultConfig().sources;
    for (const policy of [human, bot, agent]) {
      expect(policy).toMatchObject({ requireSafe: false });
      expect(policy.green).toBeUndefined();
      expect(policy.dailyCap).toBeUndefined();
      expect(policy.trackRecord).toBeUndefined();
    }
    expect(agent.patterns).toEqual([]);
  });

  it("fills track record defaults (60 days, 10 commits, 5% reverts)", () => {
    expect(parseConfig({ sources: { agent: { trackRecord: {} } } }).sources.agent.trackRecord).toEqual({ days: 60, minCommits: 10, maxRevertRate: 0.05 });
  });

  it("rejects a source green at or above thresholds.green: a source can only tighten", () => {
    expect(configError({ sources: { agent: { green: 0.3 } } })).toContain("sources.agent.green 0.3 must be less than thresholds.green (0.3)");
    expect(configError({ sources: { bot: { green: 0.5 } } })).toContain("sources.bot.green");
    expect(() => parseConfig({ sources: { agent: { green: 0.2 } } })).not.toThrow();
  });

  it("rejects requireSafe without llm.enabled", () => {
    expect(configError({ sources: { agent: { requireSafe: true } } })).toContain("sources.agent.requireSafe needs llm.enabled: true");
    expect(() => parseConfig({ llm: { enabled: true }, sources: { agent: { requireSafe: true } } })).not.toThrow();
  });

  it("rejects an agent pattern that is not a valid regex", () => {
    expect(configError({ sources: { agent: { patterns: ["(?i)bot"] } } })).toContain("invalid regex");
    expect(parseConfig({ sources: { agent: { patterns: ["my-agent@"] } } }).sources.agent.patterns).toEqual(["my-agent@"]);
  });

  it("rejects a non-positive dailyCap", () => {
    expect(configError({ sources: { bot: { dailyCap: 0 } } })).toMatch(/dailyCap/);
  });
});

describe("autoApprove.landingDelayMinutes and deferredReview", () => {
  it("default to off: no delay, deferral disabled, human sources only", () => {
    const { landingDelayMinutes, deferredReview } = defaultConfig().autoApprove;
    expect(landingDelayMinutes).toBe(0);
    expect(deferredReview).toEqual({ enabled: false, sources: ["human"] });
    for (const kind of ["human", "bot", "agent"] as const) expect(defaultConfig().sources[kind].landingDelayMinutes).toBeUndefined();
  });

  it("accept a non-negative integer delay, globally and per source", () => {
    const cfg = parseConfig({ autoApprove: { landingDelayMinutes: 30 }, sources: { agent: { landingDelayMinutes: 60 } } });
    expect(cfg.autoApprove.landingDelayMinutes).toBe(30);
    expect(cfg.sources.agent.landingDelayMinutes).toBe(60);
    expect(configError({ autoApprove: { landingDelayMinutes: -1 } })).toMatch(/landingDelayMinutes/);
    expect(configError({ sources: { bot: { landingDelayMinutes: 1.5 } } })).toMatch(/landingDelayMinutes/);
  });

  it("require below in (green, yellow] once deferral is enabled, in the thresholds' units", () => {
    const message = "autoApprove.deferredReview.below must be set above thresholds.green (0.3) and at most thresholds.yellow (0.6), in absolute units";
    expect(configError({ autoApprove: { deferredReview: { enabled: true } } })).toContain(message);
    expect(configError({ autoApprove: { deferredReview: { enabled: true, below: 0.3 } } })).toContain(message);
    expect(configError({ autoApprove: { deferredReview: { enabled: true, below: 0.61 } } })).toContain(message);
    expect(() => parseConfig({ autoApprove: { deferredReview: { enabled: true, below: 0.6 } } })).not.toThrow();
    expect(() => parseConfig({ autoApprove: { deferredReview: { below: 0.3 } } })).not.toThrow();
    const percentile = { thresholds: { mode: "percentile", green: 60, yellow: 90, red: 95 } };
    expect(() => parseConfig({ ...percentile, autoApprove: { deferredReview: { enabled: true, below: 75 } } })).not.toThrow();
    expect(configError({ ...percentile, autoApprove: { deferredReview: { enabled: true, below: 95 } } })).toContain("in percentile units");
  });

  it("only accept known source kinds", () => {
    expect(configError({ autoApprove: { deferredReview: { sources: ["robot"] } } })).toMatch(/sources/);
  });

  it("reject an empty sources list once deferral is enabled: it could never apply", () => {
    expect(configError({ autoApprove: { deferredReview: { enabled: true, below: 0.45, sources: [] } } })).toContain(
      "autoApprove.deferredReview.sources must list at least one source kind",
    );
    expect(() => parseConfig({ autoApprove: { deferredReview: { sources: [] } } })).not.toThrow();
    expect(() => parseConfig({ autoApprove: { deferredReview: { enabled: true, below: 0.45, sources: ["bot"] } } })).not.toThrow();
  });
});

describe("brief", () => {
  it("defaults brief.maxTokens to 2500 and caps it at 6000", () => {
    expect(defaultConfig().brief.maxTokens).toBe(2500);
    expect(configError({ brief: { maxTokens: 7000 } })).toMatch(/brief.*maxTokens/i);
    expect(configError({ brief: { maxTokens: 0 } })).toMatch(/brief.*maxTokens/i);
    expect(parseConfig({ brief: { maxTokens: 500 } }).brief.maxTokens).toBe(500);
  });

  it("rejects a maxTokens too small to fit the brief's mandatory sections", () => {
    expect(configError({ brief: { maxTokens: 299 } })).toMatch(/brief\.maxTokens.*at least 300/i);
    expect(parseConfig({ brief: { maxTokens: 300 } }).brief.maxTokens).toBe(300);
  });
});

describe("captain", () => {
  it("defaults to enabled with moduleDepth unset (auto-detection on) and the coupling/contracts defaults", () => {
    const captain = defaultConfig().captain;
    expect(captain).toEqual({
      enabled: true,
      moduleDepth: undefined,
      modules: [],
      coupling: { enabled: true, minSupport: 8, minConfidence: 0.6 },
      contracts: { paths: [] },
    });
  });

  it("rejects a moduleDepth outside 1..6", () => {
    expect(configError({ captain: { moduleDepth: 0 } })).toMatch(/captain.*moduleDepth/i);
    expect(configError({ captain: { moduleDepth: 7 } })).toMatch(/captain.*moduleDepth/i);
    expect(parseConfig({ captain: { moduleDepth: 1 } }).captain.moduleDepth).toBe(1);
  });

  it("accepts captain.modules globs, defaulting to none", () => {
    expect(defaultConfig().captain.modules).toEqual([]);
    expect(parseConfig({ captain: { modules: ["packages/*/src/*"] } }).captain.modules).toEqual(["packages/*/src/*"]);
  });

  it("rejects a coupling.minConfidence outside 0..1", () => {
    expect(configError({ captain: { coupling: { minConfidence: 1.5 } } })).toMatch(/coupling.*minConfidence/i);
    expect(parseConfig({ captain: { coupling: { minConfidence: 0.75 } } }).captain.coupling.minConfidence).toBe(0.75);
  });
});

describe("llm.verify", () => {
  it("defaults to disabled with a 40 000-token prompt cap", () => {
    expect(defaultConfig().llm.verify).toEqual({ enabled: false, maxTokens: 40_000 });
    expect(parseConfig({ llm: { verify: { enabled: true, maxTokens: 10 } } }).llm.verify).toEqual({ enabled: true, maxTokens: 10 });
  });
});
