import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown> };
type Job = { needs?: string | string[]; permissions: Record<string, string>; env?: Record<string, string>; steps: Step[] };

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const text = read(".github/workflows/release-finish.yml");
const workflow = parse(text);
const jobs: Record<string, Job> = workflow.jobs;
const allSteps = Object.values(jobs).flatMap((job) => job.steps);

/** The tag check's pattern in a workflow, so both workflows accept the same tags. */
const tagPatternOf = (steps: Step[]) => /=~ (\S+) \]\]/.exec(steps.find((step) => step.name === "Check the tag name")!.run!)![1];

describe("finish-a-release workflow", () => {
  it("runs only by hand", () => {
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
  });

  it("refuses anyone but the repository owner before any other step", () => {
    const ownerCheck = jobs.check!.steps[0]!;
    expect(ownerCheck.name).toBe("Check who started the run");
    expect(ownerCheck.run).toMatch(/test "\$TRIGGERING_ACTOR" = "\$OWNER"/);
    for (const [jobId, job] of Object.entries(jobs)) {
      if (jobId !== "check") expect([job.needs].flat()).toContain("check");
    }
  });

  it("gives each job only the permissions it needs", () => {
    expect(workflow.permissions).toEqual({});
    expect(jobs.check!.permissions).toEqual({ contents: "read" });
    expect(jobs.registry!.permissions).toEqual({ contents: "read", "id-token": "write" });
    expect(jobs["major-tag"]!.permissions).toEqual({ contents: "write" });
    // The pins PR is pushed and opened with the opendrs-bot token, so CI runs on it.
    expect(jobs.pins!.permissions).toEqual({ contents: "read" });
  });

  it("uses the opendrs-bot key only in the pins job, for a token narrowed to contents and pull requests", () => {
    for (const [jobId, job] of Object.entries(jobs)) {
      if (jobId !== "pins") expect(JSON.stringify(job)).not.toMatch(/secrets\./);
    }
    const mint = jobs.pins!.steps.find((step) => step.uses?.startsWith("actions/create-github-app-token@"))!;
    expect(mint.with).toMatchObject({ "permission-contents": "write", "permission-pull-requests": "write" });
    // Nothing is installed next to the token: no npm ci or npm install in the job.
    expect(jobs.pins!.steps.map((step) => step.run ?? "").join("\n")).not.toMatch(/npm (ci|install)/);
  });

  it("moves the major tag only when asked, never for a prerelease, after the registry publish", () => {
    const majorTag = jobs["major-tag"] as Job & { if: string };
    expect(majorTag.if).toBe("inputs.move-major-tag && !contains(inputs.tag, '-')");
    expect(majorTag.needs).toEqual(["check", "registry"]);
    expect(workflow.on.workflow_dispatch.inputs["move-major-tag"]).toMatchObject({ type: "boolean", default: true });
  });

  it("pins the plugin and the dogfood action to the release tag's commit", () => {
    const runs = jobs.pins!.steps.map((step) => step.run ?? "").join("\n");
    expect(runs).toContain('node scripts/release.mjs pin-plugin "$VERSION"');
    expect(runs).toContain('node scripts/release.mjs pin-dogfood "$VERSION" "$(git rev-parse "refs/tags/$TAG^{commit}")"');
  });

  it("never puts an expression inside a shell script, where a value could run as code", () => {
    for (const step of allSteps) expect(step.run ?? "").not.toContain("${{");
  });

  it("accepts the same release tags as the npm publish workflow", () => {
    const publishSteps: Step[] = parse(read(".github/workflows/publish.yml")).jobs.publish.steps;
    expect(tagPatternOf(jobs.check!.steps)).toBe(tagPatternOf(publishSteps));
  });

  it("checks that npm serves the version before anything is published", () => {
    expect(jobs.check!.steps.map((step) => step.name)).toContain("Check that npm serves the version");
  });

  it("pins every action to a full commit sha", () => {
    const uses = allSteps.flatMap((step) => (step.uses ? [step.uses] : []));
    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses) expect(action).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });

  it("checks out the tag without keeping the GitHub token", () => {
    for (const jobId of ["check", "registry"]) {
      const checkout = jobs[jobId]!.steps.find((step) => step.uses?.startsWith("actions/checkout@"))!;
      expect(checkout.with).toMatchObject({ ref: "refs/tags/${{ env.TAG }}", "persist-credentials": false });
    }
  });

  it("verifies mcp-publisher's pinned digest before running it", () => {
    expect(jobs.registry!.env!.PUBLISHER_SHA256).toMatch(/^[0-9a-f]{64}$/);
    const runs = jobs.registry!.steps.map((step) => step.run ?? "").join("\n");
    expect(runs.indexOf("sha256sum -c")).toBeGreaterThanOrEqual(0);
    expect(runs.indexOf("sha256sum -c")).toBeLessThan(runs.indexOf("login github-oidc"));
  });

  it("never cancels a run that has started", () => {
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
  });
});
