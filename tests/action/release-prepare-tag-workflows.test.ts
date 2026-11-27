import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown> };
type Job = { needs?: string | string[]; permissions: Record<string, string>; steps: Step[] };

/** Reads a file relative to the repository root. */
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
/** Every step of every job in a parsed workflow. */
const stepsOf = (jobs: Record<string, Job>) => Object.values(jobs).flatMap((job) => job.steps);

const prepare = parse(read(".github/workflows/release-prepare.yml"));
const prepareJobs: Record<string, Job> = prepare.jobs;
const tag = parse(read(".github/workflows/release-tag.yml"));
const tagJobs: Record<string, Job> = tag.jobs;

describe("both release workflows", () => {
  it.each([
    ["prepare", prepareJobs],
    ["tag", tagJobs],
  ])("%s pins every action to a full commit sha and puts no expression inside a shell script", (_name, jobs) => {
    for (const step of stepsOf(jobs)) {
      if (step.uses) expect(step.uses).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(step.run ?? "").not.toContain("${{");
    }
  });

  it("grant nothing at the top level", () => {
    expect(prepare.permissions).toEqual({});
    expect(tag.permissions).toEqual({});
  });
});

describe("prepare-a-release workflow", () => {
  it("runs only by hand, and refuses anyone but the repository owner first", () => {
    expect(Object.keys(prepare.on)).toEqual(["workflow_dispatch"]);
    expect(prepareJobs.build!.steps[0]!.run).toMatch(/test "\$TRIGGERING_ACTOR" = "\$OWNER"/);
    expect(prepareJobs["pull-request"]!.needs).toBe("build");
  });

  it("builds with no secret and a read-only token, and mints the bot token only in a job that installs nothing", () => {
    expect(prepareJobs.build!.permissions).toEqual({ contents: "read" });
    expect(JSON.stringify(prepareJobs.build)).not.toMatch(/secrets\./);
    expect(prepareJobs["pull-request"]!.permissions).toEqual({ contents: "read" });
    const runs = prepareJobs["pull-request"]!.steps.map((step) => step.run ?? "").join("\n");
    expect(runs).not.toMatch(/npm (ci|install)/);
    const mint = prepareJobs["pull-request"]!.steps.find((step) => step.uses?.startsWith("actions/create-github-app-token@"))!;
    expect(mint.with).toMatchObject({ "permission-contents": "write", "permission-pull-requests": "write" });
  });

  it("accepts only the files release:prepare writes from the build job's patch", () => {
    const runs = prepareJobs["pull-request"]!.steps.map((step) => step.run ?? "").join("\n");
    expect(runs.indexOf("grep -vxE")).toBeGreaterThan(runs.indexOf("git apply"));
    expect(runs.indexOf("grep -vxE")).toBeLessThan(runs.indexOf("git push"));
  });
});

describe("tag-a-release workflow", () => {
  it("runs on pushes to main that change package.json, with only contents write", () => {
    expect(tag.on).toEqual({ push: { branches: ["main"], paths: ["package.json"] } });
    expect(tagJobs.tag!.permissions).toEqual({ contents: "write" });
    expect(read(".github/workflows/release-tag.yml")).not.toMatch(/secrets\./);
  });

  it("drafts the release and never publishes it or moves the major tag", () => {
    const runs = stepsOf(tagJobs).map((step) => step.run ?? "").join("\n");
    expect(runs).toMatch(/gh release create "v\$VERSION" --draft/);
    expect(runs).not.toMatch(/git tag -f|push -f/);
  });
});

describe("prepare-a-release checkouts", () => {
  it("runs only on main, and both jobs check out the run's own commit, never one the build job names", () => {
    expect(prepareJobs.build!.steps[1]!.run).toContain('test "$REF" = "refs/heads/main"');
    for (const job of Object.values(prepareJobs)) {
      const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"))!;
      expect(checkout.with).toMatchObject({ ref: "${{ github.sha }}", "persist-credentials": false });
    }
  });
});

describe("the dogfood workflow", () => {
  const steps: Step[] = parse(read(".github/workflows/opendrs.yml")).jobs.opendrs.steps;

  it("restores the pinned composite action from the PR's base commit before it runs", () => {
    const restore = steps.findIndex((step) => step.run === 'git checkout "$BASE_SHA" -- .github/actions/opendrs-release');
    const mint = steps.findIndex((step) => step.uses?.startsWith("actions/create-github-app-token@"));
    const opendrs = steps.findIndex((step) => step.uses === "./.github/actions/opendrs-release");
    expect(restore).toBeGreaterThan(0);
    expect(restore).toBeLessThan(mint);
    expect(mint).toBeLessThan(opendrs);
  });

  it("pins the composite's opendrs step to a full release commit", () => {
    expect(read(".github/actions/opendrs-release/action.yml")).toMatch(/uses: error-path\/opendrs@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
  });
});
