import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultConfig, parseConfig, type OpendrsConfig } from "../../src/domain/config.js";
import type { ChangedFile, DependencyGraph, Hunk, ScoringContext, Signal } from "../../src/domain/types.js";
import { buildDependencyGraph } from "../../src/graph/graph.js";
import { blastSignals } from "../../src/signals/blast.js";
import { makeRepo, type TestRepo } from "../helpers/repo.js";

function ctxFor(files: ChangedFile[], graph: DependencyGraph | undefined, config: OpendrsConfig = defaultConfig()): ScoringContext {
  return {
    repoDir: "/unused",
    trust: { authorVerified: true, historyComplete: true },
    diff: { base: "base", head: "head", files },
    config,
    history: { commits: [], fileCommits: () => [], fileCreator: () => undefined, authorCommitCount: () => 0 },
    graph,
    readBase: async () => undefined,
    readHead: async () => undefined,
  };
}

function changed(path: string, extra: Partial<ChangedFile> = {}): ChangedFile {
  return { path, status: "modified", added: 1, deleted: 0, binary: false, hunks: [], ignored: false, ...extra };
}

function hunk(newStart: number, lines: string[]): Hunk {
  const count = (marker: string) => lines.filter((l) => l.startsWith(marker) || l.startsWith(" ")).length;
  return { oldStart: newStart, oldLines: count("-"), newStart, newLines: count("+"), lines };
}

const byId = (signals: Signal[], id: string) => {
  const s = signals.find((x) => x.id === id);
  if (!s) throw new Error(`missing signal ${id}`);
  return s;
};

