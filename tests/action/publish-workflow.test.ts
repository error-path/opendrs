import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const text = readFileSync(new URL("../../.github/workflows/publish.yml", import.meta.url), "utf8");
const wf = parse(text);
const job = wf.jobs.publish;
const steps: Array<{ name?: string; uses?: string; run?: string; with?: Record<string, unknown> }> = job.steps;

/** The tag check's pattern, taken from the workflow so the test follows any change to it. */
const tagPattern = new RegExp(/=~ (\S+) \]\]/.exec(steps.find((s) => s.name === "Check the tag name")!.run!)![1]!);

describe("npm publish workflow", () => {
  it("runs only for a published release or by hand, never for a push or a pull request", () => {
    expect(Object.keys(wf.on).sort()).toEqual(["release", "workflow_dispatch"]);
    expect(wf.on.release.types).toEqual(["published"]);
  });

  it("uses an OIDC token, never a stored npm token or other secret", () => {
    expect(wf.permissions).toEqual({ contents: "read" });
    expect(job.permissions).toEqual({ contents: "read", "id-token": "write" });
    expect(text).not.toMatch(/secrets\.|NODE_AUTH_TOKEN|NPM_TOKEN/);
  });

  it("runs in the npm environment that npm's trusted publisher entry names", () => {
    expect(job.environment).toBe("npm");
  });

  it("pins every action to a full commit sha", () => {
    const uses = steps.flatMap((s) => (s.uses ? [s.uses] : []));
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });

  it("checks out the tag without keeping the GitHub token", () => {
    const checkout = steps.find((s) => s.uses?.startsWith("actions/checkout@"))!;
    expect(checkout.with).toMatchObject({ ref: "refs/tags/${{ env.TAG }}", "persist-credentials": false });
  });

  it("never cancels a publish that has started", () => {
    expect(wf.concurrency["cancel-in-progress"]).toBe(false);
  });

  it("checks the tag is on main and matches package.json before publishing", () => {
    const names = steps.map((s) => s.name ?? s.run ?? s.uses);
    const check = names.indexOf("Check that the tag is on main and matches package.json");
    expect(check).toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThan(names.indexOf("Stage"));
  });

  it("only stages a version, so it goes live only after a maintainer approves it with 2FA", () => {
    // Commands only: the step summary `echo`s tell the maintainer to run `npm stage approve`.
    const runs = steps
      .flatMap((s) => (s.run ?? "").split("\n"))
      .filter((line) => !/^\s*echo\b/.test(line))
      .join("\n");
    expect(runs).toMatch(/npm stage publish/);
    // Any `npm publish` not preceded by `stage` would publish directly, past the approval.
    expect(runs.replace(/npm stage publish/g, "")).not.toMatch(/npm\s+publish/);
    expect(runs).not.toMatch(/npm\s+(stage\s+approve|dist-tag)/);
  });

  it.each(["v0.5.2", "v1.0.0", "v1.2.3-rc.1"])("accepts the release tag %s", (tag) => {
    expect(tagPattern.test(tag)).toBe(true);
  });

  it.each(["0.5.2", "v0.5", "main", "v1.0.0;id", "v1.0.0 x", "v1.0.0\nx", "v1.0.0$(id)", "refs/tags/v1.0.0"])(
    "refuses %j as a tag",
    (tag) => {
      // Like bash's =~, a JS RegExp without the m flag anchors ^ and $ to the whole value.
      expect(tagPattern.test(tag)).toBe(false);
    },
  );
});
