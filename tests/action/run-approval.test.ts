import { describe, expect, it, vi } from "vitest";
import { BOT, STALE_APPROVALS_DISMISSED } from "./fake-github.js";
import { APPROVAL_MARKER, ENABLED, result, run } from "./run-harness.js";

vi.mock("../../src/engine.js", () => ({ scoreDiff: vi.fn() }));
vi.mock("../../src/report/markdown.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/report/markdown.js")>()),
  renderMarkdown: vi.fn(() => "<!-- opendrs -->\n## Risk report"),
}));
describe("approval", () => {
  it("approves the scored head commit and enables auto-merge", async () => {
    const t = await run();
    await expect(t.promise).resolves.toMatchObject({ approved: true });
    const [review] = t.gh.ops("createReview");
    expect(review!.body).toMatchObject({ event: "APPROVE", commit_id: t.headSha });
    expect((review!.body as { body: string }).body).toContain(APPROVAL_MARKER);
    expect(t.gh.ops("enableAutoMerge").map((e) => e.body)).toEqual([{ id: "PR_node7", method: "MERGE", head: t.headSha }]);
    expect(t.gh.ops("enqueue")).toEqual([]);
  });

  it("sets the approved output to true only after it approved", async () => {
    const t = await run();
    await t.promise;
    expect(t.output()).toMatch(/^approved<<(\S+)\ntrue\n\1$/m);
  });

  // A workflow gates its own auto-merge on this output, not on `decision`, which ignores the safety rails.
  it("sets the approved output to false when a safety rail refuses an auto-approve decision", async () => {
    const t = await run({ headFiles: { "src/a.ts": "2\n", "action.yml": "x\n" } });
    await expect(t.promise).resolves.toMatchObject({ approved: false, decision: "auto-approve" });
    expect(t.output()).toMatch(/^approved<<(\S+)\nfalse\n\1$/m);
  });

  it("does not approve or merge when a new commit was pushed while it scored", async () => {
    const t = await run();
    t.gh.headSha = "f".repeat(40);
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.output()).toMatch(/^approved<<(\S+)\nfalse\n\1$/m);
    expect(t.gh.ops("getPull")).toHaveLength(1);
    expect(t.gh.ops("createReview")).toEqual([]);
    expect(t.gh.ops("enableAutoMerge")).toEqual([]);
    expect(t.log()).toMatch(/::notice::.*head moved/);
  });

  it("enqueues in the merge queue when mergeMethod is queue and the branch has one", async () => {
    const t = await run({ result: result(0.1, "green", "auto-approve", "queue"), gh: { mergeQueue: true } });
    await t.promise;
    expect(t.gh.ops("enqueue").map((e) => e.body)).toEqual([{ id: "PR_node7", head: t.headSha }]);
    expect(t.gh.ops("enableAutoMerge")).toEqual([]);
  });

  it("falls back to auto-merge when mergeMethod is queue but there is no merge queue", async () => {
    const t = await run({ result: result(0.1, "green", "auto-approve", "queue"), gh: { mergeQueue: false, mergeCommitAllowed: false } });
    await t.promise;
    expect(t.gh.ops("enqueue")).toEqual([]);
    expect(t.gh.ops("enableAutoMerge").map((e) => e.body)).toEqual([{ id: "PR_node7", method: "SQUASH", head: t.headSha }]);
    expect(t.log()).toContain("::notice::");
  });

  it("approves without merging when mergeMethod is none", async () => {
    const t = await run({ result: result(0.1, "green", "auto-approve", "none") });
    await t.promise;
    expect(t.gh.ops("createReview")).toHaveLength(1);
    expect(t.gh.ops("mergeSettings")).toEqual([]);
  });

  it("warns but keeps the approval when enabling auto-merge fails", async () => {
    const t = await run({ gh: { fail: new Set(["enableAutoMerge"]) } });
    await expect(t.promise).resolves.toMatchObject({ approved: true });
    expect(t.log()).toMatch(/::warning::.*auto-merge/i);
  });

  it("does not approve again when it already approved this head commit", async () => {
    const t = await run({
      gh: { reviews: [{ id: 5, body: `${APPROVAL_MARKER}\nok`, state: "APPROVED", user: BOT, commit_id: "PLACEHOLDER" }] },
    });
    t.gh.reviews[0]!.commit_id = t.headSha;
    await t.promise;
    expect(t.gh.ops("createReview")).toEqual([]);
  });

  it("does not approve when autoApprove is disabled in the base config", async () => {
    const t = await run({ baseConfig: {} });
    await expect(t.promise).resolves.toMatchObject({ approved: false, decision: "auto-approve" });
    expect(t.gh.ops("createReview")).toEqual([]);
  });

  it.each(["waiting-ai-review", "human-review"] as const)("does not approve when the decision is %s", async (decision) => {
    const t = await run({ result: result(0.1, "green", decision) });
    await t.promise;
    expect(t.gh.ops("createReview")).toEqual([]);
  });

  it.each([".github/workflows/ci.yml", ".opendrs.yml", ".opendrs/incidents.jsonl", "action.yml", "action/dist/index.js"])(
    "self-modification guard: never approves a PR touching %s",
    async (path) => {
      const t = await run({ headFiles: { "src/a.ts": "2\n", [path]: "x\n" } });
      await expect(t.promise).resolves.toMatchObject({ approved: false });
      expect(t.gh.ops("createReview")).toEqual([]);
      expect(t.log()).toContain(path);
      expect(t.gh.comments[0]!.body).toContain("self-modification guard");
    },
  );

  it("self-modification guard: trips when a guarded file is deleted or renamed away", async () => {
    const t = await run({ baseFiles: { ".github/workflows/ci.yml": "on: push\n" }, headFiles: { ".github/workflows/ci.yml": null, "ci.yml": "on: push\n" } });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.gh.ops("createReview")).toEqual([]);
  });

  it("self-modification guard: covers a custom model path from the base config", async () => {
    const t = await run({ baseConfig: { ...ENABLED, model: "models/drs.json" }, headFiles: { "models/drs.json": "{}" } });
    await t.promise;
    expect(t.gh.ops("createReview")).toEqual([]);
  });

  it("never approves a fork PR, and tolerates its read-only token", async () => {
    const t = await run({ fork: true, gh: { forbid: new Set(["createComment", "addLabels"]) } });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.gh.ops("createReview")).toEqual([]);
    expect(t.log()).toContain("fork");
  });

  it("warns about the repository setting when GitHub refuses the approval", async () => {
    const t = await run({ gh: { forbid: new Set(["createReview"]) } });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.log()).toMatch(/::warning::.*Allow GitHub Actions to create and approve pull requests/);
    expect(t.gh.ops("mergeSettings")).toEqual([]);
  });
});

