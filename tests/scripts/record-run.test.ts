import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDirectory: string | undefined;
afterEach(() => {
  if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  tempDirectory = undefined;
});

/**
 * Runs scripts/record-run.mjs with a metrics file in a fresh temp folder.
 *
 * @param command - The command and arguments record-run should time.
 * @returns record-run's exit status and the entries it wrote to the metrics file.
 */
function recordRun(command: string[]): { status: number | null; entries: Array<{ exitCode: number }> } {
  tempDirectory = mkdtempSync(join(tmpdir(), "opendrs-record-run-"));
  const metricsFile = join(tempDirectory, "runs.jsonl");
  const run = spawnSync(process.execPath, ["scripts/record-run.mjs", "probe", "--", ...command], {
    env: { ...process.env, OPENDRS_METRICS_FILE: metricsFile },
    encoding: "utf8",
  });
  const lines = readFileSync(metricsFile, "utf8").trim().split("\n");
  return { status: run.status, entries: lines.map((line) => JSON.parse(line)) };
}

describe("record-run", () => {
  it("exits with the command's own exit code and records it", () => {
    const outcome = recordRun(["node", "-e", "process.exit(3)"]);
    expect(outcome.status).toBe(3);
    expect(outcome.entries).toEqual([expect.objectContaining({ exitCode: 3 })]);
  });

  it("fails, instead of passing, when the command cannot be started", () => {
    const outcome = recordRun(["opendrs-no-such-command"]);
    expect(outcome.status).not.toBe(0);
    expect(outcome.entries[0]!.exitCode).not.toBe(0);
  });

  it("passes an argument with spaces and shell characters through unchanged", () => {
    const outcome = recordRun(["node", "-e", "process.exit(process.argv[1] === 'a b;(c)' ? 0 : 4)", "a b;(c)"]);
    expect(outcome.status).toBe(0);
  });
});
