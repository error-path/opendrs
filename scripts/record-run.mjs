#!/usr/bin/env node
// Dependency-free wrapper: runs a command, times it, and appends one JSON line to the shared
// dev-metrics file (gitignored, append-only). See docs/maintaining.md "Dev loop metrics".
//
// Usage: node scripts/record-run.mjs <kind> -- <command> [args...]
import { spawnSync, execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import os from "node:os";
import { resolveMetricsFile } from "./metrics-path.mjs";

function safe(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
const dashIdx = args.indexOf("--");
if (dashIdx <= 0 || dashIdx === args.length - 1) {
  console.error("usage: record-run.mjs <kind> -- <command> [args...]");
  process.exit(2);
}

const kind = args[0];
const cmdParts = args.slice(dashIdx + 1);
const [cmd, ...cmdArgs] = cmdParts;

const gitSha = safe(() => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim());
const gitBranch = safe(() => execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim());

const startedAt = Date.now();
// Windows starts npm/vitest/esbuild (.cmd shims) only through a shell, so quote every part for cmd.exe.
// shortcut: a part holding `"` or `%` can't be quoted safely there, so it is refused; escape it if one is ever needed.
if (process.platform === "win32" && cmdParts.some((part) => /["%]/.test(part))) {
  console.error('record-run: on Windows, a command part may not contain " or %');
  process.exit(2);
}
const result =
  process.platform === "win32"
    ? spawnSync(cmdParts.map((part) => `"${part}"`).join(" "), { stdio: "inherit", shell: true })
    : spawnSync(cmd, cmdArgs, { stdio: "inherit" });
const durationMs = Date.now() - startedAt;
if (result.error) console.error(`record-run: could not start ${cmd}: ${result.error.message}`);
// No status means the command never started or was killed by a signal: both are failures.
const exitCode = result.status ?? 1;

const entry = {
  ts: new Date(startedAt).toISOString(),
  kind,
  command: cmdParts.join(" "),
  gitSha,
  gitBranch,
  worktree: process.cwd(),
  durationMs,
  exitCode,
  counts: null,
  costUsd: null,
  loadAvg1m: safe(() => os.loadavg()[0]),
  source: "live",
};

safe(() => {
  const path = resolveMetricsFile();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + "\n");
});

process.exit(exitCode);
