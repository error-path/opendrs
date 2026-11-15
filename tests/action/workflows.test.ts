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

/** The opt-in workflow that comments on fork PRs: the only one triggered by `workflow_run`. */
const isForkWorkflow = (workflowText: string) => "workflow_run" in (parse(workflowText).on ?? {});
const forkWorkflows = docWorkflows.filter(isForkWorkflow);

/** The workflows that run the Action on `pull_request` events. */
const workflows: Array<[string, string]> = [
  [".github/workflows/opendrs.yml", read(".github/workflows/opendrs.yml")],
  ["opendrs init template", WORKFLOW_TEMPLATE],
  ...docWorkflows.filter((workflowText) => !isForkWorkflow(workflowText)).map((workflowText, index): [string, string] => [`docs/github-action.md workflow ${index + 1}`, workflowText]),
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

  it.each([...workflows, ...forkWorkflows.map((workflowText): [string, string] => ["docs/github-action.md fork workflow", workflowText]), ["action.yml", read("action.yml")] as [string, string]])("%s never uses pull_request_target", (_, text) => {
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
    // A set name, not GitHub's default (the bare file name), which says little in the Actions tab.
    expect(wf.name).toMatch(/[A-Z]/);
    expect(wf.name).not.toBe(file);
    for (const [id, job] of Object.entries<{ name?: string }>(wf.jobs)) {
      if (file === "ci" && id === "check") continue;
      expect(job.name, `${file}.yml job ${id}`).toMatch(/ /);
    }
  });

  it("the docs warn against pull_request_target", () => {
    expect(docs).toMatch(/`pull_request_target`[^.]*secrets/);
    expect(docs).toMatch(/Run it on `pull_request`, never on `pull_request_target`/);
    expect(docs).toMatch(/Do not switch to\s+`pull_request_target`/);
  });
});

describe("the opt-in fork workflow in the docs", () => {
  it("is the only workflow_run workflow shown", () => {
    expect(forkWorkflows).toHaveLength(1);
  });

  const text = forkWorkflows[0] ?? "";
  type Step = { uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, unknown> };
  type Job = { if?: string; needs?: string; permissions?: Record<string, string>; outputs?: Record<string, string>; steps: Step[]; "timeout-minutes"?: number };
  const workflow = parse(text) as { on: Record<string, { workflows: string[]; types: string[] }>; permissions: unknown; concurrency: Record<string, unknown>; jobs: Record<string, Job> };

  it("runs only when a workflow completes, and names the workflow the init template writes", () => {
    expect(Object.keys(workflow.on)).toEqual(["workflow_run"]);
    expect(workflow.on.workflow_run!.types).toEqual(["completed"]);
    expect(workflow.on.workflow_run!.workflows).toEqual([parse(WORKFLOW_TEMPLATE).name]);
  });

  it("grants nothing at the top level and has exactly the two jobs", () => {
    expect(workflow.permissions).toEqual({});
    expect(Object.keys(workflow.jobs)).toEqual(["score", "comment"]);
  });

  it("scores only for a pull_request run from a fork, with a read-only token and a timeout", () => {
    const score = workflow.jobs.score!;
    expect(score.if).toContain("github.event.workflow_run.event == 'pull_request'");
    expect(score.if).toContain("github.event.workflow_run.head_repository.full_name != github.repository");
    expect(score.permissions).toEqual({ contents: "read", "pull-requests": "read" });
    expect(score["timeout-minutes"]).toBeGreaterThan(0);
    expect(score.outputs).toEqual({ result: "${{ steps.opendrs.outputs.result }}" });
  });

  it("checks out the base repository only: full history, no stored credentials, no ref from the event", () => {
    const steps = workflow.jobs.score!.steps;
    expect(steps).toHaveLength(2);
    expect(steps[0]!.uses).toMatch(/^actions\/checkout@/);
    expect(steps[0]!.with).toEqual({ "fetch-depth": 0, "persist-credentials": false });
    expect(steps[1]!.with).toEqual({ mode: "score-only" });
  });

  it("comments with only pull-requests and issues write, without a checkout, from the score job's result", () => {
    const comment = workflow.jobs.comment!;
    expect(comment.needs).toBe("score");
    expect(comment.if).toBe("needs.score.outputs.result != ''");
    expect(comment.permissions).toEqual({ "pull-requests": "write", issues: "write" });
    expect(comment["timeout-minutes"]).toBeGreaterThan(0);
    expect(comment.steps).toHaveLength(1);
    expect(comment.steps[0]!.uses).toMatch(/^error-path\/opendrs@/);
    expect(comment.steps[0]!.with).toEqual({ mode: "fork-comment", result: "${{ needs.score.outputs.result }}" });
  });

  it("has no run step, secret, cache, artifact, LLM key or unsafe checkout anywhere", () => {
    for (const job of Object.values(workflow.jobs)) for (const step of job.steps) expect(step.run).toBeUndefined();
    expect(text).not.toMatch(/secrets\.|actions\/cache|download-artifact|upload-artifact|llm-api-key|allow-unsafe-pr-checkout|pull_request_target|refs\/pull/);
    // The only expressions are the trigger filter, the concurrency group and the result hand-over.
    for (const expression of text.matchAll(/\$\{\{([^}]*)\}\}/g)) {
      expect(expression[1]!.trim()).toMatch(/^(github\.event\.workflow_run\.head_repository\.full_name|github\.event\.workflow_run\.head_branch|steps\.opendrs\.outputs\.result|needs\.score\.outputs\.result)$/);
    }
  });

  it("pins every action to a full commit SHA; opendrs carries a placeholder to replace with a release commit", () => {
    const uses = Object.values(workflow.jobs).flatMap((job) => job.steps.flatMap((step) => (step.uses ? [step.uses] : [])));
    expect(uses).toHaveLength(3);
    for (const reference of uses) {
      if (reference.startsWith("error-path/opendrs@")) expect(reference).toBe("error-path/opendrs@REPLACE_WITH_RELEASE_COMMIT_SHA");
      else expect(reference).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    }
    expect(text).toMatch(/actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1/);
    // Never a tag or branch that can be moved.
    expect(text).not.toMatch(/@v\d|@main|@master/);
  });

  it("cancels the older run for the same fork branch", () => {
    expect(workflow.concurrency["cancel-in-progress"]).toBe(true);
    expect(workflow.concurrency.group).toContain("github.event.workflow_run.head_branch");
  });

  it("action.yml declares the mode and result inputs and the result output", () => {
    const action = parse(read("action.yml"));
    expect(action.inputs.mode).toMatchObject({ required: false, default: "full" });
    expect(action.inputs.result).toMatchObject({ required: false, default: "" });
    expect(action.outputs.result.description).toMatch(/score-only/);
    expect(docs).toMatch(/\| `mode` \| `full` \|/);
  });
});
