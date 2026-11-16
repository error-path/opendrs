import type { ChangedFile, Evidence, Hunk, ScoringContext, Signal, SignalProvider } from "../domain/types.js";
import type { OpendrsConfig } from "../domain/config.js";
import { changedLines } from "../git/diff.js";
import { matchAny } from "../git/glob.js";
import { languageFamily, type LanguageFamily } from "./language.js";
import { isTestPath } from "./tests.js";
import { countedFiles, historyPath, plural, topEvidence, unknown } from "./util.js";

/** Spec §4 "size.*" signals. */
export const sizeSignals: SignalProvider = async (ctx) => {
  const files = countedFiles(ctx);
  const added = files.filter((f) => f.status === "added").length;
  const lines = files.reduce((n, f) => n + f.added + f.deleted, 0);
  const ignored = ctx.diff.files.length - files.length;

  const churn: Signal = {
    id: "size.churn",
    value: Math.log1p(lines),
    status: "observed",
    summary: `${plural(lines, "line")} changed across ${plural(files.length, "file")} (${added} new)` + (ignored ? `; ${ignored} ignored` : ""),
    evidence: topEvidence(
      [...files].sort((a, b) => b.added + b.deleted - (a.added + a.deleted)).map((f) => ({ file: f.path, detail: `+${f.added} -${f.deleted}` })),
    ),
  };

  const newOnly = files.length > 0 && added === files.length;
  const newFilesOnly: Signal = {
    id: "size.new_files_only",
    value: newOnly ? 1 : 0,
    status: "observed",
    summary: newOnly ? `all ${plural(files.length, "changed file")} are new` : `${added} of ${plural(files.length, "changed file")} are new`,
    evidence: [],
  };

  // Meta: "a comment only change to a file on a risky path has no risk". A rename is never
  // comment-only (it can break importers), nor is a diff with no changed text lines, nor one with
  // lines that could not be read.
  const changed = files.flatMap((f) => f.hunks.flatMap((h) => h.lines.filter((l) => l[0] === "+" || l[0] === "-").map((l) => ({ f, text: l.slice(1) }))));
  const commentOnly =
    changed.length > 0 &&
    files.every((file) => !file.binary && !file.hasUnreadablePatch && file.status !== "renamed") &&
    changed.every(({ f, text }) => inert(text, languageFamily(f.path)));
  const commentOnlySignal: Signal = {
    id: "size.comment_only",
    value: commentOnly ? 1 : 0,
    status: "observed",
    summary: commentOnly ? "only comments or blank lines changed" : "code lines changed",
    evidence: [],
  };

  return [churn, await relativeSize(ctx, files), newFilesOnly, commentOnlySignal];
};