describe("blast signals", () => {
  let repo: TestRepo;
  let graph: DependencyGraph;

  beforeAll(async () => {
    repo = makeRepo();
    // hub <- a <- b <- c <- d ; leaf has no dependents.
    repo.commit(
      {
        "hub.ts": "export const hub = 1;\nconst internal = 2;\n",
        "a.ts": 'import "./hub";\nexport const a = 1;\n',
        "b.ts": 'import "./a";\n',
        "c.ts": 'import "./b";\n',
        "d.ts": 'import "./c";\n',
        "leaf.ts": "export const leaf = 1;\n",
        "util.py": "def helper():\n    pass\n",
        "main.py": "import util\n",
        "README.md": "docs\n",
      },
      "fixture",
    );
    graph = await buildDependencyGraph(repo.dir, "HEAD", defaultConfig());
  });
  afterAll(() => repo.cleanup());

  it("reports public_surface unknown, not derived 0, when a file with dependents has no readable patch", async () => {
    const signals = await blastSignals(ctxFor([changed("hub.ts", { added: 40, deleted: 3, hasUnreadablePatch: true })], graph));
    expect(byId(signals, "blast.public_surface")).toMatchObject({ status: "unknown", value: 0 });
    expect(byId(signals, "blast.dependents").status).toBe("derived");
    // A file without dependents cannot widen the surface, so its unread lines change nothing.
    const leafOnly = await blastSignals(ctxFor([changed("leaf.ts", { hasUnreadablePatch: true })], graph));
    expect(byId(leafOnly, "blast.public_surface")).toMatchObject({ status: "derived", value: 0 });
  });

  it("counts the union of transitive dependents, excluding the changed files", async () => {
    const signals = await blastSignals(ctxFor([changed("hub.ts"), changed("a.ts")], graph));
    const s = byId(signals, "blast.dependents");

    // hub -> {a,b,c}, a -> {b,c,d}; union minus changed {hub,a} = {b,c,d}
    expect(s.value).toBeCloseTo(Math.log1p(3));
    expect(s.status).toBe("derived");
    expect(s.evidence).toEqual([
      { file: "a.ts", detail: "1 direct, 3 transitive dependents" },
      { file: "hub.ts", detail: "1 direct, 3 transitive dependents" },
    ]);
  });

  it("respects graph.maxDepth", async () => {
    const config = parseConfig({ graph: { maxDepth: 1 } });
    const s = byId(await blastSignals(ctxFor([changed("hub.ts")], graph, config)), "blast.dependents");
    expect(s.value).toBeCloseTo(Math.log1p(1));
  });

  it("caps evidence at the top 5 changed files by dependent count", async () => {
    const files = ["hub.ts", "a.ts", "b.ts", "c.ts", "d.ts", "leaf.ts", "util.py"].map((p) => changed(p));
    const s = byId(await blastSignals(ctxFor(files, graph)), "blast.dependents");
    expect(s.evidence.map((e) => e.file)).toEqual(["a.ts", "hub.ts", "b.ts", "c.ts", "util.py"]);
  });

  it("looks up renamed files by their base path and skips ignored files", async () => {
    const renamed = changed("core/hub.ts", { status: "renamed", oldPath: "hub.ts" });
    const ignored = changed("a.ts", { ignored: true });
    const s = byId(await blastSignals(ctxFor([renamed, ignored], graph)), "blast.dependents");
    expect(s.value).toBeCloseTo(Math.log1p(3)); // a,b,c: a is not a changed file once ignored
    expect(s.evidence[0]?.file).toBe("core/hub.ts");
  });

  it("is 0 and derived for a docs-only change", async () => {
    const signals = await blastSignals(ctxFor([changed("README.md")], graph));
    expect(byId(signals, "blast.dependents")).toMatchObject({ value: 0, status: "derived" });
    expect(byId(signals, "blast.public_surface")).toMatchObject({ value: 0, status: "derived" });
  });

  it("reports unknown when there is no graph", async () => {
    const signals = await blastSignals(ctxFor([changed("hub.ts")], undefined));
    for (const id of ["blast.dependents", "blast.public_surface"]) {
      const s = byId(signals, id);
      expect(s.status).toBe("unknown");
      expect(s.value).toBe(0);
      expect(s.summary).toMatch(/graph/i);
    }
  });

  it("reports unknown when no changed source file is supported", async () => {
    const signals = await blastSignals(ctxFor([changed("src/engine.c"), changed("README.md")], graph));
    for (const id of ["blast.dependents", "blast.public_surface"]) {
      const s = byId(signals, id);
      expect(s.status).toBe("unknown");
      expect(s.summary).toContain("src/engine.c");
    }
  });

  it("is derived with a note when support is partial", async () => {
    const signals = await blastSignals(ctxFor([changed("hub.ts"), changed("src/engine.c")], graph));
    const s = byId(signals, "blast.dependents");
    expect(s.status).toBe("derived");
    expect(s.value).toBeCloseTo(Math.log1p(3));
    expect(s.summary).toContain("unsupported: src/engine.c");
  });

  it("notes partial graph coverage", async () => {
    const partial = await buildDependencyGraph(repo.dir, "HEAD", parseConfig({ graph: { maxFiles: 5 } }));
    const s = byId(await blastSignals(ctxFor([changed("a.ts")], partial)), "blast.dependents");
    expect(s.summary).toContain("graph covers 5 of 9 files");
  });

  describe("blast.public_surface", () => {
    it("is 1 when a hunk in a file with dependents touches an exported declaration", async () => {
      const file = changed("hub.ts", { hunks: [hunk(1, ["-export const hub = 1;", "+export const hub = 2;", " const internal = 2;"])] });
      const s = byId(await blastSignals(ctxFor([file], graph)), "blast.public_surface");
      expect(s.value).toBe(1);
      expect(s.status).toBe("derived");
      expect(s.evidence).toEqual([
        { file: "hub.ts", line: 1, detail: "export const hub = 1;" },
        { file: "hub.ts", line: 1, detail: "export const hub = 2;" },
      ]);
    });

    it("is 0 when only non-exported lines change", async () => {
      const file = changed("hub.ts", { hunks: [hunk(1, [" export const hub = 1;", "-const internal = 2;", "+const internal = 3;"])] });
      expect(byId(await blastSignals(ctxFor([file], graph)), "blast.public_surface").value).toBe(0);
    });

    it("is 0 when the exported change is in a file without dependents", async () => {
      const file = changed("leaf.ts", { hunks: [hunk(1, ["+export const leaf = 2;"])] });
      expect(byId(await blastSignals(ctxFor([file], graph)), "blast.public_surface").value).toBe(0);
    });

    it("uses the language's notion of public (Python top-level def)", async () => {
      const pub = changed("util.py", { hunks: [hunk(1, ["+def other():", "+    pass"])] });
      expect(byId(await blastSignals(ctxFor([pub], graph)), "blast.public_surface").value).toBe(1);
      const priv = changed("util.py", { hunks: [hunk(1, ["+def _hidden():", "+    pass"])] });
      expect(byId(await blastSignals(ctxFor([priv], graph)), "blast.public_surface").value).toBe(0);
    });

    it("reports line numbers on the side of the change", async () => {
      const file = changed("hub.ts", {
        hunks: [{ oldStart: 10, oldLines: 2, newStart: 12, newLines: 2, lines: [" a();", "-b();", "+export function c() {}"] }],
      });
      const s = byId(await blastSignals(ctxFor([file], graph)), "blast.public_surface");
      expect(s.evidence).toEqual([{ file: "hub.ts", line: 13, detail: "export function c() {}" }]);
    });

    it("counts an empty row as a context line, as the diff parser does", async () => {
      const file = changed("hub.ts", {
        hunks: [{ oldStart: 10, oldLines: 3, newStart: 12, newLines: 3, lines: [" a();", "", "-export const hub = 1;", "+export const hub = 2;"] }],
      });
      const s = byId(await blastSignals(ctxFor([file], graph)), "blast.public_surface");
      expect(s.evidence).toEqual([
        { file: "hub.ts", line: 12, detail: "export const hub = 1;" },
        { file: "hub.ts", line: 14, detail: "export const hub = 2;" },
      ]);
    });
  });
});
