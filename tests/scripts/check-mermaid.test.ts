import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAll, findReservedNodeIds } from "../../scripts/check-mermaid.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("findReservedNodeIds", () => {
  it("flags the exact failure this check exists for: `graph` used as a flowchart node id", () => {
    const md = ["```mermaid", "flowchart LR", '  graph["import graph"] --> signals', "```"].join("\n");
    expect(findReservedNodeIds(md)).toEqual([{ line: 3, id: "graph" }]);
  });

  it("does not flag a reserved word used only as text inside another node's label", () => {
    const md = ["```mermaid", "flowchart LR", '  imports["import graph"] --> signals', "```"].join("\n");
    expect(findReservedNodeIds(md)).toEqual([]);
  });

  it("ignores a mermaid-looking block outside a ```mermaid fence", () => {
    const md = ['  graph["x"] --> signals'].join("\n");
    expect(findReservedNodeIds(md)).toEqual([]);
  });

  it("flags `end` used as a node id but not the word inside a label", () => {
    const md = ["```mermaid", "flowchart LR", "  a --> end[stop]", "```"].join("\n");
    expect(findReservedNodeIds(md)).toEqual([{ line: 3, id: "end" }]);
  });
});

describe("checkAll", () => {
  it("passes on the repo's README, CHANGELOG, docs and skills", () => {
    expect(checkAll(REPO_ROOT)).toEqual([]);
  });

  it("reports a reserved node id introduced in a fresh mermaid block", () => {
    const dir = mkdtempSync(join(tmpdir(), "check-mermaid-"));
    try {
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(
        join(dir, "docs/a.md"),
        ["```mermaid", "flowchart LR", "  subgraph[nope] --> b", "```"].join("\n"),
      );
      const problems = checkAll(dir);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("subgraph");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