describe("stale-approval protection on the base branch", () => {
  const NOT_VERIFIED = /::warning::.*Dismiss stale pull request approvals when new commits are pushed/;

  it("approves when a branch ruleset requires an approval and dismisses stale ones", async () => {
    const t = await run({ gh: { rules: [{ type: "required_signatures" }, STALE_APPROVALS_DISMISSED] } });
    await expect(t.promise).resolves.toMatchObject({ approved: true });
    expect(t.gh.ops("rules").map((e) => e.path)).toEqual(["/repos/o/r/rules/branches/main"]);
    expect(t.gh.ops("protection")).toEqual([]);
    expect(t.gh.ops("createReview")).toHaveLength(1);
  });

  it("approves when classic branch protection requires an approval and dismisses stale ones", async () => {
    const t = await run({
      gh: { rules: [], protection: { required_pull_request_reviews: { dismiss_stale_reviews: true, required_approving_review_count: 1 } } },
    });
    await expect(t.promise).resolves.toMatchObject({ approved: true });
    expect(t.gh.ops("protection").map((e) => e.path)).toEqual(["/repos/o/r/branches/main/protection"]);
    expect(t.gh.ops("createReview")).toHaveLength(1);
  });

  it("does not approve or merge when neither a ruleset nor branch protection dismisses stale approvals", async () => {
    const t = await run({ gh: { rules: [], protection: undefined } });
    await expect(t.promise).resolves.toMatchObject({ approved: false, decision: "auto-approve" });
    expect(t.gh.ops("createReview")).toEqual([]);
    expect(t.gh.ops("enableAutoMerge")).toEqual([]);
    expect(t.log()).toMatch(NOT_VERIFIED);
    expect(t.gh.comments[0]!.body).toMatch(/\*\*Auto-approval:\*\* not approved: .*main.*stale approvals/);
  });

  it.each([
    ["the ruleset does not dismiss stale approvals", { required_approving_review_count: 1, dismiss_stale_reviews_on_push: false }],
    ["the ruleset requires no approval", { required_approving_review_count: 0, dismiss_stale_reviews_on_push: true }],
  ])("does not approve when %s", async (_, parameters) => {
    const t = await run({ gh: { rules: [{ type: "pull_request", parameters }] } });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.gh.ops("createReview")).toEqual([]);
    expect(t.log()).toMatch(NOT_VERIFIED);
  });

  it("does not approve when classic protection dismisses stale approvals but requires none", async () => {
    const t = await run({
      gh: { rules: [], protection: { required_pull_request_reviews: { dismiss_stale_reviews: true, required_approving_review_count: 0 } } },
    });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.gh.ops("createReview")).toEqual([]);
  });

  it("treats 403 on both the rules and the protection as not verifiable: no approval, a warning, no failure", async () => {
    const t = await run({ gh: { forbid: new Set(["rules", "protection"]) } });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.gh.ops("createReview")).toEqual([]);
    expect(t.log()).toMatch(NOT_VERIFIED);
  });

  it("falls back to classic protection when the rules cannot be read", async () => {
    const t = await run({
      gh: { forbid: new Set(["rules"]), protection: { required_pull_request_reviews: { dismiss_stale_reviews: true, required_approving_review_count: 2 } } },
    });
    await expect(t.promise).resolves.toMatchObject({ approved: true });
  });

  it("withdraws its earlier approval and auto-merge when the protection is no longer in place", async () => {
    const t = await run({
      gh: {
        rules: [],
        reviews: [{ id: 1, body: `${APPROVAL_MARKER}\nok`, state: "APPROVED", user: BOT, commit_id: "old" }],
      },
    });
    await t.promise;
    expect(t.gh.ops("dismissReview")).toHaveLength(1);
    expect(t.gh.ops("disableAutoMerge")).toHaveLength(1);
  });

  it("does not read the branch settings when another rule already blocks approval", async () => {
    const t = await run({ result: result(0.45, "yellow", "human-review") });
    await t.promise;
    expect(t.gh.ops("rules")).toEqual([]);
  });
});
