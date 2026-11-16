import type { Signal, SignalProvider } from "../domain/types.js";
import { countedFiles, plural, topEvidence } from "./util.js";

/** Every language family a changed file can belong to; each one present emits a `lang.<family>` signal. */
export const LANGUAGE_FAMILIES = [
  "ts", "js", "py", "go", "java", "kotlin", "rust", "ruby", "c_cpp", "csharp", "php", "swift", "sql", "shell",
  "config", "docs", "other",
] as const;

export type LanguageFamily = (typeof LANGUAGE_FAMILIES)[number];

const EXTENSIONS: Record<string, LanguageFamily> = {
  ts: "ts", tsx: "ts", mts: "ts", cts: "ts",
  js: "js", jsx: "js", mjs: "js", cjs: "js",
  py: "py", pyi: "py",
  go: "go",
  java: "java",
  kt: "kotlin", kts: "kotlin",
  rs: "rust",
  rb: "ruby",
  c: "c_cpp", h: "c_cpp", cc: "c_cpp", cpp: "c_cpp", cxx: "c_cpp", hh: "c_cpp", hpp: "c_cpp", hxx: "c_cpp",
  cs: "csharp",
  php: "php",
  swift: "swift",
  sql: "sql",
  sh: "shell", bash: "shell", zsh: "shell",
  yaml: "config", yml: "config", json: "config", toml: "config", ini: "config",
  md: "docs", rst: "docs", txt: "docs", patch: "docs", diff: "docs",
};

export function languageFamily(path: string): LanguageFamily {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return (dot > 0 && EXTENSIONS[name.slice(dot + 1).toLowerCase()]) || "other";
}

/** A `.patch`/`.diff` file: an archived record, not a hunk worth ranking even though its family is "docs". */
export const isPatchFile = (path: string): boolean => /\.(patch|diff)$/i.test(path);

/** Program code: a known language that is not config, docs or unclassified. */
export const isCodeFamily = (family: LanguageFamily): boolean => family !== "config" && family !== "docs" && family !== "other";

/** Spec §4 "lang.*" signals: one indicator per family present among non-ignored changed files. */
export const languageSignals: SignalProvider = async (ctx) => {
  const byFamily = new Map<LanguageFamily, string[]>();
  for (const f of countedFiles(ctx)) {
    const family = languageFamily(f.path);
    byFamily.set(family, [...(byFamily.get(family) ?? []), f.path]);
  }
  return [...byFamily].map(
    ([family, paths]): Signal => ({
      id: `lang.${family}`,
      value: 1,
      status: "derived",
      summary: `${plural(paths.length, `${family} file`)} changed`,
      evidence: topEvidence(paths.map((file) => ({ file, detail: `${family} file` }))),
    }),
  );
};
