import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/domain/config.js";
import { scoreDiff, type ScoreOptions } from "../src/engine.js";
import { createBlobReader } from "../src/git/blobs.js";
import { loadDiff } from "../src/git/diff.js";
import { makeRepo, type TestRepo } from "./helpers/repo.js";

describe("scoreDiff with a supplied diff", () => {
  let repo: TestRepo;
  let options: ScoreOptions;
  beforeEach(() => {
    repo = makeRepo();
    repo.commit({ "src/a.ts": "export const a = 1;\n", "src/b.ts": "export function b(x: number) {\n  return x;\n}\n", "README.md": "# project\n" }, "base");
    repo.git("checkout", "-q", "-b", "feature");
    repo.commit({ "src/a.ts": "export const a = 2;\nif (a > 1 && a < 3) console.log(a);\n" }, "feat: change a\n\nCo-Authored-By: Claude <noreply@anthropic.com>");
    repo.commit({ "src/b.ts": "export function b(x: number) {\n  return x > 0 ? x : -x;\n}\n", "docs/notes.md": "# notes\n" }, "feat: change b");
    // `now` and `asOf` are fixed so two runs cannot differ by the clock.
    options = { repoDir: repo.dir, base: "main", head: "feature", config: defaultConfig(), llm: null, now: 1_800_000_000_000, asOf: 1_800_000_000, brief: { llm: false } };
  });
  afterEach(() => repo.cleanup());

  it("is byte-identical without the new options: absent, or explicitly undefined", async () => {
    const withoutOptions = JSON.stringify(await scoreDiff(options));
    const withUndefinedOptions = JSON.stringify(await scoreDiff({ ...options, diff: undefined, readHead: undefined, prCommits: undefined }));
    expect(withUndefinedOptions).toBe(withoutOptions);
    expect(JSON.stringify(await scoreDiff(options))).toBe(withoutOptions);
  });

  it("gives a byte-identical result when handed exactly what it would have loaded from git itself", async () => {
    const fromGit = await scoreDiff(options);
    const diff = await loadDiff(repo.dir, "main", "feature", options.config);
    const readBlob = createBlobReader(repo.dir);
    const prCommits = repo
      .git("log", "--no-merges", "--format=%H", "main..feature")
      .split("\n")
      .map((sha) => ({
        sha,
        authorName: repo.git("log", "-1", "--format=%an", sha),
        authorEmail: repo.git("log", "-1", "--format=%ae", sha),
        message: `${repo.git("log", "-1", "--format=%B", sha)}\n`,
      }));
    const supplied = await scoreDiff({ ...options, diff, readHead: (path) => readBlob(diff.head, path), prCommits });
    expect(JSON.stringify(supplied)).toBe(JSON.stringify(fromGit));
    expect(fromGit.source.kind).toBe("agent");
  });

  it("uses the supplied diff, head reader and commits instead of git", async () => {
    const diff = await loadDiff(repo.dir, "main", "feature", options.config);
    const readPaths: string[] = [];
    // A head commit that is not in the repository: any git read of it would fail the run.
    const result = await scoreDiff({
      ...options,
      head: "0".repeat(40),
      brief: undefined,
      diff: { ...diff, head: "0".repeat(40) },
      readHead: async (path) => {
        readPaths.push(path);
        return undefined;
      },
      prCommits: [],
    });
    expect(result.diff.head).toBe("0".repeat(40));
    expect(readPaths.sort()).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.unknowns).toContain("complexity.touched");
    expect(result.source.kind).toBe("human");
  });
});
