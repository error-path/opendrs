#!/usr/bin/env node
// Lints ```mermaid fenced blocks in Markdown for flowchart node ids that collide with a Mermaid
// reserved word (e.g. `graph["import graph"] --> x` fails to parse: "got 'GRAPH'"). A real parse
// check would need mermaid's renderer, which pulls in a DOM (jsdom or a headless browser) — too
// heavy for this repo's one or two diagrams, so this checks the specific failure class the
// flowchart/graph grammar is known to hit: a bare node id that is also a keyword.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const TARGETS = ["README.md", "CHANGELOG.md", "docs", "skills"];

// Keywords the flowchart/graph grammar reserves; using one as a bare node id is a parse error.
export const RESERVED_IDS = new Set(["graph", "flowchart", "subgraph", "end", "class", "click", "style", "classDef", "linkStyle", "direction", "default"]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "_site" || entry.name === "vendor") return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function listDocFiles(root) {
  return TARGETS.flatMap((target) => {
    const path = join(root, target);
    const stat = statSync(path, { throwIfNoEntry: false });
    if (!stat) return [];
    const files = stat.isDirectory() ? walk(path) : [path];
    return files.filter((f) => f.endsWith(".md"));
  });
}

// Mermaid blocks only accept a flowchart/graph node id written as `id[...]`, `id(...)`, `id{...}`
// or a bare `id`, at the start of a line or right after `-->`/`---`. This is deliberately narrow:
// it flags a reserved word used that way, not every occurrence of the word in the diagram.
export function findReservedNodeIds(markdown) {
  const hits = [];
  let inMermaid = false;
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```mermaid\s*$/.test(line)) {
      inMermaid = true;
      continue;
    }
    if (inMermaid && /^\s*```\s*$/.test(line)) {
      inMermaid = false;
      continue;
    }
    if (!inMermaid) continue;
    for (const m of line.matchAll(/(?:^|-->|---|-\.-|==>)\s*([A-Za-z_][\w-]*)\s*[[({]/g)) {
      const id = m[1].toLowerCase();
      if (RESERVED_IDS.has(id)) hits.push({ line: i + 1, id: m[1] });
    }
  }
  return hits;
}

export function checkFile(file) {
  return findReservedNodeIds(readFileSync(file, "utf8")).map(
    ({ line, id }) => `${file}:${line}: node id "${id}" is a Mermaid reserved word`,
  );
}

export function checkAll(root) {
  return listDocFiles(root).flatMap(checkFile);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2] ?? resolve(new URL(".", import.meta.url).pathname, "..");
  const problems = checkAll(root);
  for (const problem of problems) console.error(problem);
  console.log(problems.length ? `mermaid lint: ${problems.length} problem(s)` : "mermaid lint passed");
  process.exit(problems.length ? 1 : 0);
}
