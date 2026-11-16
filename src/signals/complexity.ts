import type { SignalProvider } from "../domain/types.js";
import { isCodeFamily, languageFamily } from "./language.js";
import { countedFiles, historyPath, plural, topEvidence, unknown } from "./util.js";

// Language-agnostic decision points (McCabe-style): branch and loop keywords plus short-circuit operators.
const BRANCH = /\b(if|elif|elsif|for|foreach|while|until|unless|case|when|catch|except|rescue|guard)\b|&&|\|\|/g;

/** Spec §4 "complexity.touched": branch keywords across the changed code files (head, or base if deleted). */
export const complexitySignals: SignalProvider = async (ctx) => {
  const id = "complexity.touched";
  const files = countedFiles(ctx).filter((f) => !f.binary && isCodeFamily(languageFamily(f.path)));
  const unreadableFiles = files.filter((file) => file.hasUnreadablePatch);
  if (unreadableFiles.length > 0) return [unknown(id, `the changed lines of ${plural(unreadableFiles.length, "code file")} could not be read`)];
  if (files.length === 0) return [{ id, value: 0, status: "derived", summary: "no code files changed", evidence: [] }];

  const texts = await Promise.all(files.map((f) => (f.status === "deleted" ? ctx.readBase(historyPath(f)) : ctx.readHead(f.path))));
  const counts = files.flatMap((f, i) => {
    const text = texts[i];
    return text === undefined ? [] : [{ file: f.path, n: text.match(BRANCH)?.length ?? 0 }];
  });
  if (counts.length === 0) return [unknown(id, `could not read ${plural(files.length, "changed code file")}`)];

  const total = counts.reduce((sum, c) => sum + c.n, 0);
  return [
    {
      id,
      value: Math.log1p(total),
      status: "derived",
      summary: `${plural(total, "branch keyword")} in ${plural(counts.length, "changed code file")}`,
      evidence: topEvidence(counts.sort((a, b) => b.n - a.n).map((c) => ({ file: c.file, detail: plural(c.n, "branch keyword") }))),
    },
  ];
};
