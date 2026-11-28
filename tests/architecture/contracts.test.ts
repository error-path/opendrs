import { afterEach, describe, expect, it } from "vitest";
import { detectContracts } from "../../src/architecture/contracts.js";
import { defaultConfig, parseConfig, type OpendrsConfig } from "../../src/domain/config.js";
import type { ScoringContext } from "../../src/domain/types.js";
import { makeContext } from "../../src/engine.js";
import { loadDiff } from "../../src/git/diff.js";
import { buildDependencyGraph } from "../../src/graph/graph.js";
import { makeRepo, type TestRepo } from "../helpers/repo.js";

async function contextFor(repo: TestRepo, base: string, head = "HEAD", config: OpendrsConfig = defaultConfig()): Promise<ScoringContext> {
  const diff = await loadDiff(repo.dir, base, head, config);
  const graph = config.graph.enabled ? await buildDependencyGraph(repo.dir, diff.base, config) : undefined;
  return makeContext(repo.dir, diff, config, { commits: [], fileCommits: () => [], fileCreator: () => undefined, authorCommitCount: () => 0 }, graph);
}

let repo: TestRepo;
afterEach(() => repo?.cleanup());

describe("detectContracts: contract.dependency", () => {
  it("a new runtime dependency is a strong fact naming the file and the line of the new key", async () => {
    repo = makeRepo();
    const base = repo.commit({ "package.json": JSON.stringify({ dependencies: { foo: "^1.0.0" } }, null, 2) }, "base");
    repo.commit({ "package.json": JSON.stringify({ dependencies: { foo: "^1.0.0", jsonwebtoken: "^9.0.0" } }, null, 2) }, "head");

    const { facts, notes } = await detectContracts(await contextFor(repo, base), {});

    expect(notes).toEqual([]);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ id: "contract.dependency", weight: "strong", file: "package.json" });
    expect(facts[0]!.line).toBe(4); // the "jsonwebtoken" line
    expect(facts[0]!.text).toContain("jsonwebtoken");
    expect(facts[0]!.text).toContain("package.json:4");
  });

  it("an invalid manifest yields a note, not a fact or a throw", async () => {
    repo = makeRepo();
    const base = repo.commit({ "package.json": JSON.stringify({ dependencies: {} }) }, "base");
    repo.commit({ "package.json": "{ not json" }, "head");

    const { facts, notes } = await detectContracts(await contextFor(repo, base), {});

    expect(facts).toEqual([]);
    expect(notes).toHaveLength(1);
  });
});

describe("detectContracts: contract.dependency for go.mod // indirect", () => {
  it("promoting an indirect dependency to direct is strong; a new indirect-only dependency is info", async () => {
    repo = makeRepo();
    const base = repo.commit(
      { "go.mod": "module example.com/app\n\nrequire (\n\tgithub.com/charmbracelet/x/ansi v1.2.3 // indirect\n)\n" },
      "base",
    );
    repo.commit(
      {
        "go.mod":
          "module example.com/app\n\nrequire (\n\tgithub.com/charmbracelet/x/ansi v1.2.3\n\tgithub.com/new/indirect v0.1.0 // indirect\n)\n",
      },
      "head",
    );

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    const depFacts = facts.filter((f) => f.id === "contract.dependency");
    expect(depFacts).toHaveLength(2);
    expect(depFacts.find((f) => f.text.includes("charmbracelet"))).toMatchObject({ weight: "strong" });
    expect(depFacts.find((f) => f.text.includes("github.com/new/indirect"))).toMatchObject({ weight: "info" });
  });
});

