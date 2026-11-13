import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OpendrsError } from "../../src/domain/types.js";
import { makeRepo, type TestRepo } from "../helpers/repo.js";
import { fakeResult, testIo } from "./helpers.js";

vi.mock("../../src/engine.js", () => ({ scoreDiff: vi.fn(), loadModel: vi.fn() }));
vi.mock("../../src/report/markdown.js", () => ({
  renderMarkdown: vi.fn(() => "<!-- opendrs -->\nMARKDOWN"),
  renderText: vi.fn(() => "TEXT REPORT"),
}));

const { scoreDiff } = await import("../../src/engine.js");
const { runCli } = await import("../../src/cli/cli.js");

let repo: TestRepo;
beforeEach(() => {
  repo = makeRepo();
  repo.commit({ "a.ts": "1\n" }, "init");
  vi.mocked(scoreDiff).mockResolvedValue(fakeResult(0.42, "yellow", "human-review"));
});
afterEach(() => {
  repo.cleanup();
  vi.clearAllMocks();
});

const lastCall = () => vi.mocked(scoreDiff).mock.calls.at(-1)![0];

describe("opendrs score", () => {
  it("defaults base to main and head to HEAD, prints text, exits 0", async () => {
    const t = testIo(repo.dir);
    expect(await runCli(["score"], t.io)).toBe(0);
    expect(lastCall()).toMatchObject({ base: "main", head: "HEAD", llm: undefined });
    expect(t.stdout()).toBe("TEXT REPORT");
  });

  it("warns on stderr, in one line, when the repository is a shallow clone", async () => {
    const t = testIo(repo.dir);
    await runCli(["score", "--json"], t.io);
    expect(t.stderr()).toBe("");

    writeFileSync(join(repo.dir, ".git", "shallow"), `${repo.git("rev-parse", "HEAD")}\n`);
    const shallow = testIo(repo.dir);
    expect(await runCli(["score", "--json"], shallow.io)).toBe(0);
    expect(shallow.stderr()).toMatch(/^opendrs: warning: .*shallow clone.*git fetch --unshallow.*fetch-depth: 0[^\n]*$/);
    expect(JSON.parse(shallow.stdout()).score).toBe(0.42);
  });

  it("falls back to master when there is no main", async () => {
    repo.git("branch", "-m", "main", "master");
    const t = testIo(repo.dir);
    await runCli(["score"], t.io);
    expect(lastCall().base).toBe("master");
  });

  it("prefers origin/HEAD's target when it resolves", async () => {
    const sha = repo.git("rev-parse", "HEAD");
    repo.git("update-ref", "refs/remotes/origin/trunk", sha);
    repo.git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
    const t = testIo(repo.dir);
    await runCli(["score"], t.io);
    expect(lastCall().base).toBe("origin/trunk");
  });

  it("exits 2 when no base can be found", async () => {
    repo.git("branch", "-m", "main", "feature");
    const t = testIo(repo.dir);
    expect(await runCli(["score"], t.io)).toBe(2);
    expect(t.stderr()).toContain("--base");
    expect(scoreDiff).not.toHaveBeenCalled();
  });

  it("passes --base, --head, --title and --no-llm through", async () => {
    const t = testIo(repo.dir);
    await runCli(["score", "--base", "v1", "--head", "topic", "--title", "Fix it", "--no-llm"], t.io);
    expect(lastCall()).toMatchObject({ base: "v1", head: "topic", title: "Fix it", llm: null });
  });

  it("loads .opendrs.yml from the repo root, even from a subdirectory", async () => {
    writeFileSync(join(repo.dir, ".opendrs.yml"), "thresholds:\n  green: 0.2\n");
    mkdirSync(join(repo.dir, "sub"));
    const t = testIo(join(repo.dir, "sub"));
    await runCli(["score"], t.io);
    expect(lastCall().config.thresholds.green).toBe(0.2);
  });

  describe("with no changes between base and head", () => {
    const empty = () => {
      const r = fakeResult(0.01, "green", "human-review");
      r.policy.rules = [{ rule: "empty-diff", reason: "no changes" }];
      r.diff = { ...r.diff, files: 0, added: 0, deleted: 0 };
      return r;
    };

    it("says there is nothing to score instead of printing a verdict, and exits 0", async () => {
      vi.mocked(scoreDiff).mockResolvedValue(empty());
      const t = testIo(repo.dir);
      expect(await runCli(["score", "--base", "main"], t.io)).toBe(0);
      expect(t.stdout()).toMatch(/^opendrs: nothing to score: no changes between main and HEAD\./);
      expect(t.stdout()).not.toContain("TEXT REPORT");
    });

    it("does the same with --markdown and ignores --fail-above", async () => {
      vi.mocked(scoreDiff).mockResolvedValue(empty());
      const t = testIo(repo.dir);
      expect(await runCli(["score", "--markdown", "--fail-above", "0"], t.io)).toBe(0);
      expect(t.stdout()).toMatch(/nothing to score/);
    });

    it("still prints the full result with --json, for scripts", async () => {
      vi.mocked(scoreDiff).mockResolvedValue(empty());
      const t = testIo(repo.dir);
      expect(await runCli(["score", "--json"], t.io)).toBe(0);
      expect(JSON.parse(t.stdout()).policy.rules[0].rule).toBe("empty-diff");
    });
  });

  it("prints JSON with --json", async () => {
    const t = testIo(repo.dir);
    await runCli(["score", "--json"], t.io);
    expect(JSON.parse(t.stdout())).toMatchObject({ score: 0.42, tier: "yellow" });
  });

  it("prints markdown with --markdown", async () => {
    const t = testIo(repo.dir);
    await runCli(["score", "--markdown"], t.io);
    expect(t.stdout()).toContain("MARKDOWN");
  });

  it("rejects --json together with --markdown", async () => {
    const t = testIo(repo.dir);
    expect(await runCli(["score", "--json", "--markdown"], t.io)).toBe(2);
  });

  it("exits 1 when the score exceeds --fail-above, 0 when it does not", async () => {
    expect(await runCli(["score", "--fail-above", "0.4"], testIo(repo.dir).io)).toBe(1);
    expect(await runCli(["score", "--fail-above", "0.42"], testIo(repo.dir).io)).toBe(0);
  });

  it.each(["abc", "1.5", "-0.1", ""])("rejects --fail-above %j", async (v) => {
    const t = testIo(repo.dir);
    expect(await runCli(["score", "--fail-above", v], t.io)).toBe(2);
    expect(scoreDiff).not.toHaveBeenCalled();
  });

  it("prints OpendrsError cleanly and exits 2", async () => {
    vi.mocked(scoreDiff).mockRejectedValue(new OpendrsError("git diff failed: bad revision 'nope'", "git"));
    const t = testIo(repo.dir);
    expect(await runCli(["score"], t.io)).toBe(2);
    expect(t.stderr()).toBe("opendrs: git diff failed: bad revision 'nope'");
  });

  it("prints the stack trace only with OPENDRS_DEBUG=1", async () => {
    vi.mocked(scoreDiff).mockRejectedValue(new Error("kaboom"));
    const quiet = testIo(repo.dir);
    expect(await runCli(["score"], quiet.io)).toBe(2);
    expect(quiet.stderr()).toBe("opendrs: kaboom");
    const debug = testIo(repo.dir, { OPENDRS_DEBUG: "1" });
    await runCli(["score"], debug.io);
    expect(debug.stderr()).toContain("    at ");
  });

  it("exits 2 outside a git repository", async () => {
    const t = testIo("/");
    expect(await runCli(["score"], t.io)).toBe(2);
    expect(t.stderr()).toContain("not a git repository");
  });
});
