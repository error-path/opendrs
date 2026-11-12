import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { WORKFLOW_TEMPLATE } from "../../src/cli/templates.js";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const docs = read("docs/github-action.md");

/** Every complete workflow (has `on:` and `jobs:`) shown in the Action docs. `\r?`: a Windows checkout uses CRLF. */
const docWorkflows = [...docs.matchAll(/```yaml\r?\n([\s\S]*?)```/g)]
  .map((m) => m[1]!)
  .filter((y) => /^on:/m.test(y) && /^jobs:/m.test(y));

const workflows: Array<[string, string]> = [
  [".github/workflows/opendrs.yml", read(".github/workflows/opendrs.yml")],
  ["opendrs init template", WORKFLOW_TEMPLATE],
  ...docWorkflows.map((y, i): [string, string] => [`docs/github-action.md workflow ${i + 1}`, y]),
];

describe("workflows that run the Action", () => {
  it("the docs show at least the minimal and the AI-review workflow", () => {
    expect(docWorkflows.length).toBeGreaterThanOrEqual(2);
  });

  it.each(workflows)("%s cancels a run superseded by a newer push to the same PR, but never a sweep", (_, text) => {
    const wf = parse(text);
    // Sweeps share the group (no PR number); cancelling one every 15 minutes would starve long sweeps.
    const cancel = "schedule" in wf.on ? "${{ github.event_name == 'pull_request' }}" : true;
    expect(wf.concurrency).toEqual({ group: "opendrs-${{ github.event.pull_request.number }}", "cancel-in-progress": cancel });
  });

  it.each([...workflows, ["action.yml", read("action.yml")] as [string, string]])("%s never uses pull_request_target", (_, text) => {
    const on = parse(text).on ?? {};
    expect(Object.keys(on)).not.toContain("pull_request_target");
  });

  it("action.yml declares and the docs describe the sample-salt input", () => {
    expect(parse(read("action.yml")).inputs["sample-salt"]).toMatchObject({ required: false, default: "" });
    expect(docs).toMatch(/\| `sample-salt` \|.*secret/);
  });

  it("CI fails when the committed action bundle is stale or missing", () => {
    const steps: Array<{ run?: string }> = parse(read(".github/workflows/ci.yml")).jobs.check.steps;
    const runs = steps.map((s) => s.run ?? "");
    const build = runs.indexOf("npm run build:action");
    expect(build).toBeGreaterThanOrEqual(0);
    // `git diff` misses an untracked (never committed) bundle; `git status --porcelain` does not.
    expect(runs.slice(build + 1)).toContain('test -z "$(git status --porcelain action/dist)"');
  });

  it("CI keeps the job id `check` that the main ruleset's required checks name", () => {
    const check = parse(read(".github/workflows/ci.yml")).jobs.check;
    expect(check.strategy.matrix.node).toEqual([22, 24]);
    // A job name would replace `check (22)` and `check (24)` as the check names.
    expect(check.name).toBeUndefined();
  });

  it.each(["ci", "opendrs", "pages", "publish"])("this repo's %s workflow and its jobs have descriptive names", (file) => {
    const wf = parse(read(`.github/workflows/${file}.yml`));
    expect(wf.name).toMatch(/[A-Z].* |^CI$/);
    for (const [id, job] of Object.entries<{ name?: string }>(wf.jobs)) {
      if (file === "ci" && id === "check") continue;
      expect(job.name, `${file}.yml job ${id}`).toMatch(/ /);
    }
  });

  it("the docs warn against pull_request_target", () => {
    expect(docs).toMatch(/`pull_request_target`[^.]*secrets/);
  });
});
