#!/usr/bin/env node
// `npm run check`'s full gate: typecheck, then the fast test tier, then the slow test tier.
// Kept as separate sequential steps (not shell `&&`) so each still reports its own shared
// dev-metrics entry via its own npm script. CI runs the same three steps
// (see .github/workflows/ci.yml) so `check` and CI always cover the same tests.
import { spawnSync } from "node:child_process";

// Each step is one fixed string run through the shell, because Windows starts npm (npm.cmd) only that way.
const steps = ["npm run typecheck", "npm run test", "npm run test:slow"];

for (const step of steps) {
  const r = spawnSync(step, { stdio: "inherit", shell: true });
  if (r.error) console.error(`run-check: could not start "${step}": ${r.error.message}`);
  if (r.status !== 0) process.exit(r.status ?? 1);
}
