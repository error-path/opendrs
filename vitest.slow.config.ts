import os from "node:os";
import { defineConfig } from "vitest/config";

// The heavier real-git-repo and CPU-bound integration tests (git-spawn fixture cost + model
// fits), split out of the default `npm test` so local iteration isn't gated on all of them.
// `npm run check` and CI run both configs, so total coverage is unchanged — see docs/maintaining.md
// "Dev loop metrics" and docs/research/2026-10-22-dev-loop-time-sinks.md for how this list was chosen
// (every file that took >= 20s in a full `vitest run --reporter=json` measurement).
export const SLOW_TEST_FILES = [
  "tests/action/run.test.ts",
  "tests/signals/size.test.ts",
  "tests/architecture/contracts.test.ts",
  "tests/model/calibrate.test.ts",
  "tests/brief/build.test.ts",
  "tests/signals/tests.test.ts",
  "tests/architecture/risk.test.ts",
  "tests/model/replay.test.ts",
  "tests/engine.test.ts",
  "tests/cli/history-commands.test.ts",
  "tests/architecture/drift.test.ts",
  "tests/model/label.test.ts",
  "tests/hotspots.test.ts",
  "tests/cli/score.test.ts",
  "tests/model/backtest.test.ts",
  "tests/git/history.test.ts",
  "tests/git/diff.test.ts",
  "tests/brief/blame.test.ts",
  "tests/architecture/layers.test.ts",
  "tests/signals/history.test.ts",
  "tests/graph/graph.test.ts",
  "tests/architecture/coupling.test.ts",
  "tests/brief/rank.test.ts",
  "tests/action/sweep.test.ts",
  "tests/cli/brief-command.test.ts",
  "tests/signals/expertise.test.ts",
  "tests/signals/diffusion.test.ts",
  "tests/cli/feedback.test.ts",
  "tests/brief/skim.test.ts",
  "tests/brief/selfcheck-gate.test.ts",
  "tests/cli/init-mcp.test.ts",
  "tests/explain.test.ts",
  "tests/action/fork-score.test.ts",
];

// Default vitest runs up to `cpus - 1` workers at once. Each forked file here spawns its own real
// `git` child processes (and `tests/model/calibrate.test.ts` is CPU-bound), so at full default
// concurrency this project oversubscribes the machine's cores and intermittently blows the 30s
// test/hook timeout under contention (tests/hotspots.test.ts, tests/brief/selfcheck-gate.test.ts,
// tests/model/calibrate.test.ts — see docs/research/2026-10-22-dev-loop-time-sinks.md, "Flaky
// timeouts fixed"). Capping workers to half the logical cores keeps each surviving worker's git
// spawns and CPU-bound work from starving for scheduler time. (`maxWorkers` is the top-level
// Vitest 4+ option; `poolOptions.forks.maxForks` was removed.)
const maxWorkers = Math.max(1, Math.floor(os.cpus().length / 2));

export default defineConfig({
  test: {
    include: SLOW_TEST_FILES,
    testTimeout: 30_000,
    maxWorkers,
  },
});
