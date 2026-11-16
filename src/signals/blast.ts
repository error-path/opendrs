import type { ChangedFile, DependencyGraph, Evidence, Signal, SignalProvider } from "../domain/types.js";
import { changedLines } from "../git/diff.js";
import { languageOf } from "../graph/imports.js";
import { isPublicDeclaration } from "../graph/public-decl.js";

/** Code languages without an import extractor: their blast radius is unknown, not zero. */
const OTHER_CODE = new Set("c h cc cpp cxx hpp hh cs fs swift m mm php scala sc dart ex exs erl hs lua pl pm jl clj groovy".split(" "));
const MAX_EVIDENCE = 10;

/** The graph is built at base, so a renamed or deleted file is found under its old path. */
const basePath = (f: ChangedFile) => f.oldPath ?? f.path;

/** Code whose dependents the graph cannot tell us (unsupported language, or past graph.maxFiles). */
function isUnsupportedCode(graph: DependencyGraph, path: string): boolean {
  if (graph.supports(path)) return false;
  const name = path.slice(path.lastIndexOf("/") + 1);
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return languageOf(path) !== undefined || OTHER_CODE.has(ext);
}

function listPaths(paths: string[]): string {
  return paths.length <= 5 ? paths.join(", ") : `${paths.slice(0, 5).join(", ")} (+${paths.length - 5} more)`;
}

/** RepoGraph exposes coverage; the DependencyGraph contract does not, so read it defensively. */
function partialCoverage(graph: DependencyGraph): { files: number; total: number } | undefined {
  const c = (graph as { coverage?: { files: number; total: number } }).coverage;
  return c && c.files < c.total ? c : undefined;
}

function unknown(reason: string): Signal[] {
  return ["blast.dependents", "blast.public_surface"].map((id) => ({
    id,
    value: 0,
    status: "unknown" as const,
    summary: `Blast radius unknown: ${reason}`,
    evidence: [],
  }));
}

/** Changed lines (+/-) that declare an exported or public symbol, with their line numbers. */
function publicDeclarations(f: ChangedFile): Evidence[] {
  const out: Evidence[] = [];
  for (const h of f.hunks) {
    for (const { kind, line, text } of changedLines(h)) {
      if (isPublicDeclaration(kind === "+" ? f.path : basePath(f), text)) out.push({ file: f.path, line, detail: text.trim().slice(0, 120) });
    }
  }
  return out;
}

/** Spec §4 "blast.*" signals. */
export const blastSignals: SignalProvider = async (ctx) => {
  const { graph } = ctx;
  if (!graph) return unknown("no dependency graph (disabled or failed to build)");

  const files = ctx.diff.files.filter((f) => !f.ignored);
  const unsupported = files.filter((f) => isUnsupportedCode(graph, basePath(f))).map((f) => f.path);
  if (unsupported.length > 0 && !files.some((f) => graph.supports(basePath(f)))) {
    return unknown(`no import graph support for ${listPaths(unsupported)}`);
  }

  const maxDepth = ctx.config.graph.maxDepth;
  const changed = new Set(files.flatMap((f) => (f.oldPath ? [f.path, f.oldPath] : [f.path])));
  const dependents = new Set<string>();
  const perFile = files.map((f) => {
    const transitive = graph.transitiveDependents(basePath(f), maxDepth);
    for (const d of transitive) if (!changed.has(d)) dependents.add(d);
    return { path: f.path, direct: graph.dependentsOf(basePath(f)).length, transitive: transitive.size };
  });
  const top = perFile
    .filter((x) => x.transitive > 0)
    .sort((a, b) => b.transitive - a.transitive || b.direct - a.direct || (a.path < b.path ? -1 : 1))
    .slice(0, 5);

  const notes: string[] = [];
  if (unsupported.length > 0) notes.push(`unsupported: ${listPaths(unsupported)}`);
  const coverage = partialCoverage(graph);
  if (coverage) notes.push(`graph covers ${coverage.files} of ${coverage.total} files`);
  const suffix = notes.length ? ` (${notes.join("; ")})` : "";

  const filesWithDependents = files.filter((file) => graph.dependentsOf(basePath(file)).length > 0);
  const surface = filesWithDependents.flatMap(publicDeclarations);
  const surfaceFiles = new Set(surface.map((e) => e.file)).size;
  // A file with dependents whose changed lines could not be read may change any declaration.
  const unreadablePaths = filesWithDependents.filter((file) => file.hasUnreadablePatch).map((file) => file.path);
  const publicSurface: Signal =
    surface.length === 0 && unreadablePaths.length > 0
      ? {
          id: "blast.public_surface",
          value: 0,
          status: "unknown",
          summary: `Blast radius unknown: the changed lines of ${listPaths(unreadablePaths)}, which have dependents, could not be read${suffix}`,
          evidence: [],
        }
      : {
          id: "blast.public_surface",
          value: surface.length > 0 ? 1 : 0,
          status: "derived",
          summary:
            (surface.length > 0
              ? `Exported/public declarations changed in ${surfaceFiles} file(s) that have dependents`
              : "No exported/public declaration changed in a file with dependents") + suffix,
          evidence: surface.slice(0, MAX_EVIDENCE),
        };

  return [
    {
      id: "blast.dependents",
      value: Math.log1p(dependents.size),
      status: "derived",
      summary: `${dependents.size} file(s) transitively depend on the changed files (depth ≤ ${maxDepth})${suffix}`,
      evidence: top.map((x) => ({ file: x.path, detail: `${x.direct} direct, ${x.transitive} transitive dependents` })),
    },
    publicSurface,
  ];
};
