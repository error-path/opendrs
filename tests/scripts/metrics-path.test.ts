import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMetricsFile } from "../../scripts/metrics-path.mjs";
import { makeRepo } from "../helpers/repo.js";

describe("resolveMetricsFile", () => {
  it("OPENDRS_METRICS_FILE env override wins and is resolved to an absolute path", () => {
    const cwd = mkdtempSync(join(tmpdir(), "opendrs-metrics-"));
    try {
      const result = resolveMetricsFile(cwd, { OPENDRS_METRICS_FILE: "custom/runs.jsonl" });
      expect(result).toBe(join(cwd, "custom/runs.jsonl"));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("falls back to .dev-metrics/runs.jsonl when git is unavailable", () => {
    const cwd = mkdtempSync(join(tmpdir(), "opendrs-metrics-"));
    // The temp dir can sit inside a git repo (on Windows it is under the home directory, which some
    // people keep in git), so stop git from looking above it.
    vi.stubEnv("GIT_CEILING_DIRECTORIES", tmpdir());
    try {
      const result = resolveMetricsFile(cwd, {});
      expect(result).toBe(join(cwd, ".dev-metrics/runs.jsonl"));
    } finally {
      vi.unstubAllEnvs();
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("resolves to <git-common-dir>/opendrs-dev-metrics/runs.jsonl in a plain repo", () => {
    const repo = makeRepo();
    try {
      const result = resolveMetricsFile(repo.dir, {});
      expect(result).toBe(join(repo.dir, ".git/opendrs-dev-metrics/runs.jsonl"));
    } finally {
      repo.cleanup();
    }
  });

  it("resolves to the main repo's common dir from a linked worktree, not the worktree's own .git", () => {
    // makeRepo() writes a user.name/email into .git/config so `commit` works without a global
    // gitconfig (CI has none) — see tests/helpers/repo.ts. Resolve the main repo's real path up
    // front: macOS aliases /tmp through a symlink, and git itself returns a canonicalized
    // absolute path for a worktree's common dir, so comparing against a non-canonical path here
    // would be an artifact of this test's environment, not a real mismatch.
    const repo = makeRepo();
    const mainDir = realpathSync(repo.dir);
    const worktreesParent = mkdtempSync(join(tmpdir(), "opendrs-metrics-wt-"));
    try {
      repo.commit({}, "init");
      const worktreeDir = join(worktreesParent, "wt1");
      repo.git("worktree", "add", "-q", "-b", "wt-branch", worktreeDir);

      const fromMain = resolveMetricsFile(mainDir, {});
      const fromWorktree = resolveMetricsFile(worktreeDir, {});

      expect(fromWorktree).toBe(fromMain);
      expect(fromWorktree).toBe(join(mainDir, ".git/opendrs-dev-metrics/runs.jsonl"));
    } finally {
      rmSync(worktreesParent, { recursive: true, force: true });
      repo.cleanup();
    }
  });
});