describe("detectContracts: contract.api", () => {
  it("names a Java declaration on a long public line without a parenthesis in linear time", async () => {
    repo = makeRepo();
    const base = repo.commit({ "src/A.java": "class A {}\n" }, "base");
    // `([A-Za-z_]\w*)\s*\(` unanchored used to rescan the rest of the word from every letter.
    repo.commit({ "src/A.java": `class A {}\npublic ${"a".repeat(50_000)}\n` }, "head");
    const context = await contextFor(repo, base);
    const started = performance.now();
    await detectContracts(context, {});
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("removing an exported declaration from a file with a dependent is a strong fact", async () => {
    repo = makeRepo();
    const base = repo.commit(
      {
        "src/auth/token.ts": "export function parseToken(raw: string) {\n  return raw;\n}\n",
        "src/auth/user.ts": 'import { parseToken } from "./token";\nparseToken("x");\n',
      },
      "base",
    );
    repo.commit({ "src/auth/token.ts": "export function other() {\n  return 1;\n}\n" }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    const apiFacts = facts.filter((f) => f.id === "contract.api");
    expect(apiFacts).toHaveLength(1);
    expect(apiFacts[0]).toMatchObject({ weight: "strong", file: "src/auth/token.ts" });
    expect(apiFacts[0]!.text).toContain("parseToken");
    expect(apiFacts[0]!.text).toContain("imported by 1 file");
  });

  it("an added public declaration with no matching deletion is info when the file has a dependent at base", async () => {
    repo = makeRepo();
    const base = repo.commit(
      { "src/util.ts": "export const a = 1;\n", "src/caller.ts": 'import { a } from "./util";\na;\n' },
      "base",
    );
    repo.commit({ "src/util.ts": "export const a = 1;\nexport function helper() {\n  return 2;\n}\n" }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    const apiFacts = facts.filter((f) => f.id === "contract.api");
    expect(apiFacts).toHaveLength(1);
    expect(apiFacts[0]).toMatchObject({ weight: "info", file: "src/util.ts" });
    expect(apiFacts[0]!.text).toContain("helper");
  });

  it("an added public declaration in a file with no dependent at base is not a fact", async () => {
    repo = makeRepo();
    const base = repo.commit({ "src/util.ts": "export const a = 1;\n" }, "base");
    repo.commit({ "src/util.ts": "export const a = 1;\nexport function helper() {\n  return 2;\n}\n" }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    expect(facts.filter((f) => f.id === "contract.api")).toEqual([]);
  });

  it("a brand-new file never produces a contract.api fact, even with a dependent at head", async () => {
    repo = makeRepo();
    const base = repo.commit({}, "base");
    repo.commit(
      {
        "src/newfile.ts": "export function helper() {\n  return 2;\n}\n",
        "src/caller.ts": 'import { helper } from "./newfile";\nhelper();\n',
      },
      "head",
    );

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    expect(facts.filter((f) => f.id === "contract.api")).toEqual([]);
  });

  it("aggregates several added declarations in one file into a single info fact", async () => {
    repo = makeRepo();
    const base = repo.commit(
      { "src/util.ts": "export const a = 1;\n", "src/caller.ts": 'import { a } from "./util";\na;\n' },
      "base",
    );
    repo.commit(
      {
        "src/util.ts":
          "export const a = 1;\nexport function one() {\n  return 1;\n}\nexport function two() {\n  return 2;\n}\nexport function three() {\n  return 3;\n}\nexport function four() {\n  return 4;\n}\n",
      },
      "head",
    );

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    const apiFacts = facts.filter((f) => f.id === "contract.api");
    expect(apiFacts).toHaveLength(1);
    expect(apiFacts[0]).toMatchObject({ weight: "info", file: "src/util.ts" });
    expect(apiFacts[0]!.text).toContain("4 exported declarations");
    expect(apiFacts[0]!.text).toContain("`one`");
    expect(apiFacts[0]!.text).toContain("`two`");
    expect(apiFacts[0]!.text).toContain("`three`");
    expect(apiFacts[0]!.text).not.toContain("`four`");
    expect(apiFacts[0]!.text).toContain("…");
  });

  it("aggregates several deleted declarations in one file into a single fact with a count", async () => {
    repo = makeRepo();
    const base = repo.commit(
      {
        "src/auth/token.ts":
          "export function one() {\n  return 1;\n}\nexport function two() {\n  return 2;\n}\nexport function three() {\n  return 3;\n}\nexport function four() {\n  return 4;\n}\n",
        "src/auth/user.ts": 'import { one } from "./token";\none();\n',
      },
      "base",
    );
    repo.commit({ "src/auth/token.ts": "export function other() {\n  return 0;\n}\n" }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    const apiFacts = facts.filter((f) => f.id === "contract.api");
    expect(apiFacts).toHaveLength(1);
    expect(apiFacts[0]).toMatchObject({ weight: "strong", file: "src/auth/token.ts" });
    expect(apiFacts[0]!.text).toContain("4 exported declarations");
    expect(apiFacts[0]!.text).toContain("`one`");
    expect(apiFacts[0]!.text).toContain("`two`");
    expect(apiFacts[0]!.text).toContain("`three`");
    expect(apiFacts[0]!.text).not.toContain("`four`");
    expect(apiFacts[0]!.text).toContain("…");
    expect(apiFacts[0]!.text).toContain("imported by 1 file");
  });
});

describe("detectContracts: contract.schema", () => {
  it("a changed migration/sql file is a strong contract.schema fact", async () => {
    repo = makeRepo();
    const base = repo.commit({ "db/migrations/001.sql": "create table a;\n" }, "base");
    repo.commit({ "db/migrations/001.sql": "create table a;\nalter table a add column b int;\n" }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    const schemaFacts = facts.filter((f) => f.id === "contract.schema");
    expect(schemaFacts).toHaveLength(1);
    expect(schemaFacts[0]).toMatchObject({ weight: "strong", file: "db/migrations/001.sql" });
  });

  it("four schema files report three facts plus a note counting the rest", async () => {
    repo = makeRepo();
    const base = repo.commit(
      { "a.sql": "1\n", "b.sql": "1\n", "c.sql": "1\n", "d.sql": "1\n" },
      "base",
    );
    repo.commit({ "a.sql": "2\n", "b.sql": "2\n", "c.sql": "2\n", "d.sql": "2\n" }, "head");

    const { facts, notes } = await detectContracts(await contextFor(repo, base), {});

    expect(facts.filter((f) => f.id === "contract.schema")).toHaveLength(3);
    expect(notes).toContain("1 more schema file");
  });

  it("matches an extra glob from captain.contracts.paths", async () => {
    repo = makeRepo();
    const config = parseConfig({ captain: { contracts: { paths: ["**/*.custom-schema"] } } });
    const base = repo.commit({ "x.custom-schema": "1\n" }, "base");
    repo.commit({ "x.custom-schema": "2\n" }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base, "HEAD", config), {});

    expect(facts.filter((f) => f.id === "contract.schema")).toHaveLength(1);
  });

  it("escapes a backtick in a schema file's path so it cannot break out of the rendered code span", async () => {
    repo = makeRepo();
    const path = "db/migrations/weird`file.sql";
    const base = repo.commit({ [path]: "create table a;\n" }, "base");
    repo.commit({ [path]: "alter table a;\n" }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    const schemaFacts = facts.filter((f) => f.id === "contract.schema");
    expect(schemaFacts).toHaveLength(1);
    expect(schemaFacts[0]!.text).not.toContain("`file.sql");
  });

  it("ignores a schema file under an ignored path", async () => {
    repo = makeRepo();
    const base = repo.commit({ "vendor/migrations/001.sql": "create table a;\n" }, "base");
    repo.commit({ "vendor/migrations/001.sql": "alter table a;\n" }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    expect(facts).toEqual([]);
  });
});

describe("detectContracts: contract.instructions", () => {
  it("a changed CLAUDE.md is a strong contract.instructions fact", async () => {
    repo = makeRepo();
    const base = repo.commit({ "CLAUDE.md": "rules\n" }, "base");
    repo.commit({ "CLAUDE.md": "rules\nmore\n" }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    const instructionFacts = facts.filter((f) => f.id === "contract.instructions");
    expect(instructionFacts).toHaveLength(1);
    expect(instructionFacts[0]).toMatchObject({ weight: "strong", file: "CLAUDE.md" });
    expect(instructionFacts[0]!.text).toBe("Changes agent instructions: `CLAUDE.md`.");
  });

  it("four instruction files report three facts plus a note counting the rest", async () => {
    repo = makeRepo();
    const base = repo.commit(
      { "CLAUDE.md": "1\n", "AGENTS.md": "1\n", ".cursorrules": "1\n", "a/SKILL.md": "1\n" },
      "base",
    );
    repo.commit({ "CLAUDE.md": "2\n", "AGENTS.md": "2\n", ".cursorrules": "2\n", "a/SKILL.md": "2\n" }, "head");

    const { facts, notes } = await detectContracts(await contextFor(repo, base), {});

    expect(facts.filter((f) => f.id === "contract.instructions")).toHaveLength(3);
    expect(notes).toContain("1 more instruction file");
  });

  it("a plain .md file that is not on the instructions list is not a contract.instructions fact", async () => {
    repo = makeRepo();
    const base = repo.commit({ "README.md": "1\n" }, "base");
    repo.commit({ "README.md": "2\n" }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    expect(facts.filter((f) => f.id === "contract.instructions")).toHaveLength(0);
  });
});

describe("detectContracts: contract.env", () => {
  it("a new environment variable not present at base is a strong fact", async () => {
    repo = makeRepo();
    const base = repo.commit({ "src/config.ts": "export const x = 1;\n" }, "base");
    repo.commit({ "src/config.ts": 'export const x = 1;\nconst secret = process.env.NEW_VAR;\n' }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    const envFacts = facts.filter((f) => f.id === "contract.env");
    expect(envFacts).toHaveLength(1);
    expect(envFacts[0]).toMatchObject({ weight: "strong", file: "src/config.ts" });
    expect(envFacts[0]!.text).toContain("NEW_VAR");
  });

  it("an environment variable already referenced at base does not fire", async () => {
    repo = makeRepo();
    const base = repo.commit({ "src/other.ts": "const existing = process.env.PATH_X;\n", "src/config.ts": "export const x = 1;\n" }, "base");
    repo.commit({ "src/config.ts": 'export const x = 1;\nconst p = process.env.PATH_X;\n' }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    expect(facts.filter((f) => f.id === "contract.env")).toEqual([]);
  });

  it("does not scan a docs file for a new environment variable", async () => {
    repo = makeRepo();
    const base = repo.commit({ "docs/plan.md": "notes\n" }, "base");
    repo.commit({ "docs/plan.md": "notes\nsee `process.env.NEW_VAR`\n" }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    expect(facts.filter((f) => f.id === "contract.env")).toEqual([]);
  });

  it("does not scan a test file for a new environment variable", async () => {
    repo = makeRepo();
    const base = repo.commit({ "tests/architecture/contracts.test.ts": "const x = 1;\n" }, "base");
    repo.commit({ "tests/architecture/contracts.test.ts": 'const x = 1;\nconst p = process.env.PATH_X;\n' }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    expect(facts.filter((f) => f.id === "contract.env")).toEqual([]);
  });

  it("recognizes Go's os.LookupEnv", async () => {
    repo = makeRepo();
    const base = repo.commit({ "main.go": "package main\n" }, "base");
    repo.commit({ "main.go": 'package main\nfunc f() { v, _ := os.LookupEnv("NEW_GO_VAR") }\n' }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    const envFacts = facts.filter((f) => f.id === "contract.env");
    expect(envFacts).toHaveLength(1);
    expect(envFacts[0]!.text).toContain("NEW_GO_VAR");
  });

  it("recognizes Swift's Environment.get", async () => {
    repo = makeRepo();
    const base = repo.commit({ "main.swift": "// nothing\n" }, "base");
    repo.commit({ "main.swift": 'let v = Environment.get("NEW_SWIFT_VAR")\n' }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    const envFacts = facts.filter((f) => f.id === "contract.env");
    expect(envFacts).toHaveLength(1);
    expect(envFacts[0]!.text).toContain("NEW_SWIFT_VAR");
  });

  it("recognizes Swift's ProcessInfo.processInfo.environment[...]", async () => {
    repo = makeRepo();
    const base = repo.commit({ "main.swift": "// nothing\n" }, "base");
    repo.commit({ "main.swift": 'let v = ProcessInfo.processInfo.environment["NEW_PI_VAR"]\n' }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    const envFacts = facts.filter((f) => f.id === "contract.env");
    expect(envFacts).toHaveLength(1);
    expect(envFacts[0]!.text).toContain("NEW_PI_VAR");
  });

  it("recognizes Python's os.environ.setdefault", async () => {
    repo = makeRepo();
    const base = repo.commit({ "app.py": "x = 1\n" }, "base");
    repo.commit({ "app.py": 'x = 1\nos.environ.setdefault("NEW_PY_VAR", "x")\n' }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    const envFacts = facts.filter((f) => f.id === "contract.env");
    expect(envFacts).toHaveLength(1);
    expect(envFacts[0]!.text).toContain("NEW_PY_VAR");
  });

  it("aggregates several new environment variables in one file into a single fact with a count", async () => {
    repo = makeRepo();
    const base = repo.commit({ "src/config.ts": "export const x = 1;\n" }, "base");
    repo.commit(
      { "src/config.ts": 'export const x = 1;\nconst a = process.env.VAR_A;\nconst b = process.env.VAR_B;\n' },
      "head",
    );

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    const envFacts = facts.filter((f) => f.id === "contract.env");
    expect(envFacts).toHaveLength(1);
    expect(envFacts[0]).toMatchObject({ weight: "strong", file: "src/config.ts" });
    expect(envFacts[0]!.text).toContain("2 new environment variables");
    expect(envFacts[0]!.text).toContain("VAR_A");
    expect(envFacts[0]!.text).toContain("VAR_B");
  });

  it("does not scan a generated lock file (*.lock.yml) for a new environment variable", async () => {
    repo = makeRepo();
    const base = repo.commit({ "issue-triage.lock.yml": "x: 1\n" }, "base");
    repo.commit({ "issue-triage.lock.yml": 'x: 1\ntoken: ${{ env.NEW_VAR }}\nv: process.env.NEW_VAR\n' }, "head");

    const { facts } = await detectContracts(await contextFor(repo, base), {});

    expect(facts.filter((f) => f.id === "contract.env")).toEqual([]);
  });
});