const C_LIKE = new Set<LanguageFamily>(["ts", "js", "go", "java", "kotlin", "rust", "c_cpp", "csharp", "php", "swift"]);
const HASH = new Set<LanguageFamily>(["py", "ruby", "shell", "config", "php"]);
// Comments that change how code builds, type-checks or lints (cgo preambles start with #).
const DIRECTIVE =
  /^(!|#|-\*-|go:|\+build|@ts-|@flow|@jsx|@formatter|eslint|tslint|jshint|prettier-ignore|biome-ignore|deno-|istanbul|c8 |webpack|@vite-|nolint|noinspection|noqa|type:|pyright:|mypy:|pylint:|fmt:|isort:|pragma|rubocop:|frozen_string_literal|swiftlint:|clang-format|sourceMappingURL)/i;

/**
 * True for a blank line, or a plain comment in the file's own comment syntax. Stricter than SZZ's
 * comment test, because here a wrong "comment" discounts risk: a lone block delimiter can switch
 * code on or off, directives change the build, and `#` is code in CSS or C#. Unknown languages
 * (`other`, docs) have no trusted comment syntax.
 */
export function inert(line: string, family: LanguageFamily): boolean {
  const t = line.trim();
  if (t === "") return true;
  let body: string | undefined;
  if (C_LIKE.has(family) || family === "sql") {
    body = /^\/\*(.*)\*\/$/.exec(t)?.[1] ?? (/^\*(\s|$)/.test(t) ? t.slice(1) : undefined);
  }
  if (body === undefined && C_LIKE.has(family) && t.startsWith("//")) body = t.slice(2);
  if (body === undefined && HASH.has(family) && t.startsWith("#")) body = t.slice(1);
  if (body === undefined && family === "sql" && t.startsWith("--")) body = t.slice(2);
  return body !== undefined && !body.includes("/*") && !body.includes("*/") && !DIRECTIVE.test(body.trim());
}

/**
 * Spec 2026-10-20 §2/§3: the size cap's own line count, excluding inert lines in this order
 * (first match wins) — instructions file (full) > test file (full) > autoApprove.sizeCapExempt
 * (zero) > docs-family file (zero) > comment-only hunk (per-hunk zero) > everything else (full).
 * `countInertLines: true` restores the pre-2026-10-20 raw count exactly.
 */
export function countedChangedLines(files: ChangedFile[], config: OpendrsConfig): number {
  if (config.autoApprove.countInertLines) {
    return files.reduce((n, f) => n + (f.binary ? 1 : f.added + f.deleted), 0);
  }
  return files.reduce((n, f) => n + fileCountedLines(f, config), 0);
}

function fileCountedLines(f: ChangedFile, config: OpendrsConfig): number {
  const full = f.added + f.deleted;
  if (f.binary) return 1;
  if (matchAny(config.paths.instructions, f.path, { ignoreCase: true })) return full;
  if (isTestPath(config, f.path)) return full;
  if (matchAny(config.autoApprove.sizeCapExempt, f.path)) return 0;
  const family = languageFamily(f.path);
  if (family === "docs") return 0;
  if (f.status === "renamed" || f.hunks.length === 0) return full; // never comment-only, same as size.comment_only
  return f.hunks.reduce((n, h) => n + hunkCountedLines(h, family), 0);
}

/** 0 when every changed (+/-) line in the hunk is inert; otherwise its full changed-line count. */
function hunkCountedLines(h: Hunk, family: LanguageFamily): number {
  let count = 0;
  let allInert = true;
  for (const { kind, text } of changedLines(h)) {
    if (kind !== "+" && kind !== "-") continue;
    count++;
    if (!inert(text, family)) allInert = false;
  }
  return allInert ? 0 : count;
}

async function relativeSize(ctx: ScoringContext, files: ChangedFile[]): Promise<Signal> {
  const id = "size.relative";
  const modified = files.filter((f) => !f.binary && (f.status === "modified" || f.status === "renamed"));
  if (modified.length === 0) {
    return { id, value: 0, status: "derived", summary: "no pre-existing text files modified", evidence: [] };
  }
  const bases = await Promise.all(modified.map((f) => ctx.readBase(historyPath(f))));
  let changed = 0;
  let baseLines = 0;
  const evidence: Evidence[] = [];
  for (const [i, f] of modified.entries()) {
    const text = bases[i];
    if (text === undefined) continue;
    const length = lineCount(text);
    changed += f.added + f.deleted;
    baseLines += length;
    evidence.push({ file: f.path, detail: `${f.added + f.deleted} of ${length} lines changed` });
  }
  if (evidence.length === 0) return unknown(id, `could not read base contents of ${plural(modified.length, "modified file")}`);
  if (baseLines === 0) return unknown(id, "modified files were empty at base");
  const ratio = changed / baseLines;
  return {
    id,
    value: Math.log1p(ratio),
    status: "derived",
    summary: `${changed} changed lines vs ${baseLines} base lines in ${plural(evidence.length, "modified file")} (${(ratio * 100).toFixed(1)}%)`,
    evidence: topEvidence(evidence),
  };
}

function lineCount(text: string): number {
  if (text === "") return 0;
  let n = 0;
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) n++;
  return text.endsWith("\n") ? n : n + 1;
}
